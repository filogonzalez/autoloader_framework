// Client-side types + fetch helpers for the metadata CRUD/publish API.
// These mirror the server's domain types (server/lib/types.ts).

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

export interface SourceBundle {
  source: SourceObject;
  target: TargetObject;
  operation: Operation;
}

export interface Reference {
  file_formats: string[];
  load_types: string[];
  schema_evolution_modes: string[];
}

export const FILE_FORMATS = ['csv', 'json', 'jsonl', 'parquet', 'avro', 'xml'];
export const LOAD_TYPES = ['append', 'merge', 'overwrite'];
export const EVOLUTION_MODES = ['addNewColumns', 'rescue', 'failOnNewColumns', 'none'];

// Default UC (Delta) catalog for new-source form defaults + landing-path hints. Baked at
// build time into VITE_UC_CATALOG by client/vite.config.ts (derived from var.uc_catalog),
// defaulting to autoloader_console. The wizard fields remain user-editable.
export const UC_CATALOG: string = String(import.meta.env.VITE_UC_CATALOG || 'autoloader_console');
export const DEFAULT_VOLUME_ROOT = `/Volumes/${UC_CATALOG}/landing/raw`;

export interface ValidationIssue {
  path: (string | number)[];
  message: string;
}

export interface ApiError {
  error: string;
  issues?: ValidationIssue[];
}

async function asJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  const body: unknown = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = (body as ApiError) ?? { error: res.statusText };
    const e = new Error(err.error || `Request failed: ${res.status}`);
    (e as Error & { issues?: ValidationIssue[] }).issues = err.issues;
    throw e;
  }
  return body as T;
}

export async function fetchReference(): Promise<Reference> {
  return asJson<Reference>(await fetch('/api/reference'));
}

/** The real signed-in user, from the Databricks Apps identity headers (GET /api/me). */
export interface CurrentUser {
  email: string | null;
  username: string;
  displayName: string;
}

export async function fetchCurrentUser(): Promise<CurrentUser> {
  return asJson<CurrentUser>(await fetch('/api/me'));
}

export async function fetchSources(): Promise<SourceBundle[]> {
  return asJson<SourceBundle[]>(await fetch('/api/sources'));
}

export async function createSource(bundle: SourceBundle): Promise<SourceBundle> {
  return asJson<SourceBundle>(
    await fetch('/api/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bundle),
    }),
  );
}

export async function updateSource(bundle: SourceBundle): Promise<SourceBundle> {
  return asJson<SourceBundle>(
    await fetch(`/api/sources/${encodeURIComponent(bundle.operation.operation_id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bundle),
    }),
  );
}

export async function setEnabled(operationId: string, enabled: boolean): Promise<void> {
  await asJson<unknown>(
    await fetch(`/api/sources/${encodeURIComponent(operationId)}/enabled`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    }),
  );
}

export interface PublishResult {
  published_objects: number;
  published_operations: number;
  target: string;
}

export async function publish(): Promise<PublishResult> {
  return asJson<PublishResult>(await fetch('/api/publish', { method: 'POST' }));
}

export interface TableDetail {
  [key: string]: string | null;
}

export async function fetchTableDetail(table: string): Promise<TableDetail | null> {
  const res = await fetch(`/api/describe-detail/${encodeURIComponent(table)}`);
  if (res.status === 404) return null;
  return asJson<TableDetail>(res);
}

export interface RunResult {
  operation_id: string;
  run_id: string;
  /** `SIMULATED` in v1 (mock). Becomes a live run state once run-now is wired. */
  status: string;
}

/**
 * Trigger ingestion for one operation. v1 calls the stubbed backend route, which
 * returns a SIMULATED run without triggering real compute (TODO(run-now) seam).
 */
export async function runOperation(operationId: string): Promise<RunResult> {
  return asJson<RunResult>(
    await fetch(`/api/operations/${encodeURIComponent(operationId)}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}
