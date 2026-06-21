import type { Application } from 'express';

/**
 * Minimal structural view of the AppKit handle the routes depend on. Keeping
 * this local (instead of importing the full AppKit type) avoids coupling the
 * route modules to internal plugin generics.
 */
export interface AppKit {
  lakebase: {
    query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  };
  server: {
    extend(fn: (app: Application) => void): void;
  };
}

/** A source data object (where/how to read raw files). */
export interface SourceObject {
  object_id: string;
  storage_account: string | null;
  container: string | null;
  file_path: string | null;
  wildcard_pattern: string | null;
  file_format: string | null;
  row_tag: string | null;
  object_schema: string | null;
  delimiter: string | null;
  encoding: string | null;
  null_value: string | null;
  description: string | null;
}

/** A target data object (where/how to write the Bronze table). */
export interface TargetObject {
  object_id: string;
  target_catalog: string | null;
  target_schema: string | null;
  target_table: string | null;
  table_path: string | null;
  partition_cols: string | null;
  merge_keys: string | null;
  description: string | null;
}

/** The unit of work binding a source to a target plus run behaviour. */
export interface Operation {
  operation_id: string;
  enabled: boolean;
  source_object_id: string;
  target_object_id: string;
  load_type: string;
  merge_schema: boolean;
  schema_evolution_mode: string;
  cast_all_as_string: boolean;
  multiline: boolean;
  case_sensitive: boolean;
  max_files_per_trigger: number | null;
  explode_key: string | null;
  description: string | null;
}

/** A full "source" as edited in the UI: operation + its source + target. */
export interface SourceBundle {
  source: SourceObject;
  target: TargetObject;
  operation: Operation;
}
