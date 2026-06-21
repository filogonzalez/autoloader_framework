-- Latest run per operation from the framework's audit log (status, rows, duration).
SELECT
  operation_id,
  run_ts,
  status,
  rows_written,
  duration_ms
FROM (
  SELECT
    operation_id,
    run_ts,
    status,
    rows_written,
    duration_ms,
    ROW_NUMBER() OVER (PARTITION BY operation_id ORDER BY run_ts DESC) AS rn
  FROM autoloader_demo.metadata.ingestion_audit_log
)
WHERE rn = 1
ORDER BY operation_id
