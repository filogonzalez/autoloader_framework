/**
 * Console-wide runtime configuration.
 *
 * The Autoloader Console shares the `autoloader-meta` Lakebase instance with the
 * live `autoloader-sources` app but MUST stay on its own metadata schema so it
 * never reads or writes the live app's `metadata` schema. The schema name is
 * injected via the `METADATA_SCHEMA` env var (set statically in app.yaml) and
 * defaults to `metadata_console` so local/dev runs are isolated too.
 */
export const METADATA_SCHEMA = process.env.METADATA_SCHEMA ?? 'metadata_console';

/**
 * Unity Catalog (Delta) catalog for the framework's DATA layer — the catalog the
 * Console publishes metadata into and reads Bronze/audit analytics from. This is a
 * DIFFERENT layer from the Lakebase Postgres `METADATA_SCHEMA` above: the UC catalog
 * holds `<catalog>.metadata.*`, `<catalog>.bronze.*` and `<catalog>.information_schema.*`.
 *
 * Injected via the `UC_CATALOG` env var (set statically in app.yaml, mirrored by the
 * `uc_catalog` DABs variable) and defaults to `autoloader_console`.
 */
export const UC_CATALOG = process.env.UC_CATALOG ?? 'autoloader_console';
