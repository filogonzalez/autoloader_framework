# Databricks notebook source
# MAGIC %md
# MAGIC # Run the Demo
# MAGIC
# MAGIC Iterates over every enabled operation in `<catalog>.metadata.operation` and
# MAGIC invokes the framework notebook (`10_ingestion_framework`) once per operation — the
# MAGIC same way a Lakeflow Job scheduler would, one task per `operation_id`.
# MAGIC
# MAGIC Order of execution for a clean demo:
# MAGIC 1. `01_setup_metadata.sql`      (catalog/schemas/volumes/tables)
# MAGIC 2. `02_seed_metadata.sql`       (register the demo sources)
# MAGIC 3. `00_generate_sample_data`    (write raw files to the landing volume)
# MAGIC 4. **this notebook**            (run the framework over every operation)

# COMMAND ----------

from pyspark.sql import functions as F

# Catalog is the single configurable value; driven by the `catalog` job parameter
# (bundle variable `var.catalog`, default `autoloader_console`). Forwarded verbatim to the
# framework notebook below, which derives its metadata_catalog + checkpoint_root from it —
# so one `catalog` retargets reads, writes and checkpoints across all notebooks.
dbutils.widgets.text("catalog", "autoloader_console", "UC catalog")  # noqa: F821
CATALOG = dbutils.widgets.get("catalog").strip()  # noqa: F821

META = f"{CATALOG}.metadata"
FRAMEWORK_NOTEBOOK = "10_ingestion_framework"

# COMMAND ----------

# Dependency-aware ordering, driven entirely by metadata (no per-operation logic).
#
# Some operations consume what another operation produces: a Delta-table-as-source
# (source_format='delta') reads FROM a Bronze table that is itself the target of
# another enabled operation in the same pass. Running consumer-before-producer fails
# with [TABLE_OR_VIEW_NOT_FOUND]. We discover those edges generically by matching a
# delta source's table name to another op's target table, then topologically sort so
# every producer runs before its consumer. Independent ops keep their operation_id
# order for a stable, reproducible demo.
ops_df = spark.table(f"{META}.operation").filter("enabled = true")
obj = spark.table(f"{META}.object")

# object_id -> (source_format, source_table_fq, target_fq). For a delta source the
# fully-qualified source table is stored in file_path (same column build_reader uses);
# for a target it is target_catalog.target_schema.target_table.
src_rows = {
    r["object_id"]: r.asDict()
    for r in obj.filter("object_type = 'source'").collect()
}
tgt_rows = {
    r["object_id"]: r.asDict()
    for r in obj.filter("object_type = 'target'").collect()
}


def _target_fq(target_object_id):
    t = tgt_rows.get(target_object_id)
    if not t:
        return None
    return f"{t['target_catalog']}.{t['target_schema']}.{t['target_table']}"


# Map each enabled op to the FQ table it produces, and the FQ table a delta source reads.
op_meta = {}
for r in ops_df.collect():
    o = r.asDict()
    s = src_rows.get(o["source_object_id"], {})
    source_format = (s.get("source_format") or "cloudFiles")
    reads_table = s.get("file_path") if source_format == "delta" else None
    op_meta[o["operation_id"]] = {
        "produces": _target_fq(o["target_object_id"]),
        "reads_table": reads_table,
    }

# Index producers by the table they create, then build consumer -> producers edges.
producers_by_table = {}
for op_id, m in op_meta.items():
    if m["produces"]:
        producers_by_table.setdefault(m["produces"], []).append(op_id)

deps = {op_id: set() for op_id in op_meta}
for op_id, m in op_meta.items():
    if m["reads_table"]:
        for producer in producers_by_table.get(m["reads_table"], []):
            if producer != op_id:  # ignore an op that streams its own target
                deps[op_id].add(producer)

# Deterministic topological sort: at each step run the ready op with the smallest id.
operations, remaining = [], dict(deps)
while remaining:
    ready = sorted(op for op, d in remaining.items() if d <= set(operations))
    if not ready:
        # A cycle (or a dependency on a disabled op) — fall back to id order for the
        # rest so the demo still runs every enabled operation.
        ready = sorted(remaining)
        print(f"WARNING: unresolved ordering for {ready}; falling back to id order.")
    nxt = ready[0]
    operations.append(nxt)
    remaining.pop(nxt)

print(f"Enabled operations (dependency-ordered): {operations}")

# COMMAND ----------

import json

results = {}
for op in operations:
    print(f"\n=== Running {op} ===")
    try:
        out = dbutils.notebook.run(
            FRAMEWORK_NOTEBOOK,
            0,
            {"operation_id": op, "catalog": CATALOG},
        )
        print(out)
        results[op] = json.loads(out) if out.strip().startswith("{") else {"status": "SUCCESS", "raw": out}
    except Exception as e:  # noqa: BLE001
        print(f"FAILED: {e}")
        results[op] = {"status": "FAILED", "error": str(e)[:500]}

# COMMAND ----------

# MAGIC %md ## Audit log — every run, success or failure

# COMMAND ----------

display(
    spark.table(f"{META}.ingestion_audit_log").orderBy(F.col("run_ts").desc())
)

# COMMAND ----------

# MAGIC %md ## Inspect the Bronze tables

# COMMAND ----------

table_counts = {}
for tbl in [
    "pos_transactions",
    "supplier_acme_inventory",
    "crm_customers",
    "supplier_edi_orders",
    "clickstream_events",
    "loyalty_history",
    "product_catalog",
    "store_locations",
]:
    fq = f"{CATALOG}.bronze.{tbl}"
    if spark.catalog.tableExists(fq):
        cnt = spark.table(fq).count()
        table_counts[tbl] = cnt
        print(f"\n### {fq}  (count={cnt})")
        spark.table(fq).show(truncate=False)
    else:
        table_counts[tbl] = None

# COMMAND ----------

# MAGIC %md
# MAGIC ### What to point out in the demo
# MAGIC - **One notebook, many sources.** No per-source code — only metadata rows differ.
# MAGIC - **`store_locations`** shows the simplest onboarding path: header CSV + append metadata.
# MAGIC - **`loyalty_history`** landed 2018 (numeric tier) and 2024 (string tier) together,
# MAGIC   all columns as STRING. No failure, no mixed-partition mess.
# MAGIC - **`crm_customers`** merged on `customer_id` — C002 updated in place, C003 inserted.
# MAGIC - **`clickstream_events`** exploded the `events[]` array into one row per event.
# MAGIC - **`product_catalog`** uses overwrite because each vendor file is a full snapshot.
# MAGIC - **`_rescued_data`** column captures anything off-schema instead of dropping it.
# MAGIC - **Re-run this notebook**: Auto Loader checkpoints skip already-processed files,
# MAGIC   so counts stay stable — exactly-once, for free.

# COMMAND ----------

# Machine-readable summary surfaced as the job task output.
summary = {
    "operations": results,
    "table_counts": table_counts,
    "all_success": all(v.get("status") == "SUCCESS" for v in results.values()),
}
print(json.dumps(summary, indent=2))
dbutils.notebook.exit(json.dumps(summary))
