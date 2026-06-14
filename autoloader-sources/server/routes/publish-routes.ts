import { WorkspaceClient } from '@databricks/sdk-experimental';
import type { sql as sqlApi } from '@databricks/sdk-experimental';
import {
  OBJECT_COLS,
  OPERATION_COLS,
  lit,
  type Literal,
} from '../lib/rows';
import type { AppKit } from '../lib/types';

const META_SCHEMA = 'metadata';
const DELTA_CATALOG = 'autoloader_demo';
const DELTA_META = `${DELTA_CATALOG}.metadata`;
const BRONZE_SCHEMA = 'bronze';

let cachedClient: WorkspaceClient | null = null;
function workspaceClient(): WorkspaceClient {
  if (!cachedClient) {
    // Default auth resolution: in a deployed app the platform injects
    // DATABRICKS_HOST / DATABRICKS_CLIENT_ID / DATABRICKS_CLIENT_SECRET.
    cachedClient = new WorkspaceClient({});
  }
  return cachedClient;
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

/** Execute a Databricks SQL statement, waiting (and polling) until terminal. */
async function executeSql(statement: string): Promise<SqlResult> {
  const client = workspaceClient();
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
  const rows = (resp.result?.data_array ?? []) as string[][];
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
    // Empty overwrite: cast NULLs so the VALUES clause type-checks, then filter all out.
    return `TRUNCATE TABLE ${table}`;
  }
  const valuesSql = rowValues
    .map((vals) => `(${vals.map(lit).join(', ')}, current_timestamp())`)
    .join(',\n');
  return `INSERT OVERWRITE ${table} (${colList})\nVALUES\n${valuesSql}`;
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
    app.post('/api/publish', async (_req, res) => {
      try {
        const objects = await appkit.lakebase.query(
          `SELECT ${OBJECT_COLS.join(', ')} FROM ${META_SCHEMA}.object ORDER BY object_id`,
        );
        const operations = await appkit.lakebase.query(
          `SELECT ${OPERATION_COLS.join(', ')} FROM ${META_SCHEMA}.operation ORDER BY operation_id`,
        );

        const objectRows = objects.rows.map(objectRowFromDb);
        const operationRows = operations.rows.map(operationRowFromDb);

        await executeSql(buildOverwrite(`${DELTA_META}.object`, OBJECT_COLS, objectRows));
        await executeSql(buildOverwrite(`${DELTA_META}.operation`, OPERATION_COLS, operationRows));

        res.json({
          published_objects: objectRows.length,
          published_operations: operationRows.length,
          target: DELTA_META,
        });
      } catch (err) {
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
        const { columns, rows } = await executeSql(
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
