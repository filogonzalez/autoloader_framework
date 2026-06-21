# Autoloader Console — Roadmap for Stubbed Features

This document plans the three features that ship **stubbed** in the Autoloader Console v1
(UI present, wired to mock/empty data behind a clean extension point). Each is intended to be
implemented one-on-one in a **focused follow-up session**. v1 must leave the seams below in
place so each feature is a contained, low-risk addition — no rework of the v1 shell.

> Context: the Console reuses the existing AppKit stack (Node/Express + React 19), connects to
> the **shared** Lakebase instance `autoloader-meta` but writes to its **own** schema
> `metadata_console`, and is deployed as a **separate** Databricks App `autoloader-console`
> (DABs `app_name` variable) so it never disturbs the live `autoloader-sources` app.

---

## Feature 1 — "Run now" (real ingestion job trigger)

**Today (v1 stub):** the Operations table and Detail page show a **Run now** button that calls a
no-op/mock endpoint and optimistically updates UI status. No real compute is triggered.

**Goal:** trigger the actual Auto Loader ingestion for one operation and reflect real run status.

**Extension point left in v1:**
- Backend route `POST /api/operations/:operation_id/run` exists but returns a mock `{ run_id,
  status: "SIMULATED" }`. A `TODO(run-now)` marks the single function to replace.
- Frontend already calls this route and renders status; only the response contract changes.

**Implementation outline (focused session):**
1. Map operation → the framework job (root bundle `autoloader_framework_demo`, or a parameterized
   per-operation job) via the Databricks Jobs SDK (`@databricks/sdk-experimental`, already a dep).
2. Trigger `jobs.runNow` with `operation_id` as a job parameter; persist `run_id` to
   `metadata_console`.
3. Poll run state (or surface via the audit log) and update the operation's `status` / `last_run`.
4. Permissions: confirm the app service principal has `CAN_MANAGE_RUN` on the target job.

**Acceptance:** clicking Run now starts a real job run, returns its `run_id`, and the row's status
transitions from the live run state (not a simulated value). Cross-vendor reviewed; bundle validates.

---

## Feature 2 — Silver → Consumers lineage tiers

**Today (v1 stub):** the Detail page lineage panel renders **Source → Bronze** (real, from
`describe-detail` + analytics queries) and shows **Silver** and **Consumers** tiers as
placeholder/greyed nodes labeled "not yet wired".

**Goal:** extend lineage to the full tier set **Source → Bronze → Silver → Consumers** with real
relationships, where that metadata exists.

**Extension point left in v1:**
- The lineage builder returns a typed graph where Silver/Consumer nodes are flagged
  `tier: "silver" | "consumer", placeholder: true`. A `TODO(lineage-tiers)` marks the resolver.
- The xyflow renderer already lays out 4 tiers; only the data source for tiers 3–4 is missing.

**Implementation outline (focused session):**
1. Decide the source of truth for downstream tiers: Unity Catalog **lineage system tables**
   (`system.access.table_lineage` / column lineage) vs. a declared mapping in `metadata_console`.
2. Resolve Bronze→Silver→Consumer edges per operation; cache to avoid repeated UC scans.
3. Replace placeholder nodes with real nodes + edges; keep graceful "no downstream found" state.

**Acceptance:** for an operation with downstream tables, the Detail lineage shows real Silver and
Consumer nodes with correct edges; operations without downstreams degrade cleanly. Reviewed; validates.

---

## Feature 3 — 14/30-day audit history & Observability aggregations

**Today (v1 stub):** the Observability page renders KPI cards, a 14-day stacked runs chart, and an
audit-log table from **mock/empty** data. The current backend only exposes `audit_latest.sql`
(latest run per operation), not historical aggregates.

**Goal:** real 30-day KPIs (success rate, avg duration, rows written), a real 14-day
success/warn/fail stacked chart, and a filterable full audit-log table.

**Extension point left in v1:**
- New analytics query files are referenced but return empty/mock until populated:
  `audit_history_30d.sql`, `audit_daily_14d.sql`, `audit_log.sql`. A `TODO(observability)` marks
  the query wiring.
- Frontend charts/tables already bind to these query names via `useAnalyticsQuery`.

**Implementation outline (focused session):**
1. Author the three SQL queries against `autoloader_demo.metadata.ingestion_audit_log` (the
   framework's audit table), aggregating by day and status, with a 14/30-day window.
2. Add a `country` dimension to the audit rollups (the v1 schema adds a nullable `country` column).
3. Wire status filter + date window controls to query params; verify chart/table rendering.

**Acceptance:** Observability shows real 30-day KPIs and a real 14-day chart from the audit log,
with a working status filter and audit table. Reviewed; bundle validates.

---

## Sequencing suggestion

1. **Feature 3 (Observability)** first — read-only aggregations, lowest risk, unlocks real insight.
2. **Feature 1 (Run now)** next — write/trigger path, needs job + permission wiring.
3. **Feature 2 (Lineage tiers)** last — depends on UC lineage availability and modeling decisions.

Each is its own focused session: one implementer PR + an opposite-vendor cross-review, deployed to
the `autoloader-console` app, merged by a human. The v1 seams above mean none of these requires
touching the Console shell.
