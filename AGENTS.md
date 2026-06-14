# AGENTS.md — agent operating rules for `autoloader_framework`

Portable rules + memory for any coding agent (Cursor, Claude Code, Copilot) working in this repo.
Keep this file current: when the model does something surprising, add the rule that would have
prevented it. Deeper detail lives in `.harness/` (see Harness pointers).

## What this project is
A **metadata-driven Auto Loader (Bronze) ingestion framework** for Databricks. ONE parameterized
notebook ingests ANY source by reading its behavior from metadata tables at runtime. Onboarding a
new source is a metadata `INSERT`, **not** a code deployment.

> A pipeline knows one source. A framework reads its instructions from configuration and handles any.

## Stack (detected — see `.harness/CONTEXT.md` for full inventory)
- **Python** Databricks notebooks (`# Databricks notebook source`, `# COMMAND ----------`,
  `%md`/`%sql`, `dbutils`) + **SQL** (DDL/seed). Python 3.11.
- **Databricks Asset Bundle (DABs):** `databricks.yml` (bundle `autoloader_framework`, target `dev`).
- **Runs on the platform** (serverless), not locally. The local `.venv` is empty by design.
- No package manager, no test framework, no CI — these are intentionally absent.

## Commands
| Action | Command |
|--------|---------|
| **Validate (the gate)** | `databricks bundle validate -t dev` |
| Deploy (dev) | `databricks bundle deploy -t dev`  *(workspace write — confirm first)* |
| Run demo job | `databricks bundle run autoloader_framework_demo -t dev`  *(runs compute — confirm)* |
| Run evals | `python3 .harness/evals/run.py` |
| Verify a change | `.harness/bin/verify.sh` then a fresh verifier pass (see below) |

## Architecture rules (invariants — do not violate)
1. **`src/notebooks/10_ingestion_framework.py` stays source-agnostic.** No per-source `if`/branch
   on a specific `operation_id`. New behavior = new metadata column, not new code.
2. **Onboard sources via metadata `INSERT`** in `src/sql/02_seed_metadata.sql` (one `source`
   object + one `target` object + one `operation`). No new notebook, no PR to the framework.
3. **Bronze captures, never interprets.** No business typing/cleansing here — that's Silver's job.
   `cast_all_as_string` lands everything as STRING to survive schema drift.
4. **Preserve notebook cell structure** (`# COMMAND ----------`, magics). Edit as text.
5. **Observability is mandatory:** every run writes one row to `metadata.ingestion_audit_log`.
6. **Auto Loader owns file tracking** (checkpoints + `schemaLocation`). Don't build a custom one.
7. **Config keys are the contract:** `load_type` (append/merge/overwrite), `schema_evolution_mode`
   (addNewColumns/rescue/failOnNewColumns/none), `merge_schema`, `cast_all_as_string`, `multiline`,
   `case_sensitive`, `max_files_per_trigger`, `explode_key`, `row_tag`, `delimiter`, `null_value`.

## Verification loop (close every change)
1. Run the gate: `databricks bundle validate -t dev`.
2. Run `.harness/bin/verify.sh` → writes `.harness/state/verify_packet.md` (rubric + diff + gate).
3. Grade in a **separate context**: open a FRESH chat (or sub-agent), paste
   `.harness/VERIFIER_PROMPT.md` + the packet. The verifier grades pass/fail and **does not edit code**.
4. On FAIL, fix and re-run — bounded to 3 attempts, then surface remaining failures.

## Don't-do list
- ❌ Don't add per-source logic/branches to the framework notebook.
- ❌ Don't add a new notebook to onboard a source (use metadata).
- ❌ Don't add business typing/cleansing to Bronze.
- ❌ Don't try to run notebooks locally or `pip install` Spark — code runs on Databricks.
- ❌ Don't hardcode absolute paths, catalog names beyond config, or credentials.
- ❌ Don't commit secrets (`.env`, `*.key`, `*.pem`, `secrets.json`) or the `.harness/` dir.
- ❌ Don't run destructive ops without explicit human confirmation: **drop, delete, overwrite,
  prod-write, force-push** (incl. `load_type: overwrite`, `bundle deploy`, `bundle run`).
- ❌ Don't assume a model API key exists — auth is OAuth + metadata service. Route programmatic
  model calls via Model Serving (`.harness/model.config.yaml`).

## Harness pointers (`.harness/` — local scaffolding, gitignored by default)
- `CONTEXT.md` — full workspace inventory (source of truth).
- `progress.md` — **read first**; cross-session memory + distilled rules.
- `TOOLS.md` — tool/MCP manifest with scopes.
- `RUBRIC.md` + `VERIFIER_PROMPT.md` + `bin/verify.sh` — verification loop.
- `evals/` — golden tasks, scorer, runner, regression baseline (`python3 .harness/evals/run.py`).
- `model.config.yaml` + `bin/resolve_model.py` — programmatic model backend resolution.
- `state/` — resumable task checkpoints.

## Memory protocol
Surprises become rules. When something breaks: record it in `.harness/progress.md`
(fail → investigate → verify → distill → consult), then promote durable rules into this file.
