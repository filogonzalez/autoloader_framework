-- Live per-table column schema for the Bronze layer (incl. audit columns).
SELECT
  table_name,
  column_name,
  full_data_type,
  is_nullable,
  ordinal_position
FROM autoloader_console.information_schema.columns
WHERE table_schema = 'bronze'
ORDER BY table_name, ordinal_position
