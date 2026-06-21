import { WorkspaceClient } from '@databricks/sdk-experimental';
import type { sql as sqlApi } from '@databricks/sdk-experimental';
import type { Request } from 'express';
import {
  OBJECT_COLS,
  OPERATION_COLS,
  lit,
  type Literal,
} from '../lib/rows';
import { lakebaseQuery } from '../lib/retry';
import { METADATA_SCHEMA, UC_CATALOG } from '../lib/config';
import type { AppKit } from '../lib/types';

// SOURCE of the publish: the Console's own isolated Lakebase (Postgres) schema
// (default `metadata_console`), never the live `metadata` schema. See server/lib/config.ts.
const META_SCHEMA = METADATA_SCHEMA;
// TARGET of the publish: the Unity Catalog (Delta) catalog the framework reads
// (env UC_CATALOG, default `autoloader_console`). The UC schema is the literal
// `metadata` — consistent with src/sql/01_setup_metadata.sql and the analytics queries,
// and intentionally independent of the Lakebase METADATA_SCHEMA above.
const DELTA_CATALOG = UC_CATALOG;
const DELTA_META = `${DELTA_CATALOG}.metadata`;
const BRONZE_SCHEMA = 'bronze';

/**
 * OBO POLICY (on-behalf-of-user) — applies to this whole module:
 *
 *   • UC reads + the publish-to-Delta path run AS THE USER. Every Databricks SQL
 *     statement here (INSERT OVERWRITE / TRUNCATE on the Delta metadata tables,
 *     DESCRIBE DETAIL, the read-back COUNT(*)) executes through a WorkspaceClient
 *     built from the requesting user's access token, so Unity Catalog grants and
 *     audit reflect the actual person — not the app service principal.
 *   • Lakebase `metadata_console` writes stay SP-owned (see metadata-routes.ts):
 *     the console owns its own Postgres schema, so those keep going through the
 *     default `appkit.lakebase` pool, NOT this client.
 *
 * Why a hand-rolled per-request WorkspaceClient (not appkit.analytics.asUser(req))?
 * The analytics plugin only runs file-based queries (config/queries/*.sql) — it
 * cannot carry these dynamic INSERT OVERWRITE statements — and it caches results,
 * which would defeat the post-publish read-back COUNT assertion below. Reading the
 * user token per request keeps that careful publish logic intact and makes the
 * acting identity explicit. The native filename OBO (`*.obo.sql`) is used instead
 * for the read-only analytics queries the Lineage page consumes.
 */
class MissingUserTokenError extends Error {
  constructor() {
    super(
      'No user access token (x-forwarded-access-token) on the request. This action ' +
        'runs on your behalf (OBO); ensure the app has user_api_scopes [sql] enabled ' +
        'and that you are signed in.',
    );
    this.name = 'MissingUserTokenError';
  }
}

/**
 * Build a WorkspaceClient scoped to the requesting USER from the Apps OBO header
 * (`x-forwarded-access-token`). Never cached — the token is per-user, per-request.
 *
 * If the token is absent we FAIL with a clear error rather than silently falling
 * back to the app SP (which would hide the acting identity). The one exception is
 * local `npm run dev`, where no Apps proxy injects the header: there we fall back
 * to the default auth chain and WARN loudly that the run is the SP, not a user
 * (mirrors AppKit's own documented OBO dev fallback).
 */
function userWorkspaceClient(req: Request): WorkspaceClient {
  const token = req.header('x-forwarded-access-token');
  const host = process.env.DATABRICKS_HOST;
  if (token) {
    if (!host) throw new Error('DATABRICKS_HOST is not set');
    return new WorkspaceClient({ host, token });
  }
  if (process.env.NODE_ENV === 'development') {
    console.warn(
      '[publish] OBO dev fallback: no x-forwarded-access-token — running as the app ' +
        'service principal, NOT a user. UC grants/audit will reflect the SP.',
    );
    return new WorkspaceClient({});
  }
  throw new MissingUserTokenError();
}

function warehouseId(): string {
  const id = process.env.DATABRICKS_WAREHOUSE_ID;
  if (!id) throw new Error('DATABRICKS_WAREHOUSE_ID is not set');
  return id;
}

interface SqlResult {
  columns: string[];
  rows: string[][];
}

/** Execute a Databricks SQL statement (as the given user-scoped client), polling until terminal. */
async function executeSql(client: WorkspaceClient, statement: string): Promise<SqlResult> {
  const wh = warehouseId();
  let resp = await client.statementExecution.executeStatement({
    statement,
    warehouse_id: wh,
    wait_timeout: '30s',
    on_wait_timeout: 'CONTINUE',
  });

  let state = resp.status?.state;
  const statementId = resp.statement_id;
  let polls = 0;
  while ((state === 'PENDING' || state === 'RUNNING') && statementId && polls < 60) {
    await new Promise((r) => setTimeout(r, 2000));
    resp = await client.statementExecution.getStatement({ statement_id: statementId });
    state = resp.status?.state;
    polls += 1;
  }

  if (state !== 'SUCCEEDED') {
    const msg = resp.status?.error?.message ?? `statement ended in state ${state}`;
    throw new Error(msg);
  }

  const columns = (resp.manifest?.schema?.columns ?? []).map(
    (c: sqlApi.ColumnInfo) => c.name ?? '',
  );
  const rows = resp.result?.data_array ?? [];
  return { columns, rows };
}

/** Build an INSERT OVERWRITE statement for the metadata.object / .operation tables. */
function buildOverwrite(
  table: string,
  cols: readonly string[],
  rowValues: Literal[][],
): string {
  const colList = [...cols, 'created_at'].join(', ');
  if (rowValues.length === 0) {
    // No rows to publish: empty the Delta table outright. A zero-row INSERT OVERWRITE
    // can't carry a VALUES clause, so TRUNCATE is the correct way to clear it.
    return `TRUNCATE TABLE ${table}`;
  }
  const valuesSql = rowValues
    .map((vals) => `(${vals.map((v) => lit(v, 'databricks')).join(', ')}, current_timestamp())`)
    .join(',\n');
  return `INSERT OVERWRITE ${table} (${colList})\nVALUES\n${valuesSql}`;
}

/** Read back the row count of a Delta table (post-publish assertion). */
async function tableCount(client: WorkspaceClient, table: string): Promise<number> {
  const { rows } = await executeSql(client, `SELECT COUNT(*) FROM ${table}`);
  const raw = rows[0]?.[0];
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new Error(`Could not read row count for ${table} (got ${String(raw)})`);
  }
  return n;
}

function objectRowFromDb(r: Record<string, unknown>): Literal[] {
  return OBJECT_COLS.map((c) => {
    const v = r[c];
    return (v === undefined ? null : (v as Literal));
  });
}

function operationRowFromDb(r: Record<string, unknown>): Literal[] {
  return OPERATION_COLS.map((c) => {
    const v = r[c];
    if (v === undefined || v === null) return null;
    if (c === 'enabled' || c === 'merge_schema' || c === 'cast_all_as_string' || c === 'multiline' || c === 'case_sensitive') {
      return Boolean(v);
    }
    if (c === 'max_files_per_trigger') return Number(v);
    return v as Literal;
  });
}

export function registerPublishRoutes(appkit: AppKit): void {
  appkit.server.extend((app) => {
    // Publish all Lakebase metadata into the Delta tables the framework reads.
    app.post('/api/publish', async (req, res) => {
      try {
        // Delta writes/reads below run AS THE USER (OBO). Lakebase reads stay SP.
        const client = userWorkspaceClient(req);
        const objects = await lakebaseQuery(
          appkit,
          `SELECT ${OBJECT_COLS.join(', ')} FROM ${META_SCHEMA}.object ORDER BY object_id`,
        );
        const operations = await lakebaseQuery(
          appkit,
          `SELECT ${OPERATION_COLS.join(', ')} FROM ${META_SCHEMA}.operation ORDER BY operation_id`,
        );

        const objectRows = objects.rows.map(objectRowFromDb);
        const operationRows = operations.rows.map(operationRowFromDb);

        const objectTable = `${DELTA_META}.object`;
        const operationTable = `${DELTA_META}.operation`;

        // The Databricks SQL Statement Execution API runs ONE statement per call and Delta
        // has no cross-table transaction, so we cannot make both overwrites a single atomic
        // unit. Instead: overwrite `object` first (operations FK-reference objects, so the
        // referenced side must land first), then `operation`. A statement that errors (e.g.
        // the second overwrite failing mid-way, leaving Delta half-updated) is already caught
        // by executeSql throwing. The read-back count assertion below covers the cases a throw
        // does NOT surface: a statement that "succeeds" but lands a different row count than we
        // published — e.g. the empty-input TRUNCATE path (table cleared to 0) or a silent
        // column/DDL misalignment that dropped rows.
        await executeSql(client, buildOverwrite(objectTable, OBJECT_COLS, objectRows));
        await executeSql(client, buildOverwrite(operationTable, OPERATION_COLS, operationRows));

        const [objectCount, operationCount] = await Promise.all([
          tableCount(client, objectTable),
          tableCount(client, operationTable),
        ]);

        if (objectCount !== objectRows.length || operationCount !== operationRows.length) {
          throw new Error(
            `Publish read-back mismatch — Delta is inconsistent. ` +
              `object: expected ${objectRows.length}, found ${objectCount}; ` +
              `operation: expected ${operationRows.length}, found ${operationCount}. ` +
              `The metadata tables may be half-updated; re-run publish.`,
          );
        }

        res.json({
          published_objects: objectRows.length,
          published_operations: operationRows.length,
          target: DELTA_META,
        });
      } catch (err) {
        if (err instanceof MissingUserTokenError) {
          res.status(401).json({ error: err.message });
          return;
        }
        console.error('Publish failed:', err);
        res.status(500).json({ error: `Publish failed: ${(err as Error).message}` });
      }
    });

    // Physical specs for a Bronze table (partition cols, location, numFiles, size).
    app.get('/api/describe-detail/:table', async (req, res) => {
      const table = req.params.table;
      if (!/^[A-Za-z0-9_]+$/.test(table)) {
        res.status(400).json({ error: 'Invalid table name' });
        return;
      }
      try {
        const client = userWorkspaceClient(req);
        const { columns, rows } = await executeSql(
          client,
          `DESCRIBE DETAIL ${DELTA_CATALOG}.${BRONZE_SCHEMA}.${table}`,
        );
        if (rows.length === 0) {
          res.json(null);
          return;
        }
        const detail: Record<string, string | null> = {};
        columns.forEach((c, i) => {
          detail[c] = rows[0][i] ?? null;
        });
        res.json(detail);
      } catch (err) {
        if (err instanceof MissingUserTokenError) {
          res.status(401).json({ error: err.message });
          return;
        }
        const message = (err as Error).message;
        // Table not yet created (operation published but job not run) → 404 sentinel.
        if (/TABLE_OR_VIEW_NOT_FOUND|does not exist|cannot be found/i.test(message)) {
          res.status(404).json({ error: 'Table not found', notIngested: true });
          return;
        }
        console.error('DESCRIBE DETAIL failed:', err);
        res.status(500).json({ error: `DESCRIBE DETAIL failed: ${message}` });
      }
    });
  });
}
