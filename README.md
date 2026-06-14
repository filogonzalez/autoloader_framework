# Metadata-Driven Auto Loader Ingestion Framework

A source-agnostic Bronze ingestion framework for Databricks. **One** parameterized
notebook ingests **any** source — POS Parquet, headerless supplier CSV, CRM JSON, EDI
XML, clickstream JSONL, multi-year historical loads — because it reads all of its
behavior from metadata tables at runtime. Onboarding a new source is a metadata `INSERT`,
not a code deployment.

> A pipeline runs. A framework governs. A pipeline knows about one source. The framework
> knows how to handle any source because it reads its instructions from configuration.

Inspired by Divyansh Goyal's article, [*Stop Writing Ingestion Pipelines. Build a
Framework Instead using Databricks Autoloader*](https://medium.com/@divyanshgoyal8989/stop-writing-ingestion-pipelines-build-a-framework-instead-using-databricks-autolaoder-ffc90761a245).

---

## 1. Product Requirements (PRD)

### Problem
Retail data teams accumulate dozens of near-identical ingestion notebooks — one per
source, per format. A schema change from any source team breaks whichever notebook reads
it. Historical loads need bespoke handling. Onboarding a new source is a week of
engineering. The problem isn't the code, it's the approach: building pipelines where a
framework is needed.

### Goal
Replace N per-source pipelines with **one config-driven framework** on top of Databricks
Auto Loader, so that the framework code stays stable and the *configuration* absorbs all
source variation.

### Functional requirements
| # | Requirement | How the framework satisfies it |
|---|-------------|--------------------------------|
| R1 | Files processed **exactly once**, safe across restarts | Auto Loader checkpoints (per-operation `schemaLocation` + file tracking) |
| R2 | **Every file format** without forking code | `file_format` + format options resolved from metadata; one reader |
| R3 | Historical loads **survive years of schema drift** | `cast_all_as_string` lands every column as STRING; typing deferred to Silver |
| R4 | Source schema changes **without warning** don't break loads | `schema_evolution_mode` (`addNewColumns` / `rescue` / `failOnNewColumns` / `none`) + `merge_schema` |
| R5 | Unexpected data **never disappears** | `_rescued_data` column captures off-schema payloads |
| R6 | Parsing quirks live in **configuration, not code** | delimiter, encoding, null token, XML rowTag, multiline, explode key — all metadata |
| R7 | Every run is **observable** | `ingestion_audit_log` records status, duration, rows, errors per run |

### Non-goals
- Business typing / cleansing (that is Silver's job — Bronze captures faithfully).
- Building a custom file-tracking system (Auto Loader already solved it).

### Design principles
- **Bronze captures data; it does not interpret it.**
- Complexity moves from code into configuration.
- Rescued data is a *signal* (upstream changed), not just a fallback.

---

## 2. Architecture

```
            metadata.operation  ──┐  (1 runtime param: operation_id)
            metadata.object      ──┤
                                   ▼
  raw files ──►  10_ingestion_framework  ──►  Bronze Delta tables
 (UC Volume       (Auto Loader cloudFiles)     autoloader_demo.bronze.*
  or abfss)              │
                         └──►  metadata.ingestion_audit_log
```

The framework executes five steps, each fully config-driven:
1. **Load config** — read the operation + its source/target objects into a flat dict.
2. **Build format options** — base options + format-specific options merged from metadata.
3. **Build reader** — `cloudFiles` stream; explicit schema, faithful-capture cast,
   array explode, audit columns.
4. **Route writes** — `append` / `merge` / `overwrite` from `load_type`.
5. **Entry point** — `trigger(availableNow=True)`, then write the audit row.

### Metadata model
- **`object`** — unified registry of `source` and `target` data objects (sparse,
  type-discriminated). Sources describe *where/how to read*; targets *where/how to write*.
- **`operation`** — binds one source to one target and declares the run behavior. The
  `operation_id` is the single runtime parameter.
- **`ingestion_audit_log`** — one row per run.

---

## 3. Repository layout

```
autoloader_framework/
├─ databricks.yml                         # Asset bundle definition
├─ resources/
│  └─ autoloader_framework.job.yml        # Lakeflow Job orchestrating the demo
├─ src/
│  ├─ sql/
│  │  ├─ 01_setup_metadata.sql            # DDL: catalog, schemas, volumes, metadata tables
│  │  └─ 02_seed_metadata.sql             # Seed: 6 demo retail sources
│  └─ notebooks/
│     ├─ 00_generate_sample_data.py       # Writes sample files into the landing volume
│     ├─ 10_ingestion_framework.py        # THE framework (parameterized by operation_id)
│     └─ 20_run_demo.py                   # Driver: runs every enabled operation + inspects
└─ README.md
```

---

## 4. The demo sources

Six operations seeded by `02_seed_metadata.sql`, each exercising a different capability:

| operation_id | Format | Load type | What it demonstrates |
|--------------|--------|-----------|----------------------|
| `op_pos_transactions` | Parquet | append (partitioned) | Columnar source, additive schema evolution |
| `op_supplier_acme` | CSV (headerless, `\|`) | append | Explicit JSON-DDL schema, custom delimiter/null token |
| `op_crm_customers` | JSON (multiline) | **merge** | Upsert current-state records on `customer_id` |
| `op_supplier_edi` | XML (`rowTag=Order`) | append | XML parsing entirely from config |
| `op_clickstream` | JSONL | append | `explode_key` flattens a top-level `events[]` array |
| `op_loyalty_history` | CSV | append | `cast_all_as_string` survives multi-year type drift |

The headline scenario is `op_loyalty_history`: the 2018 file has a **numeric**
`customer_tier` (`1,2,3`) and the 2024 file has a **string** one (`Bronze,Silver,Gold`).
Because `cast_all_as_string = true`, both land together without a type conflict — the
exact incident that motivated the framework.

---

## 5. How to run

> Prereqs: Databricks CLI authenticated to the target workspace, Unity Catalog enabled,
> and permission to create a catalog (or change the catalog name in the SQL/metadata).

### Option A — interactively (recommended for a demo)
1. Run **`src/sql/01_setup_metadata.sql`** in the SQL editor or a notebook (`%sql`).
2. Run **`src/sql/02_seed_metadata.sql`**.
3. Run notebook **`src/notebooks/00_generate_sample_data.py`**.
4. Run notebook **`src/notebooks/20_run_demo.py`** — it loops over every enabled
   operation, calls the framework, then displays the audit log and Bronze tables.

To ingest a single source, run **`10_ingestion_framework.py`** with the widget
`operation_id` set (e.g. `op_crm_customers`).

### Option B — as a deployed Job (DABs)
```bash
databricks bundle validate -t dev
databricks bundle deploy   -t dev
# run SQL steps 1-2 once (SQL editor), then:
databricks bundle run autoloader_framework_demo -t dev
```

### Re-running
Re-run `20_run_demo.py` and counts stay stable: Auto Loader's checkpoints skip
already-processed files. Regenerate `00_generate_sample_data` to add a *new* file and
watch only the delta get ingested.

---

## 6. Onboarding a new source (the whole point)

No code. Insert one source object, one target object, and one operation:

```sql
-- describe the source
INSERT INTO autoloader_demo.metadata.object (object_id, object_type, file_path,
  wildcard_pattern, file_format, description, created_at)
VALUES ('src_returns', 'source', '/Volumes/autoloader_demo/landing/raw/returns/',
  '*.json', 'json', 'Returns feed', current_timestamp());

-- describe the target
INSERT INTO autoloader_demo.metadata.object (object_id, object_type, target_catalog,
  target_schema, target_table, description, created_at)
VALUES ('tgt_returns', 'target', 'autoloader_demo', 'bronze', 'returns', 'Bronze returns',
  current_timestamp());

-- bind them with behavior
INSERT INTO autoloader_demo.metadata.operation (operation_id, enabled, source_object_id,
  target_object_id, load_type, merge_schema, schema_evolution_mode, cast_all_as_string,
  multiline, case_sensitive, max_files_per_trigger, explode_key, description, created_at)
VALUES ('op_returns', true, 'src_returns', 'tgt_returns', 'append', true, 'addNewColumns',
  false, false, false, 1000, null, 'Append returns JSON', current_timestamp());
```

The next scheduler cycle (or a manual run of `10_ingestion_framework` with
`operation_id=op_returns`) picks it up. No notebook. No PR. No deployment.

---

## 7. Using ADLS (abfss) instead of UC Volumes

The demo uses a UC Volume so it runs anywhere. To point a source at ADLS Gen2, set
`storage_account` + `container` on the source object and put the container-relative path
in `file_path`. The framework then resolves:

```
abfss://{container}@{storage_account}.dfs.core.windows.net{file_path}{wildcard_pattern}
```

Everything else — format options, evolution, write routing — is identical.

---

## 8. Configuration reference

**`object` (source columns):** `storage_account`, `container`, `file_path`,
`wildcard_pattern`, `file_format` (`csv`/`json`/`jsonl`/`parquet`/`avro`/`xml`),
`row_tag` (XML), `object_schema` (Spark JSON DDL), `delimiter`, `encoding`, `null_value`.

**`object` (target columns):** `target_catalog`, `target_schema`, `target_table`,
`table_path` (external), `partition_cols`, `merge_keys`.

**`operation`:** `load_type` (`append`/`merge`/`overwrite`), `merge_schema`,
`schema_evolution_mode` (`addNewColumns`/`rescue`/`failOnNewColumns`/`none`),
`cast_all_as_string`, `multiline`, `case_sensitive`, `max_files_per_trigger`,
`explode_key`, `enabled`.
