# Databricks notebook source
# MAGIC %md
# MAGIC # Metadata-Driven Auto Loader Ingestion Framework
# MAGIC
# MAGIC One parameterized notebook that can ingest **any** source. The only runtime input is
# MAGIC `operation_id`. Everything else — cloud path, file format, schema, write mode, schema
# MAGIC evolution and parsing quirks — is resolved from the metadata tables at runtime.
# MAGIC
# MAGIC **A pipeline runs. A framework governs.** Onboarding a new source is a metadata
# MAGIC INSERT (see `02_seed_metadata.sql`), never a code change.
# MAGIC
# MAGIC Pillars (from the source article):
# MAGIC 1. Files processed exactly once — Auto Loader checkpoints
# MAGIC 2. Every format, one reader — format options come from config
# MAGIC 3. Historical loads survive schema drift — `cast_all_as_string`
# MAGIC 4. Schema changes without warning — `schema_evolution_mode`
# MAGIC 5. Unexpected data never disappears — `_rescued_data`
# MAGIC 6. Parsing quirks live in configuration, not code

# COMMAND ----------

import json
import time

from pyspark.sql import DataFrame, SparkSession
from pyspark.sql import functions as F
from pyspark.sql.types import StructType
from delta.tables import DeltaTable

spark = SparkSession.builder.getOrCreate()

# COMMAND ----------

import re

dbutils.widgets.text("operation_id", "", "Operation ID")
# `catalog` is the single retarget knob — same name + default as the other notebooks and the
# job-level `catalog` parameter. metadata_catalog/checkpoint_root are optional overrides; left
# blank (the default) they DERIVE from `catalog`, so a direct run of this notebook with a custom
# catalog honors it without touching the other widgets.
dbutils.widgets.text("catalog", "autoloader_console", "UC catalog")
dbutils.widgets.text("metadata_catalog", "", "Metadata catalog (blank = use catalog)")
dbutils.widgets.text("metadata_schema", "metadata", "Metadata schema")
dbutils.widgets.text("checkpoint_root", "", "Checkpoint root (blank = /Volumes/<catalog>/landing/checkpoints)")

OPERATION_ID = dbutils.widgets.get("operation_id").strip()
CATALOG = dbutils.widgets.get("catalog").strip() or "autoloader_console"
# Fail fast on an empty / non-identifier catalog instead of building invalid SQL/paths.
if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", CATALOG):
    raise ValueError(f"Invalid catalog '{CATALOG}' — expected an identifier [A-Za-z_][A-Za-z0-9_]*")
METADATA_CATALOG = dbutils.widgets.get("metadata_catalog").strip() or CATALOG
META = f"{METADATA_CATALOG}.{dbutils.widgets.get('metadata_schema').strip()}"
CHECKPOINT_ROOT = (
    dbutils.widgets.get("checkpoint_root").strip() or f"/Volumes/{CATALOG}/landing/checkpoints"
).rstrip("/")

if not OPERATION_ID:
    raise ValueError("operation_id widget is required.")

# COMMAND ----------

# MAGIC %md ## Step 1 — Load config from metadata
# MAGIC Read the operation, then its source and target objects. Flatten into one config
# MAGIC dict. Nothing downstream is hardcoded.

# COMMAND ----------


def load_config(spark: SparkSession, operation_id: str) -> dict:
    ops = (
        spark.table(f"{META}.operation")
        .filter((F.col("operation_id") == operation_id) & (F.col("enabled") == True))  # noqa: E712
        .collect()
    )
    if not ops:
        raise ValueError(f"Operation '{operation_id}' not found or disabled in {META}.operation.")
    o = ops[0].asDict()

    src = spark.table(f"{META}.object").filter(F.col("object_id") == o["source_object_id"]).collect()
    if not src:
        raise ValueError(f"Source object '{o['source_object_id']}' not found.")
    s = src[0].asDict()

    tgt = spark.table(f"{META}.object").filter(F.col("object_id") == o["target_object_id"]).collect()
    if not tgt:
        raise ValueError(f"Target object '{o['target_object_id']}' not found.")
    t = tgt[0].asDict()

    # Streaming source discriminator. cloudFiles (Auto Loader over files) is the default
    # so the six existing seeded sources keep working when source_format is NULL/absent.
    # delta reads a Delta TABLE as a stream (file_path holds the FQ table name).
    source_format = (s.get("source_format") or "cloudFiles").strip()

    # Resolve the full source path. With a storage_account -> abfss (article-faithful);
    # without one -> file_path is used verbatim, which supports UC Volumes for the demo
    # and, for a delta source, the fully-qualified table name catalog.schema.table.
    if s.get("storage_account"):
        full_path = (
            f"abfss://{s['container']}@{s['storage_account']}.dfs.core.windows.net"
            f"{s['file_path']}{s.get('wildcard_pattern') or ''}"
        )
    else:
        full_path = f"{s['file_path']}{s.get('wildcard_pattern') or ''}"

    # Explicit schema parsed from JSON DDL when supplied (headerless CSV / legacy files).
    schema = None
    if s.get("object_schema"):
        schema = StructType.fromJson(json.loads(s["object_schema"]))

    def csv_list(val):
        return [x.strip() for x in (val or "").split(",") if x.strip()]

    return {
        "operation_id": operation_id,
        "source_id": s["object_id"],
        "source_format": source_format,
        "full_path": full_path,
        "file_format": s["file_format"],
        "row_tag": s.get("row_tag"),
        "schema": schema,
        "delimiter": s.get("delimiter") or ",",
        "encoding": s.get("encoding") or "UTF-8",
        "null_value": s.get("null_value") if s.get("null_value") is not None else "",
        "fq_table": f"{t['target_catalog']}.{t['target_schema']}.{t['target_table']}",
        "table_path": t.get("table_path"),
        "partition_cols": csv_list(t.get("partition_cols")),
        "merge_keys": csv_list(t.get("merge_keys")),
        "load_type": o["load_type"],
        "merge_schema": bool(o["merge_schema"]),
        "schema_evolution_mode": o["schema_evolution_mode"],
        "cast_all_as_string": bool(o["cast_all_as_string"]),
        "multiline": bool(o["multiline"]),
        "case_sensitive": bool(o["case_sensitive"]),
        "max_files_per_trigger": o.get("max_files_per_trigger"),
        "explode_key": o.get("explode_key"),
    }


# COMMAND ----------

# MAGIC %md ## Step 2 — Build format options dynamically
# MAGIC All format variation collapses into one config-driven options dict. No
# MAGIC format-specific branches anywhere else in the framework.

# COMMAND ----------

_INFERABLE = {"csv", "json", "jsonl", "xml"}


def build_format_options(cfg: dict) -> dict:
    fmt = cfg["file_format"]

    # Auto Loader rejects schemaEvolutionMode=addNewColumns when an explicit schema is
    # supplied (use schemaHints instead). For explicit-schema sources we fall back to
    # `none`; off-schema data is still preserved via the rescued-data column.
    evolution_mode = cfg["schema_evolution_mode"]
    if cfg["schema"] is not None and evolution_mode == "addNewColumns":
        evolution_mode = "none"

    # Note: Auto Loader has no `cloudFiles.caseSensitive` option (it rejects unknown
    # keys). Case sensitivity, when needed, is a Spark conf (spark.sql.caseSensitive);
    # for faithful Bronze capture we leave it at the default. The `case_sensitive`
    # metadata column is retained for downstream/Silver use.
    base = {
        "cloudFiles.schemaEvolutionMode": evolution_mode,
        "cloudFiles.rescuedDataColumn": "_rescued_data",
    }
    if cfg["max_files_per_trigger"]:
        base["cloudFiles.maxFilesPerTrigger"] = str(cfg["max_files_per_trigger"])
    # inferColumnTypes only applies to inferable text formats.
    if fmt in _INFERABLE:
        base["cloudFiles.inferColumnTypes"] = str(not cfg["cast_all_as_string"]).lower()

    format_options = {
        "csv": {
            "cloudFiles.format": "csv",
            # header is false when an explicit schema is supplied (headerless supplier files)
            "header": "true" if cfg["schema"] is None else "false",
            "sep": cfg["delimiter"],
            "encoding": cfg["encoding"],
            "nullValue": cfg["null_value"],
        },
        "json": {
            "cloudFiles.format": "json",
            "multiLine": str(cfg["multiline"]).lower(),
            "allowComments": "true",
        },
        "jsonl": {
            "cloudFiles.format": "json",
            "multiLine": "false",
        },
        "parquet": {
            "cloudFiles.format": "parquet",
        },
        "avro": {
            "cloudFiles.format": "avro",
        },
        "xml": {
            "cloudFiles.format": "xml",
            "rowTag": cfg["row_tag"],
            "attributePrefix": "_",
            "valueTag": "_VALUE",
        },
    }
    if fmt not in format_options:
        raise ValueError(f"Unsupported file format: '{fmt}'")
    if fmt == "xml" and not cfg["row_tag"]:
        raise ValueError("XML sources require a row_tag in the object metadata.")

    return {**base, **format_options[fmt]}


# COMMAND ----------

# MAGIC %md ## Step 3 — Build the streaming reader
# MAGIC Path, schema and options all come from config. Adds faithful-capture casting,
# MAGIC optional array explode, and audit columns.

# COMMAND ----------


def build_reader(spark: SparkSession, cfg: dict, options: dict) -> DataFrame:
    if cfg["source_format"] == "delta":
        # Delta-table-as-source: stream a Bronze (or any Delta) table. file_path holds the
        # FQ table name. No cloudFiles options apply (a delta reader rejects them); none are
        # passed because build_format_options is skipped for delta sources upstream.
        df = spark.readStream.format("delta").table(cfg["full_path"])
    else:
        checkpoint_path = f"{CHECKPOINT_ROOT}/{cfg['operation_id']}"
        options["cloudFiles.schemaLocation"] = f"{checkpoint_path}/schema"

        reader = spark.readStream.format("cloudFiles")
        for key, value in options.items():
            reader = reader.option(key, value)

        # Explicit schema wins over inference.
        if cfg["schema"] is not None:
            reader = reader.schema(cfg["schema"])

        df = reader.load(cfg["full_path"])

    # Faithful historical capture: land everything as string, leave typing to Silver.
    if cfg["cast_all_as_string"]:
        df = df.select([F.col(c).cast("string").alias(c) for c in df.columns])

    # Nested JSON: explode a top-level array into one row per element.
    if cfg.get("explode_key"):
        df = df.select(F.explode(F.col(cfg["explode_key"])).alias("record")).select("record.*")

    # Audit columns on every row.
    df = (
        df.withColumn("_source_file", F.col("_metadata.file_path"))
        .withColumn("_ingested_at", F.current_timestamp())
        .withColumn("_operation_id", F.lit(cfg["operation_id"]))
    )
    return df


# COMMAND ----------

# MAGIC %md ## Step 4 — Route writes by load type
# MAGIC The only place write logic lives: append / merge / overwrite, all from config.

# COMMAND ----------


def write_batch(batch_df: DataFrame, batch_id: int, cfg: dict, counter: dict):
    if batch_df.isEmpty():
        return

    load_type = cfg["load_type"]
    fq_table = cfg["fq_table"]
    n = batch_df.count()
    counter["rows"] += n

    if load_type == "append":
        writer = batch_df.write.format("delta").mode("append")
        if cfg["merge_schema"]:
            writer = writer.option("mergeSchema", "true")
        if cfg["partition_cols"]:
            writer = writer.partitionBy(*cfg["partition_cols"])
        if cfg.get("table_path"):
            writer.save(cfg["table_path"])
            batch_df.sparkSession.sql(
                f"CREATE TABLE IF NOT EXISTS {fq_table} USING DELTA LOCATION '{cfg['table_path']}'"
            )
        else:
            writer.saveAsTable(fq_table)

    elif load_type == "merge":
        if not spark.catalog.tableExists(fq_table):
            # First run: seed the table so the merge target exists.
            w = batch_df.write.format("delta").mode("append")
            if cfg["merge_schema"]:
                w = w.option("mergeSchema", "true")
            w.saveAsTable(fq_table)
            return
        if cfg["merge_schema"]:
            spark.conf.set("spark.databricks.delta.schema.autoMerge.enabled", "true")
        condition = " AND ".join(f"t.{k} = s.{k}" for k in cfg["merge_keys"])
        (
            DeltaTable.forName(batch_df.sparkSession, fq_table)
            .alias("t")
            .merge(batch_df.alias("s"), condition)
            .whenMatchedUpdateAll()
            .whenNotMatchedInsertAll()
            .execute()
        )

    elif load_type == "overwrite":
        (
            batch_df.write.format("delta")
            .mode("overwrite")
            .option("overwriteSchema", "true")
            .saveAsTable(fq_table)
        )
    else:
        raise ValueError(f"Unknown load_type: '{load_type}'")


# COMMAND ----------

# MAGIC %md ## Step 5 — Entry point
# MAGIC `availableNow=True` processes every available file once, then stops cleanly. The
# MAGIC run is recorded to the audit log in the finally-block regardless of outcome.

# COMMAND ----------

start_ts = time.time()
status, error_msg = "SUCCESS", None
counter = {"rows": 0}

try:
    cfg = load_config(spark, OPERATION_ID)
    print(f"Resolved config for '{OPERATION_ID}':")
    print(json.dumps({k: (str(v) if k == "schema" else v) for k, v in cfg.items()}, indent=2, default=str))

    # Format options (and file_format validation) are a cloudFiles-only concern. A delta
    # source passes ZERO cloudFiles.* options (they would be rejected) and has no file_format.
    options = build_format_options(cfg) if cfg["source_format"] == "cloudFiles" else {}
    df = build_reader(spark, cfg, options)
    checkpoint_path = f"{CHECKPOINT_ROOT}/{OPERATION_ID}"

    query = (
        df.writeStream.trigger(availableNow=True)
        .option("checkpointLocation", checkpoint_path)
        .foreachBatch(lambda b, bid: write_batch(b, bid, cfg, counter))
        .start()
    )
    query.awaitTermination()

    # On Spark Connect (serverless) foreachBatch runs server-side, so the client-side
    # counter stays 0. Derive rows from the query progress instead.
    progress_rows = 0
    for p in (query.recentProgress or []):
        try:
            progress_rows += int(p["numInputRows"])
        except (TypeError, KeyError, ValueError):
            progress_rows += int(getattr(p, "numInputRows", 0) or 0)
    counter["rows"] = max(counter["rows"], progress_rows)
    print(f"Done. Rows ingested this run: {counter['rows']}")

except Exception as e:  # noqa: BLE001
    status, error_msg = "FAILED", str(e).replace("'", "''")
    raise
finally:
    duration_ms = int((time.time() - start_ts) * 1000)
    err_sql = f"'{error_msg}'" if error_msg else "NULL"
    spark.sql(
        f"""
        INSERT INTO {META}.ingestion_audit_log
        VALUES ('{OPERATION_ID}', current_timestamp(), '{status}',
                {duration_ms}, {counter['rows']}, {err_sql})
        """
    )

# COMMAND ----------

dbutils.notebook.exit(json.dumps({"operation_id": OPERATION_ID, "status": status, "rows_written": counter["rows"]}))
