# CONTEXT.md — Workspace inventory (Phase 0)

> Single source of truth for the delivery harness. Every later phase reads from this file.
> Regenerate by re-running the harness build prompt. Last detected: 2026-06-14.

## Identity
- **Project:** `autoloader_framework` — a metadata-driven Auto Loader (Bronze) ingestion
  framework for Databricks. One parameterized notebook ingests any source; onboarding a new
  source is a metadata `INSERT`, not a code change.
- **Workspace root:** `/Users/filo.gzz/Desktop/Filo/Projects/Scotia/autoloader_framework`
- **Deliverable kind:** Databricks Asset Bundle (DABs) — notebooks + SQL, run on the platform.

## Languages & runtime
| Item | Detected value |
|------|----------------|
| Primary language | **Python** (Databricks notebook source format: `# Databricks notebook source`, `# COMMAND ----------`, `dbutils`, `%sql`/`%md` magics) |
| Secondary | **SQL** (DDL + seed: `src/sql/01_setup_metadata.sql`, `02_seed_metadata.sql`) |
| Python version | 3.11.0 (system `python3` and `.venv`) |
| Spark | PySpark / Spark Connect — provided by Databricks runtime, **not** installed locally |
| Local venv | `.venv` exists but is **empty** (only `pip`, `setuptools`) — code does not run locally |

## Package management
- **No** `requirements.txt`, `pyproject.toml`, `poetry.lock`, `uv.lock`, `package.json`,
  `setup.py`, `setup.cfg`. Dependencies come from the Databricks runtime.
- `uv` is available globally (used by the AI Dev Kit / Omnigent installers).
- **Implication:** `package_manager` auto-detect = none. Don't introduce one unless local
  unit tests are added; prefer running against the platform.

## Test / lint / format / CI
| Capability | Status | Harness decision |
|------------|--------|------------------|
| Test framework | **None** (no pytest/conftest/tests dir; venv empty) | Gate = bundle validation, not unit tests |
| **`test_command`** | `databricks bundle validate -t dev` (verified ✅ `Validation OK!`) | Used as the Phase 4 gate |
| Lint | None configured (code uses `# noqa: E712` → flake8/ruff aware) | Stubbed: optional `ruff` if added later |
| Format | None configured | Stubbed |
| CI | **None** (`.github/` holds only AI Dev Kit *skills*, no workflows) | Stubbed: see `evals/` + `bin/verify.sh` for local gating |

## Platform specifics (Databricks)
- **DABs:** `databricks.yml` (bundle `autoloader_framework`), target `dev` (development mode,
  default). Host: `https://adb-7405612437610096.16.azuredatabricks.net/` (Azure).
- **Job:** `resources/autoloader_framework.job.yml` → job key
  `autoloader_framework_demo` (serverless): `generate_sample_data` → `run_framework`.
- **Unity Catalog:** catalog `autoloader_demo`, schemas `metadata` / `bronze`, landing Volume
  `/Volumes/autoloader_demo/landing/...` (raw + checkpoints).
- **Entry points:**
  - `src/notebooks/10_ingestion_framework.py` — THE framework, param `operation_id`.
  - `src/notebooks/00_generate_sample_data.py` — writes sample files to the landing volume.
  - `src/notebooks/20_run_demo.py` — driver: runs every enabled operation + inspects.
  - `src/sql/01_setup_metadata.sql`, `02_seed_metadata.sql` — run once before first job run.
- **Metadata model:** `object` (source/target registry), `operation` (binds source→target +
  behavior; `operation_id` is the single runtime param), `ingestion_audit_log` (one row/run).

## Credentials mechanism (NEVER store values)
- **Databricks CLI v1.0.0** with OAuth profiles in `~/.databrickscfg` (many: `DEFAULT`,
  `fe-demo-westus`, `fge2dogfood`, `fe_vending_machine`, `logfood`, customer profiles, …).
- `.claude/settings.json` pins `DATABRICKS_CONFIG_PROFILE=fe_vending_machine`.
- `.databricks/.databricks.env` uses `DATABRICKS_AUTH_TYPE=metadata-service` (local metadata
  service URL on 127.0.0.1) — this is the active VS Code/Databricks extension auth.
- Active auth at detection time: `databricks auth login --profile fe-demo-westus`.
- **Enterprise catch:** no extractable model/API token in the environment. There is **no**
  `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `DATABRICKS_TOKEN` in env — auth is OAuth +
  metadata service. Programmatic model calls must route through Databricks **Model Serving**
  or a separately provided key (see `model.config.yaml`); a key cannot be lifted from the IDE.

## Tools / MCP / agent runtime
- **IDE:** Cursor (`CURSOR_AGENT` set). `model_backend: cursor-native` — interactive reasoning
  uses Cursor's provided model access (no key needed).
- **MCP servers wired (Cursor):** `plugin-slack-slack`, `user-Neon`, `user-taskmaster-ai`.
  (The Databricks MCP referenced by the AI Dev Kit installer is **not** currently in the
  active MCP list — Databricks is reached via the **CLI**, which works.)
- **Databricks AI Dev Kit** v0.1.10 (experimental) installed: 37 skills under `.claude/skills`
  and `.github/skills` (Databricks + MLflow + APX + agent skills). Cursor + Copilot detected.
- **Code execution:** Shell available; Databricks CLI authenticated & working
  (`bundle validate` succeeds). Notebooks execute on the platform, not locally.
- **Omnigent:** install **failed** (network/pypi connect refused). `ide: cursor` here, so the
  harness uses prompt-level guardrails (Cursor mode), **not** an Omnigent policy spec. Revisit
  `RUNTIME MODE` only if the team adopts Omnigent.

## Git state
- **NOT a git repository** (`git status` → fatal: not a repo). No root `.gitignore`,
  no pre-commit hook, no remote, no `AGENTS.md` / `CLAUDE.md` at root.
- `.databricks/.gitignore` exists and ignores `*` (entire dir).
- **Implication:** the secret/artifact pre-commit hook is **staged but inactive** until
  `git init` is run. The harness provides the hook + an installer (`.harness/hooks/`) and a
  root `.gitignore` so protection is in place the moment the repo is initialized. The harness
  does **not** run `git init` (out of scope / human-in-loop).

## Required env vars (names only — never commit values)
| Var | Purpose | Where used |
|-----|---------|-----------|
| `DATABRICKS_CONFIG_PROFILE` | Selects CLI profile | CLI, bundle, skills |
| `DATABRICKS_HOST` | Workspace URL (or via profile) | CLI / SDK |
| `HARNESS_MODEL_BACKEND` | Override programmatic model backend (`databricks-model-serving` \| `anthropic-api` \| `ide`) | `model.config.yaml` resolver |
| `DATABRICKS_MODEL_SERVING_ENDPOINT` | Model Serving endpoint name for programmatic calls | Phase 4 verifier / eval scoring |
| `ANTHROPIC_API_KEY` | Fallback programmatic backend (not set today) | resolver |

## What makes a build step inapplicable here
- No local unit test runner → Phase 4/5 gate on `bundle validate` + rubric, not pytest.
- No CI → eval/verify run locally via `.harness/bin/*`.
- Not a git repo → pre-commit hook is installable-but-inactive; gitignore pre-staged.
- Cursor (no programmatic sub-agent spawning) → Phase 4 verifier runs as a **fresh,
  rubric+diff-seeded pass**, not an in-conversation sub-agent.
