-- TODO(observability): 14-day daily success/warn/fail breakdown for the stacked
-- runs chart on the Observability page. Stub: returns the target shape but zero
-- rows until wired in a follow-up session.
-- See docs/autoloader-console/ROADMAP-stubbed-features.md (Feature 3).
SELECT
  CAST(NULL AS DATE)   AS run_date,
  CAST(NULL AS STRING) AS country,
  CAST(0 AS BIGINT)    AS success,
  CAST(0 AS BIGINT)    AS warn,
  CAST(0 AS BIGINT)    AS fail
FROM autoloader_demo.metadata.ingestion_audit_log
WHERE 1 = 0
