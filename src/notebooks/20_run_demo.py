# Databricks notebook source
# MAGIC %md
# MAGIC # Run the Demo
# MAGIC
# MAGIC Iterates over every enabled operation in `autoloader_demo.metadata.operation` and
# MAGIC invokes the framework notebook (`10_ingestion_framework`) once per operation — the
# MAGIC same way a Lakeflow Job scheduler would, one task per `operation_id`.
# MAGIC
# MAGIC Order of execution for a clean demo:
# MAGIC 1. `01_setup_metadata.sql`      (catalog/schemas/volumes/tables)
# MAGIC 2. `02_seed_metadata.sql`       (register the seven demo sources)
# MAGIC 3. `00_generate_sample_data`    (write raw files to the landing volume)
# MAGIC 4. **this notebook**            (run the framework over every operation)

# COMMAND ----------

from pyspark.sql import functions as F

META = "autoloader_demo.metadata"
FRAMEWORK_NOTEBOOK = "10_ingestion_framework"

# COMMAND ----------

operations = [
    r["operation_id"]
    for r in spark.table(f"{META}.operation").filter("enabled = true").orderBy("operation_id").collect()
]
print(f"Enabled operations: {operations}")

# COMMAND ----------

import json

results = {}
for op in operations:
    print(f"\n=== Running {op} ===")
    try:
        out = dbutils.notebook.run(FRAMEWORK_NOTEBOOK, 0, {"operation_id": op})
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
]:
    fq = f"autoloader_demo.bronze.{tbl}"
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
# MAGIC - **One notebook, seven sources.** No per-source code — only metadata rows differ.
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
