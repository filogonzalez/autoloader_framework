# TOOLS.md — Phase 2 tool manifest

> One-line contract per tool: **purpose · inputs · side effects · scope**. Wire with the
> narrowest scope that does the job. Unsupported/unwired tools are listed as follow-ups, not
> invented. Every state-changing tool call is logged to `.harness/audit.log` (see Cross-cutting).

## Core "hands" (CLI + shell) — primary loop
| Tool | Purpose | Inputs | Side effects | Scope / least-privilege |
|------|---------|--------|--------------|--------------------------|
| `databricks bundle validate -t dev` | **The gate.** Validate DABs config | bundle + target | none (read-only) | dev target only |
| `databricks bundle deploy -t dev` | Deploy bundle to workspace | bundle + target | **writes to workspace** | dev only; `human_in_loop` (prod-write) |
| `databricks bundle run autoloader_framework_demo -t dev` | Run the demo job | job key | **runs compute, writes Bronze** | dev only; confirm before prod |
| `databricks` CLI (general) | Workspace/UC/SQL ops | profile + args | varies | use `DATABRICKS_CONFIG_PROFILE`; read-first |
| Shell (run → observe → act) | Execute & read results back | command | varies | no `find`/`grep` (use Grep/Glob tools); quote paths |
| Grep / Glob / Read / Read-lints | Code search & inspection | patterns/paths | none | read-only |
| `python3 .harness/bin/resolve_model.py` | Resolve programmatic backend | env | none | read-only |

## MCP servers (Cursor — currently wired)
| Server | Purpose | Inputs | Side effects | Scope / when to use |
|--------|---------|--------|--------------|---------------------|
| `plugin-slack-slack` | Read/post Slack | channel/query/message | **posts messages** | read-first; posting needs confirmation (treat as prod-write) |
| `user-Neon` | Neon Postgres mgmt/queries | project/branch/SQL | **DB writes possible** | read-only by default; DDL/`drop`/`delete` → human-in-loop |
| `user-taskmaster-ai` | Task/plan management | task specs | writes task store | low-risk; local planning aid |

> **Always read the MCP tool's JSON descriptor before calling it**
> (`.../mcps/<server>/tools/<tool>.json`) to confirm exact params. Never call blind.

## Databricks AI Dev Kit skills (read-as-needed reference, not auto-run)
- 37 skills under `.claude/skills/` and `.github/skills/` (Databricks + MLflow + APX + agent).
  Most relevant here: `databricks-bundles`, `databricks-spark-structured-streaming`,
  `databricks-spark-declarative-pipelines`, `databricks-unity-catalog`, `databricks-jobs`,
  `databricks-dbsql`, `databricks-synthetic-data-gen`. Read the `SKILL.md` when a task matches.

## Sub-agents (focused, one job, clean context)
The Phase 4 **verifier** is the first sub-agent. Contract for any sub-agent spawned here:
- **One job**, clean context, only the tools it needs, explicit "cannot touch" list.
- **Verifier** (Phase 4): inputs = rubric + diff only; tools = Read/Grep + run `test_command`;
  **cannot edit code**, cannot deploy, cannot post to Slack/DB. Grades pass/fail per criterion.
- A fuller multi-agent SDLC (researcher → spec → builder → verifier) can be layered later; not
  needed for this workspace yet.

## Follow-ups (unsupported / not wired — do NOT invent)
- **Databricks MCP** referenced by the AI Dev Kit installer is not in Cursor's active MCP list;
  Databricks is reached via the CLI instead. Wire the MCP only if/when needed.
- **Programmatic model backend** (Model Serving / Anthropic) not configured — verification runs
  in manual fresh-pass mode until `DATABRICKS_MODEL_SERVING_ENDPOINT` or `ANTHROPIC_API_KEY` is set.
- **CI runner** absent — eval/verify run locally via `.harness/bin/*`.
