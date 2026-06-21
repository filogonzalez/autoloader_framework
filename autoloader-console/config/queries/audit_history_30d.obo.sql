-- TODO(observability): 30-day audit aggregates for the Observability KPI cards
-- (success rate, avg duration, rows written), grouped with a `country` dimension.
-- Stub: returns the target shape but zero rows until wired in a follow-up session.
-- See docs/autoloader-console/ROADMAP-stubbed-features.md (Feature 3).
SELECT
  CAST(NULL AS STRING)    AS operation_id,
  CAST(NULL AS STRING)    AS country,
  CAST(NULL AS STRING)    AS status,
  CAST(0 AS BIGINT)       AS runs,
  CAST(0 AS DOUBLE)       AS success_rate,
  CAST(0 AS DOUBLE)       AS avg_duration_ms,
  CAST(0 AS BIGINT)       AS rows_written
FROM autoloader_console.metadata.ingestion_audit_log
WHERE 1 = 0
