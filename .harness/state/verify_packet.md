# VERIFIER PACKET (generated 2026-06-14T18:14:31Z)

Grade the diff below against the rubric. Pass/fail per criterion with file:line evidence.
You are an INDEPENDENT verifier: do NOT edit code. Seeded only with this packet.

## Gate result
```
Name: autoloader_framework
Target: dev
Workspace:
  Host: https://adb-7405612437610096.16.azuredatabricks.net/
  User: filo.gzz@databricks.com
  Path: /Workspace/Users/filo.gzz@databricks.com/.bundle/autoloader_framework/dev

Validation OK!
exit_code=0
```

## Rubric
```
# RUBRIC.md — default acceptance criteria (Phase 4)

> The verifier grades each criterion **pass/fail** against the rubric + diff only. It does **not**
> edit code. Task-specific rubrics live in `.harness/evals/tasks/*.rubric.md` and extend this base.

## Gate (must pass — hard fail if not)
- [ ] **G1** `databricks bundle validate -t dev` exits 0 (`Validation OK!`).
- [ ] **G2** No secrets added (no tokens/keys/passwords in tracked files; see pre-commit hook list).
- [ ] **G3** No absolute/workspace-specific paths or hardcoded credentials introduced in source.

## Framework integrity (this repo's invariants)
- [ ] **F1** `10_ingestion_framework.py` stays **source-agnostic** — no per-source `if` branches;
      new behavior is driven by metadata columns, not code.
- [ ] **F2** New sources are onboarded via metadata `INSERT` (object + object + operation), not a
      new notebook.
- [ ] **F3** Bronze layer **captures, does not interpret** — no business typing/cleansing added.
- [ ] **F4** Notebook cell structure preserved (`# Databricks notebook source`,
      `# COMMAND ----------`, `%md`/`%sql` magics intact).
- [ ] **F5** Audit logging path intact — runs still write to `metadata.ingestion_audit_log`.

## Change hygiene
- [ ] **H1** Change is scoped to the stated task; no unrelated edits.
- [ ] **H2** Destructive ops (drop/delete/overwrite/prod-write/force-push) were confirmed by a human.
- [ ] **H3** `progress.md` updated if a new lesson/rule emerged.

## Verdict
- **PASS** = all Gate criteria + all applicable task criteria pass.
- **FAIL** = any Gate criterion fails, or any applicable task criterion fails. List each failure
  with file:line evidence and a concrete fix suggestion (do not apply it).
```

## Diff
```diff
(not a git repo — list recently modified source files manually; run git init to enable diffs)
```
