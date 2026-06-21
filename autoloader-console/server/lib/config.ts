/**
 * Console-wide runtime configuration.
 *
 * The Autoloader Console shares the `autoloader-meta` Lakebase instance with the
 * live `autoloader-sources` app but MUST stay on its own metadata schema so it
 * never reads or writes the live app's `metadata` schema. The schema name is
 * injected via the `METADATA_SCHEMA` env var (set in databricks.yml
 * resources.apps.app.config.env) and defaults to `metadata_console` so local/dev runs
 * are isolated too.
 */
export const METADATA_SCHEMA = process.env.METADATA_SCHEMA ?? 'metadata_console';

/**
 * Unity Catalog (Delta) catalog for the framework's DATA layer — the catalog the
 * Console publishes metadata into and reads Bronze/audit analytics from. DIFFERENT layer
 * from the Lakebase Postgres `METADATA_SCHEMA` above: the UC catalog holds
 * `<catalog>.metadata.*`, `<catalog>.bronze.*` and `<catalog>.information_schema.*`.
 *
 * Single source of truth: the `uc_catalog` DABs variable. The deployed app's `UC_CATALOG`
 * env is wired from `${var.uc_catalog}` in databricks.yml (resources.apps.app.config.env);
 * local dev falls back to `autoloader_console`. Fails fast on an empty / non-identifier
 * value so a misconfigured catalog never reaches a SQL statement.
 */
const UC_CATALOG_RAW = process.env.UC_CATALOG?.trim() || 'autoloader_console';
if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(UC_CATALOG_RAW)) {
  throw new Error(
    `UC_CATALOG '${UC_CATALOG_RAW}' is not a valid catalog identifier (expected /^[A-Za-z_][A-Za-z0-9_]*$/)`,
  );
}
export const UC_CATALOG = UC_CATALOG_RAW;
