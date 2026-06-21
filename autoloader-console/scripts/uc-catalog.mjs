// Single source of truth for the build-time UC (Delta) catalog.
//
// Both build-time consumers — scripts/render-queries.mjs (analytics query files) and
// client/vite.config.ts (VITE_UC_CATALOG baked into the client) — import this ONE resolver,
// so they can never resolve different catalogs. The value is derived from the SAME bundle
// variable that wires the deployed app's runtime `UC_CATALOG` env:
//
//   databricks.yml  variables.uc_catalog.default  ──┬─> resources.apps.app.config.env
//                                                    │      UC_CATALOG = ${var.uc_catalog}  (RUNTIME: server publish/seed)
//                                                    └─> resolveUcCatalog() (BUILD: render-queries + VITE_UC_CATALOG)
//
// Precedence: explicit UC_CATALOG env (how a deploy pipeline / CI threads an overridden var,
// e.g. `UC_CATALOG=foo databricks apps deploy --var=uc_catalog=foo`) wins; otherwise the
// `var.uc_catalog` default parsed from databricks.yml is used. Changing only that default
// retargets BOTH build and runtime — they cannot diverge.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
// databricks.yml sits one level up from this scripts/ dir, regardless of the caller.
const BUNDLE_YML = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'databricks.yml');

/** Fail fast on an empty / non-identifier catalog instead of producing invalid SQL. */
export function validateCatalog(catalog, where) {
  const c = (catalog ?? '').trim();
  if (!IDENT.test(c)) {
    throw new Error(
      `[uc-catalog] invalid catalog '${catalog}' from ${where} — expected an identifier matching ${IDENT}`,
    );
  }
  return c;
}

/** Resolve the configured UC catalog for build-time use (render + client). */
export function resolveUcCatalog() {
  const env = (process.env.UC_CATALOG ?? '').trim();
  if (env) return validateCatalog(env, 'env UC_CATALOG');

  const doc = yaml.load(readFileSync(BUNDLE_YML, 'utf8'));
  const fromVar = doc?.variables?.uc_catalog?.default;
  return validateCatalog(fromVar, 'databricks.yml var.uc_catalog.default');
}
