# progress.md — cross-session memory (READ THIS FIRST)

> Future sessions read this file before doing anything. It is the running log of what worked,
> what broke, and the rules distilled from those lessons. Each lesson follows:
> **fail → investigate → verify → distill → consult.**
> Append new lessons at the top of "Lessons". Keep it honest; this is how the harness learns.

## How to use
1. Read this file + `.harness/CONTEXT.md` at session start.
2. Before re-deriving anything, check **Distilled rules** below — consult, don't re-derive.
3. When something surprises you: record the fail, investigate, verify the fix, distill a rule.
4. Promote durable rules into `AGENTS.md` so every session (not just harness-aware ones) sees them.

## Distilled rules (the cheat sheet — consult before acting)
- **Gate = `databricks bundle validate -t dev`.** There is no local unit-test runner; do not
  invent pytest. Verified ✅ returns `Validation OK!`.
- **Code runs on the platform, not locally.** The `.venv` is empty; PySpark/`dbutils` only exist
  in the Databricks runtime. Don't try to execute notebooks locally.
- **Notebooks are source files** in `# Databricks notebook source` format (`# COMMAND ----------`
  cells, `%md`/`%sql` magics). Edit as text; preserve cell markers.
- **One framework, config-driven.** New source = metadata `INSERT` in `02_seed_metadata.sql`
  (object + object + operation), NOT a new notebook. Keep `10_ingestion_framework.py` generic.
- **Bronze captures, never interprets.** No business typing/cleansing in this layer.
- **Auth = OAuth profiles + metadata service.** No API/model token in env. Programmatic model
  calls go through Model Serving (see `model.config.yaml`), never a lifted IDE key.
- **Destructive ops need confirmation:** drop, delete, overwrite, prod-write, force-push.
  `load_type: overwrite` operations and `bundle deploy/run` count.
- **Not a git repo yet.** The pre-commit secret/artifact hook is installable but inactive until
  `git init`; run `.harness/hooks/install.sh` after initializing.
- **Catalog is a pre-req (Default Storage metastore).** Don't `CREATE CATALOG` in jobs — it
  needs a managed location. Pre-create `autoloader_demo` via CLI; `01_setup.py` skips it.
- **Auto Loader option validity:** no `cloudFiles.caseSensitive`. `addNewColumns` is illegal
  with an explicit schema (use `none` + rescued data, or `schemaHints`).
- **Serverless = Spark Connect:** `foreachBatch` executes server-side; get run metrics from
  `query.recentProgress`, not client-side counters. SQL with semicolons-in-strings needs a
  quote-aware splitter.
- **Debug nested notebooks** via one-off `databricks jobs submit` + `jobs get-run-output`.

## Lessons (newest first)
### L3 — Streaming-source (delta-as-source) + abfss robustness (2026-06-16)
- **source_format column added** to `metadata.object` (`cloudFiles` default | `delta`).
  NULL/absent is treated as `cloudFiles` so the six existing seeded sources are unchanged.
  This is the generic discriminator the framework branches on — NOT a per-operation_id branch
  (passes `framework_is_generic.sh`).
- **Delta-table-as-source:** `build_reader` branches on `source_format`. For `delta` it uses
  `spark.readStream.format('delta').table(<fq_name>)` and **reuses `file_path`** to hold the
  FQ table name `catalog.schema.table` (chosen over a dedicated `source_table` column to keep
  the schema slim and the abfss/else path resolution unchanged — file_path already means "where
  to read"). `build_format_options` is SKIPPED for delta (zero cloudFiles.* options, which a
  delta reader rejects) and file_format validation is bypassed (delta sources have no format).
  `trigger(availableNow=True)` is preserved → the finally-block one-row-per-run audit lifecycle
  is intact. Seeded `op_pos_bronze_stream` streams the Bronze POS table into a Bronze replica.
- **abfss robustness:** fixed a latent `TypeError` — the abfss branch indexed
  `s['wildcard_pattern']` directly while the else branch guarded `or ''`; a NULL wildcard on an
  abfss source crashed. Both branches now use `s.get('wildcard_pattern') or ''`. Seeded a
  DISABLED abfss template (`src_abfss_template` / `op_abfss_template`) documenting the admin
  prereq (UC external location + storage credential, provisioned out-of-band; not metadata).
- **Kafka / continuous DEFERRED — explicitly:** `foreachBatch` rules out continuous mode, and a
  `processingTime` trigger would never terminate, breaking the finally-block audit lifecycle.
  Only `availableNow` is supported; revisit only if a long-running sink is ever required.
- **verify:** `bash .harness/evals/checks/framework_is_generic.sh` → PASS;
  `databricks bundle validate -t dev` → `Validation OK!`.

### L2 — First end-to-end deploy + run loop (2026-06-14)
- **fail → fix (4 iterations to green):**
  1. **`CREATE CATALOG` on Default Storage.** This metastore has no storage root +
     Default Storage enabled, so `CREATE CATALOG [IF NOT EXISTS]` errors ("Metastore
     storage root URL does not exist"). Even `IF NOT EXISTS` hit creation validation.
     **Fix:** pre-create the catalog out-of-band with a managed location
     (`databricks catalogs create autoloader_demo --storage-root abfss://unity-catalog-storage@dbstoragec6eloj427bzew.dfs.core.windows.net/7405612437610096/autoloader_demo`),
     and have `01_setup.py` **skip** any `CREATE CATALOG` statement. I own catalogs
     `clinical_intelligence` and `portpro_tms`; the classic external location is reusable.
  2. **Naive SQL split on `;`.** COMMENT/description strings contain semicolons
     (e.g. `'faithful capture; type at Silver'`). **Fix:** quote-aware splitter in
     `01_setup.py` (`split_statements`) that ignores `;` inside single-quoted strings
     and handles the `''` escape. Verify locally before deploy: balanced quote counts.
  3. **`cloudFiles.caseSensitive` is not a real Auto Loader option** → `CF_UNKNOWN_OPTION_KEYS_ERROR`.
     The article included it. **Fix:** removed it from `build_format_options`; kept the
     `case_sensitive` metadata column for Silver. (Case sensitivity = `spark.sql.caseSensitive`.)
  4. **`schemaEvolutionMode=addNewColumns` + explicit schema** → `CF_ADD_NEW_NOT_SUPPORTED`.
     **Fix:** framework forces evolution mode to `none` when an explicit schema is given
     (off-schema data still preserved via `_rescued_data`); seed for `op_supplier_acme`
     set to `none`.
- **Spark Connect gotcha:** `foreachBatch` runs **server-side** on serverless, so a
  client-side closure counter stays 0. Derive rows from `query.recentProgress`
  (`numInputRows`), not a Python counter mutated inside `foreachBatch`.
- **Idempotent demo:** regenerating files + random Parquet part-names would double-count
  on rerun. `01_setup.py` now drops Bronze tables + clears checkpoints so every full
  `bundle run` is reproducible; re-running only `run_framework` shows exactly-once.
- **Debugging child notebooks:** `dbutils.notebook.run` wraps child errors in an opaque
  `WorkflowException`. To see the real error, `databricks jobs submit` a one-off run of
  `10_ingestion_framework` with a single `operation_id`, then `jobs get-run-output`.
- **verify:** `bundle run` → `all_success: true`, 6/6 operations, expected row counts.
- **distill:** validated rules promoted below. Self-contained serverless job is the gate
  beyond `bundle validate` — the real acceptance is a green `run_framework` summary.

### L1 — Harness bootstrap (2026-06-14)
- **fail:** n/a (initial build).
- **investigate:** inventoried the workspace (Phase 0).
- **verify:** `databricks bundle validate -t dev` → `Validation OK!`; model resolver smoke-tested.
- **distill:** captured the rules above. `test_command` = bundle validate. IDE = Cursor →
  verifier runs as a fresh rubric+diff pass, not an in-conversation sub-agent.
- **consult:** next session, start from Distilled rules; don't re-discover the stack.

## Open threads / TODO for future sessions
- [ ] Decide whether to add a local lint (`ruff`) given existing `# noqa` usage.
- [ ] If Model Serving endpoint becomes available, set `DATABRICKS_MODEL_SERVING_ENDPOINT`
      to enable automated Phase 4/5 grading.
- [ ] Expand `evals/tasks/` as real delivery tasks come up.
