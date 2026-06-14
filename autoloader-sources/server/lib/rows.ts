import type { Operation, SourceObject, TargetObject } from './types';

/** Column order for the `object` table (created_at is handled separately). */
export const OBJECT_COLS = [
  'object_id',
  'object_type',
  'storage_account',
  'container',
  'file_path',
  'wildcard_pattern',
  'file_format',
  'row_tag',
  'object_schema',
  'delimiter',
  'encoding',
  'null_value',
  'target_catalog',
  'target_schema',
  'target_table',
  'table_path',
  'partition_cols',
  'merge_keys',
  'description',
] as const;

/** Column order for the `operation` table (created_at is handled separately). */
export const OPERATION_COLS = [
  'operation_id',
  'enabled',
  'source_object_id',
  'target_object_id',
  'load_type',
  'merge_schema',
  'schema_evolution_mode',
  'cast_all_as_string',
  'multiline',
  'case_sensitive',
  'max_files_per_trigger',
  'explode_key',
  'description',
] as const;

export type Literal = string | number | boolean | null;

/** Values for a SOURCE object row, aligned to OBJECT_COLS. */
export function sourceObjectValues(s: SourceObject): Literal[] {
  return [
    s.object_id,
    'source',
    s.storage_account,
    s.container,
    s.file_path,
    s.wildcard_pattern,
    s.file_format,
    s.row_tag,
    s.object_schema,
    s.delimiter,
    s.encoding,
    s.null_value,
    null, // target_catalog
    null, // target_schema
    null, // target_table
    null, // table_path
    null, // partition_cols
    null, // merge_keys
    s.description,
  ];
}

/** Values for a TARGET object row, aligned to OBJECT_COLS. */
export function targetObjectValues(t: TargetObject): Literal[] {
  return [
    t.object_id,
    'target',
    null, // storage_account
    null, // container
    null, // file_path
    null, // wildcard_pattern
    null, // file_format
    null, // row_tag
    null, // object_schema
    null, // delimiter
    null, // encoding
    null, // null_value
    t.target_catalog,
    t.target_schema,
    t.target_table,
    t.table_path,
    t.partition_cols,
    t.merge_keys,
    t.description,
  ];
}

/** Values for an operation row, aligned to OPERATION_COLS. */
export function operationValues(o: Operation): Literal[] {
  return [
    o.operation_id,
    o.enabled,
    o.source_object_id,
    o.target_object_id,
    o.load_type,
    o.merge_schema,
    o.schema_evolution_mode,
    o.cast_all_as_string,
    o.multiline,
    o.case_sensitive,
    o.max_files_per_trigger,
    o.explode_key,
    o.description,
  ];
}

/** SQL literal escaping shared by Postgres (Lakebase) and Databricks SQL (Delta). */
export function lit(v: Literal): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return `'${v.replace(/'/g, "''")}'`;
}
