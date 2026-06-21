import { REFERENCE, sourceBundleSchema } from '../lib/validation';
import { SEED_SOURCES } from '../lib/seed';
import {
  OBJECT_COLS,
  OPERATION_COLS,
  lit,
  operationValues,
  sourceObjectValues,
  targetObjectValues,
} from '../lib/rows';
import { lakebaseQuery } from '../lib/retry';
import { METADATA_SCHEMA } from '../lib/config';
import type { AppKit, Operation, SourceBundle, SourceObject, TargetObject } from '../lib/types';

// Isolated schema for the Console (default `metadata_console`). Never the live
// `metadata` schema — see server/lib/config.ts.
const SCHEMA = METADATA_SCHEMA;

const CREATE_SCHEMA_SQL = `CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`;

const CREATE_OBJECT_SQL = `
  CREATE TABLE IF NOT EXISTS ${SCHEMA}.object (
    object_id        TEXT PRIMARY KEY,
    object_type      TEXT NOT NULL,
    storage_account  TEXT,
    container        TEXT,
    file_path        TEXT,
    wildcard_pattern TEXT,
    file_format      TEXT,
    row_tag          TEXT,
    object_schema    TEXT,
    delimiter        TEXT,
    encoding         TEXT,
    null_value       TEXT,
    target_catalog   TEXT,
    target_schema    TEXT,
    target_table     TEXT,
    table_path       TEXT,
    partition_cols   TEXT,
    merge_keys       TEXT,
    description      TEXT,
    -- LATAM country dimension (MX/CL/PE/CO). Nullable: dormant in v1, populated
    -- by Onboarding + used by Observability rollups in a later phase.
    country          TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

const CREATE_OPERATION_SQL = `
  CREATE TABLE IF NOT EXISTS ${SCHEMA}.operation (
    operation_id          TEXT PRIMARY KEY,
    enabled               BOOLEAN NOT NULL DEFAULT TRUE,
    source_object_id      TEXT NOT NULL,
    target_object_id      TEXT NOT NULL,
    load_type             TEXT NOT NULL,
    merge_schema          BOOLEAN NOT NULL DEFAULT TRUE,
    schema_evolution_mode TEXT NOT NULL,
    cast_all_as_string    BOOLEAN NOT NULL DEFAULT FALSE,
    multiline             BOOLEAN NOT NULL DEFAULT FALSE,
    case_sensitive        BOOLEAN NOT NULL DEFAULT FALSE,
    max_files_per_trigger INTEGER,
    explode_key           TEXT,
    description           TEXT,
    -- LATAM country dimension (MX/CL/PE/CO). Nullable: dormant in v1, populated
    -- by Onboarding + used by Observability rollups in a later phase.
    country               TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

function upsertObjectSql(values: ReturnType<typeof sourceObjectValues>): string {
  const cols = OBJECT_COLS.join(', ');
  const vals = values.map((v) => lit(v)).join(', ');
  const updates = OBJECT_COLS.filter((c) => c !== 'object_id')
    .map((c) => `${c} = EXCLUDED.${c}`)
    .join(', ');
  return `INSERT INTO ${SCHEMA}.object (${cols}) VALUES (${vals})
          ON CONFLICT (object_id) DO UPDATE SET ${updates}`;
}

function upsertOperationSql(op: Operation): string {
  const cols = OPERATION_COLS.join(', ');
  const vals = operationValues(op).map((v) => lit(v)).join(', ');
  const updates = OPERATION_COLS.filter((c) => c !== 'operation_id')
    .map((c) => `${c} = EXCLUDED.${c}`)
    .join(', ');
  return `INSERT INTO ${SCHEMA}.operation (${cols}) VALUES (${vals})
          ON CONFLICT (operation_id) DO UPDATE SET ${updates}`;
}

/** Atomic multi-statement write of a source bundle (source + target + operation). */
function writeBundleSql(bundle: SourceBundle): string {
  return [
    'BEGIN',
    upsertObjectSql(sourceObjectValues(bundle.source)),
    upsertObjectSql(targetObjectValues(bundle.target)),
    upsertOperationSql(bundle.operation),
    'COMMIT',
  ].join(';\n');
}

/** Create the schema + tables and seed the six demo sources on first startup. */
export async function setupMetadataSchema(appkit: AppKit): Promise<void> {
  await lakebaseQuery(appkit, CREATE_SCHEMA_SQL);
  await lakebaseQuery(appkit, CREATE_OBJECT_SQL);
  await lakebaseQuery(appkit, CREATE_OPERATION_SQL);

  // Idempotent column adds: keep pre-existing `${SCHEMA}` tables in sync with the
  // v1 schema (the nullable LATAM `country` dimension). Safe to run on every boot.
  await lakebaseQuery(appkit, `ALTER TABLE ${SCHEMA}.object ADD COLUMN IF NOT EXISTS country TEXT`);
  await lakebaseQuery(appkit, `ALTER TABLE ${SCHEMA}.operation ADD COLUMN IF NOT EXISTS country TEXT`);

  const { rows } = await lakebaseQuery(appkit, `SELECT COUNT(*)::int AS n FROM ${SCHEMA}.operation`);
  const count = Number((rows[0]?.n as number) ?? 0);
  if (count === 0) {
    for (const bundle of SEED_SOURCES) {
      await lakebaseQuery(appkit, writeBundleSql(bundle));
    }
    console.log(`[metadata] Seeded ${SEED_SOURCES.length} demo sources into ${SCHEMA}.*`);
  } else {
    console.log(`[metadata] ${count} operations already present, skipping seed`);
  }
}

const SOURCES_QUERY = `
  SELECT
    o.operation_id, o.enabled, o.source_object_id, o.target_object_id,
    o.load_type, o.merge_schema, o.schema_evolution_mode, o.cast_all_as_string,
    o.multiline, o.case_sensitive, o.max_files_per_trigger, o.explode_key,
    o.description AS operation_description, o.created_at,
    s.storage_account, s.container, s.file_path, s.wildcard_pattern, s.file_format,
    s.row_tag, s.object_schema, s.delimiter, s.encoding, s.null_value,
    s.description AS source_description,
    t.target_catalog, t.target_schema, t.target_table, t.table_path,
    t.partition_cols, t.merge_keys, t.description AS target_description
  FROM ${SCHEMA}.operation o
  JOIN ${SCHEMA}.object s ON s.object_id = o.source_object_id
  JOIN ${SCHEMA}.object t ON t.object_id = o.target_object_id
  ORDER BY o.created_at, o.operation_id
`;

function rowToBundle(r: Record<string, unknown>): Record<string, unknown> {
  const source: SourceObject = {
    object_id: r.source_object_id as string,
    storage_account: (r.storage_account as string) ?? null,
    container: (r.container as string) ?? null,
    file_path: (r.file_path as string) ?? null,
    wildcard_pattern: (r.wildcard_pattern as string) ?? null,
    file_format: (r.file_format as string) ?? null,
    row_tag: (r.row_tag as string) ?? null,
    object_schema: (r.object_schema as string) ?? null,
    delimiter: (r.delimiter as string) ?? null,
    encoding: (r.encoding as string) ?? null,
    null_value: (r.null_value as string) ?? null,
    description: (r.source_description as string) ?? null,
  };
  const target: TargetObject = {
    object_id: r.target_object_id as string,
    target_catalog: (r.target_catalog as string) ?? null,
    target_schema: (r.target_schema as string) ?? null,
    target_table: (r.target_table as string) ?? null,
    table_path: (r.table_path as string) ?? null,
    partition_cols: (r.partition_cols as string) ?? null,
    merge_keys: (r.merge_keys as string) ?? null,
    description: (r.target_description as string) ?? null,
  };
  const operation: Operation = {
    operation_id: r.operation_id as string,
    enabled: Boolean(r.enabled),
    source_object_id: r.source_object_id as string,
    target_object_id: r.target_object_id as string,
    load_type: r.load_type as string,
    merge_schema: Boolean(r.merge_schema),
    schema_evolution_mode: r.schema_evolution_mode as string,
    cast_all_as_string: Boolean(r.cast_all_as_string),
    multiline: Boolean(r.multiline),
    case_sensitive: Boolean(r.case_sensitive),
    max_files_per_trigger:
      r.max_files_per_trigger === null || r.max_files_per_trigger === undefined
        ? null
        : Number(r.max_files_per_trigger),
    explode_key: (r.explode_key as string) ?? null,
    description: (r.operation_description as string) ?? null,
  };
  return { source, target, operation };
}

export function registerMetadataRoutes(appkit: AppKit): void {
  appkit.server.extend((app) => {
    app.get('/api/reference', (_req, res) => {
      res.json(REFERENCE);
    });

    app.get('/api/sources', async (_req, res) => {
      try {
        const { rows } = await lakebaseQuery(appkit, SOURCES_QUERY);
        res.json(rows.map(rowToBundle));
      } catch (err) {
        console.error('Failed to list sources:', err);
        res.status(500).json({ error: 'Failed to list sources' });
      }
    });

    app.post('/api/sources', async (req, res) => {
      const parsed = sourceBundleSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', issues: parsed.error.issues });
        return;
      }
      try {
        const exists = await lakebaseQuery(appkit, 
          `SELECT 1 FROM ${SCHEMA}.operation WHERE operation_id = $1`,
          [parsed.data.operation.operation_id],
        );
        if (exists.rows.length > 0) {
          res.status(409).json({ error: `operation_id "${parsed.data.operation.operation_id}" already exists` });
          return;
        }
        await lakebaseQuery(appkit, writeBundleSql(bundleFrom(parsed.data)));
        res.status(201).json(parsed.data);
      } catch (err) {
        console.error('Failed to create source:', err);
        res.status(500).json({ error: 'Failed to create source' });
      }
    });

    app.put('/api/sources/:operation_id', async (req, res) => {
      const parsed = sourceBundleSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', issues: parsed.error.issues });
        return;
      }
      if (parsed.data.operation.operation_id !== req.params.operation_id) {
        res.status(400).json({ error: 'operation_id in body does not match URL' });
        return;
      }
      try {
        const exists = await lakebaseQuery(appkit, 
          `SELECT 1 FROM ${SCHEMA}.operation WHERE operation_id = $1`,
          [req.params.operation_id],
        );
        if (exists.rows.length === 0) {
          res.status(404).json({ error: 'Operation not found' });
          return;
        }
        await lakebaseQuery(appkit, writeBundleSql(bundleFrom(parsed.data)));
        res.json(parsed.data);
      } catch (err) {
        console.error('Failed to update source:', err);
        res.status(500).json({ error: 'Failed to update source' });
      }
    });

    app.patch('/api/sources/:operation_id/enabled', async (req, res) => {
      const enabled = (req.body as { enabled?: unknown })?.enabled;
      if (typeof enabled !== 'boolean') {
        res.status(400).json({ error: 'enabled (boolean) is required' });
        return;
      }
      try {
        const { rows } = await lakebaseQuery(appkit, 
          `UPDATE ${SCHEMA}.operation SET enabled = $1 WHERE operation_id = $2 RETURNING operation_id, enabled`,
          [enabled, req.params.operation_id],
        );
        if (rows.length === 0) {
          res.status(404).json({ error: 'Operation not found' });
          return;
        }
        res.json(rows[0]);
      } catch (err) {
        console.error('Failed to toggle source:', err);
        res.status(500).json({ error: 'Failed to toggle source' });
      }
    });
  });
}

/** Narrow the validated, transformed Zod output into a SourceBundle. */
function bundleFrom(data: import('../lib/validation').ValidatedSourceBundle): SourceBundle {
  return {
    source: {
      object_id: data.source.object_id,
      storage_account: data.source.storage_account,
      container: data.source.container,
      file_path: data.source.file_path,
      wildcard_pattern: data.source.wildcard_pattern,
      file_format: data.source.file_format,
      row_tag: data.source.row_tag,
      object_schema: data.source.object_schema,
      delimiter: data.source.delimiter,
      encoding: data.source.encoding,
      null_value: data.source.null_value,
      description: data.source.description,
    },
    target: {
      object_id: data.target.object_id,
      target_catalog: data.target.target_catalog,
      target_schema: data.target.target_schema,
      target_table: data.target.target_table,
      table_path: data.target.table_path,
      partition_cols: data.target.partition_cols,
      merge_keys: data.target.merge_keys,
      description: data.target.description,
    },
    operation: {
      operation_id: data.operation.operation_id,
      enabled: data.operation.enabled,
      source_object_id: data.source.object_id,
      target_object_id: data.target.object_id,
      load_type: data.operation.load_type,
      merge_schema: data.operation.merge_schema,
      schema_evolution_mode: data.operation.schema_evolution_mode,
      cast_all_as_string: data.operation.cast_all_as_string,
      multiline: data.operation.multiline,
      case_sensitive: data.operation.case_sensitive,
      max_files_per_trigger: data.operation.max_files_per_trigger,
      explode_key: data.operation.explode_key,
      description: data.operation.description,
    },
  };
}
