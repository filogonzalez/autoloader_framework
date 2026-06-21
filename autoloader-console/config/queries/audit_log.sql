-- TODO(observability): filterable full audit-log table for the Observability page
-- (status + date-window filters applied as query params). Stub: returns the target
-- shape but zero rows until wired in a follow-up session.
-- See docs/autoloader-console/ROADMAP-stubbed-features.md (Feature 3).
SELECT
  CAST(NULL AS STRING)    AS operation_id,
  CAST(NULL AS STRING)    AS country,
  CAST(NULL AS TIMESTAMP) AS run_ts,
  CAST(NULL AS STRING)    AS status,
  CAST(0 AS BIGINT)       AS duration_ms,
  CAST(0 AS BIGINT)       AS rows_written,
  CAST(0 AS BIGINT)       AS rescued_rows
FROM autoloader_console.metadata.ingestion_audit_log
WHERE 1 = 0
