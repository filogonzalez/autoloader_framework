-- Which Bronze tables physically exist (drives the lineage fan-out + "ingested" state).
SELECT
  table_name,
  table_type,
  data_source_format
FROM autoloader_console.information_schema.tables
WHERE table_schema = 'bronze'
ORDER BY table_name
