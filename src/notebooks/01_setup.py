# Databricks notebook source
# MAGIC %md
# MAGIC # Setup — run the DDL + seed (`src/sql/*.sql`) on serverless
# MAGIC
# MAGIC Executes `01_setup_metadata.sql` then `02_seed_metadata.sql` so the demo is fully
# MAGIC self-contained: a single `databricks bundle run` creates the catalog/schemas/volumes,
# MAGIC the metadata tables and the seed rows — no SQL editor step required.
# MAGIC
# MAGIC The `.sql` files remain the single source of truth; this notebook just runs them
# MAGIC statement-by-statement via `spark.sql`. It reads them from the bundle's synced
# MAGIC workspace files, so it works wherever the bundle is deployed.

# COMMAND ----------

import os


def find_sql_dir() -> str:
    """Locate src/sql relative to this notebook's deployed location."""
    ctx = dbutils.notebook.entry_point.getDbutils().notebook().getContext()  # noqa: F821
    nb_path = ctx.notebookPath().get()  # e.g. /Users/.../files/src/notebooks/01_setup
    files_root = nb_path.split("/src/notebooks/")[0]  # /Users/.../files
    # Workspace files are mounted under /Workspace for reading.
    candidates = [f"/Workspace{files_root}/src/sql", f"{files_root}/src/sql"]
    for c in candidates:
        if os.path.isdir(c):
            return c
    raise FileNotFoundError(f"Could not locate src/sql. Tried: {candidates}")


SQL_DIR = find_sql_dir()
print(f"SQL dir: {SQL_DIR}")

# COMMAND ----------


def split_statements(sql_text: str) -> list[str]:
    """Strip full-line `--` comments, then split on `;` — but only when NOT inside a
    single-quoted string. COMMENT clauses and descriptions in these files contain
    semicolons (e.g. 'faithful capture; type at Silver'), so a quote-aware split is
    required. Handles the SQL '' escape for a literal quote inside a string."""
    lines = [ln for ln in sql_text.splitlines() if not ln.strip().startswith("--")]
    text = "\n".join(lines)

    statements, buf, in_str = [], [], False
    i, n = 0, len(text)
    while i < n:
        ch = text[i]
        if ch == "'":
            if in_str and i + 1 < n and text[i + 1] == "'":  # escaped quote ''
                buf.append("''")
                i += 2
                continue
            in_str = not in_str
            buf.append(ch)
        elif ch == ";" and not in_str:
            stmt = "".join(buf).strip()
            if stmt:
                statements.append(stmt)
            buf = []
        else:
            buf.append(ch)
        i += 1
    tail = "".join(buf).strip()
    if tail:
        statements.append(tail)
    return statements


def run_sql_file(filename: str):
    path = f"{SQL_DIR}/{filename}"
    with open(path, "r", encoding="utf-8") as f:
        text = f.read()
    statements = split_statements(text)
    print(f"\n=== {filename}: {len(statements)} statements ===")
    for i, stmt in enumerate(statements, 1):
        preview = " ".join(stmt.split())[:90]
        # The catalog is a prerequisite (created out-of-band with a managed location, as
        # required on Default-Storage accounts). Skip CREATE CATALOG here; the statement
        # stays in the .sql file so it remains portable to standard metastores.
        if " ".join(stmt.split()).lower().startswith("create catalog"):
            print(f"[{i}/{len(statements)}] SKIP (catalog is a pre-req): {preview} ...")
            continue
        print(f"[{i}/{len(statements)}] {preview} ...")
        spark.sql(stmt)  # noqa: F821


# COMMAND ----------

run_sql_file("01_setup_metadata.sql")
run_sql_file("02_seed_metadata.sql")

# COMMAND ----------

# MAGIC %md ## Reset demo state (reproducible full runs)
# MAGIC Drops the Bronze tables and clears Auto Loader checkpoints so a full `bundle run`
# MAGIC always reproduces the same result. (To instead demonstrate exactly-once across
# MAGIC restarts, re-run only the `run_framework` task — checkpoints then persist.)

# COMMAND ----------

for t in spark.sql("SHOW TABLES IN autoloader_demo.bronze").collect():  # noqa: F821
    spark.sql(f"DROP TABLE IF EXISTS autoloader_demo.bronze.{t['tableName']}")  # noqa: F821
    print(f"dropped bronze.{t['tableName']}")

ckpt = "/Volumes/autoloader_demo/landing/checkpoints"
try:
    for f in dbutils.fs.ls(ckpt):  # noqa: F821
        dbutils.fs.rm(f.path, True)  # noqa: F821
        print(f"cleared checkpoint {f.path}")
except Exception as e:  # noqa: BLE001
    print(f"checkpoint dir empty or new: {e}")

# COMMAND ----------

print("Object registry:")
spark.sql("SELECT object_id, object_type, file_format, target_table FROM autoloader_demo.metadata.object ORDER BY object_type, object_id").show(truncate=False)  # noqa: F821
print("Operations:")
spark.sql("SELECT operation_id, source_object_id, load_type, cast_all_as_string, explode_key FROM autoloader_demo.metadata.operation ORDER BY operation_id").show(truncate=False)  # noqa: F821

# COMMAND ----------

dbutils.notebook.exit("setup complete")  # noqa: F821
