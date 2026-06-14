# .harness — reusable delivery harness

Local scaffolding *around* the model for delivering work in this workspace reliably. Private by
default (gitignored). Portable to other repos by changing only the CONFIG block in the build prompt.

## Layout
```
.harness/
  CONTEXT.md          # Phase 0 — workspace inventory (source of truth)
  model.config.yaml   # Phase 1 — programmatic model backend resolution
  bin/resolve_model.py#          resolver (stdlib only)
  TOOLS.md            # Phase 2 — tool/MCP manifest with scopes
  state/              # Phase 3 — resumable task checkpoints (+ example)
  progress.md         # Phase 3 — cross-session memory (READ FIRST)
  RUBRIC.md           # Phase 4 — default acceptance criteria
  VERIFIER_PROMPT.md  # Phase 4 — seed for the independent verifier
  bin/verify.sh       # Phase 4 — gate + diff -> verifier packet
  evals/              # Phase 5 — golden tasks, scorer, runner, baseline
  hooks/              # pre-commit (secret/artifact guard) + installer
  audit.log           # cross-cutting — action log
```

## How to run
| Goal | Command |
|------|---------|
| See the workspace facts | read `CONTEXT.md` |
| Resolve model backend | `python3 .harness/bin/resolve_model.py --explain` |
| Validate a change (gate) | `databricks bundle validate -t dev` |
| Build the verifier packet | `.harness/bin/verify.sh` |
| Grade independently | fresh chat + `VERIFIER_PROMPT.md` + `state/verify_packet.md` |
| Run evals | `python3 .harness/evals/run.py` |
| Save eval baseline | `python3 .harness/evals/run.py --save-baseline` |
| Regression check | `python3 .harness/evals/run.py --regression` |
| Install secret hook (after `git init`) | `.harness/hooks/install.sh` |

## Configure / port to another repo
1. Re-run the harness build prompt with an updated CONFIG block.
2. Phase 0 re-detects stack/test_command/CI/git; everything else reads from `CONTEXT.md`.
3. No absolute paths or secrets are baked in — backends/paths come from CONFIG, env, or detection.

## Model backend (programmatic calls only)
Interactive reasoning uses the IDE (Cursor) — no key needed. Programmatic calls (verifier/eval
scoring) resolve in order: `databricks-model-serving` (if `DATABRICKS_MODEL_SERVING_ENDPOINT`) →
`anthropic-api` (if `ANTHROPIC_API_KEY`) → `ide` (manual fresh-pass). Override with
`HARNESS_MODEL_BACKEND`. Today this resolves to `ide` (no key in env — expected for this enterprise
setup; route via Model Serving when an endpoint is available).

## Guardrails (Cursor / prompt-level — see AGENTS.md)
Least privilege per tool; human-in-the-loop on `drop/delete/overwrite/prod-write/force-push`;
every state-changing action logged to `audit.log`; pre-commit blocks secrets + the harness dir.
(If this workspace adopts Omnigent, regenerate with `ide: omnigent` to emit policies instead.)
