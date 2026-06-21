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
