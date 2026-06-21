// Renders the Unity Catalog (Delta) catalog into the analytics query files.
//
// appkit's analytics plugin reads config/queries/*.sql verbatim and its type
// generator runs DESCRIBE QUERY against the warehouse — so the catalog must be a
// real LITERAL in the SQL (a parameterized identifier would break type inference).
// To keep the catalog configurable from the single shared value, this idempotent
// step rewrites the catalog segment of the known framework tables to the catalog
// resolved by scripts/uc-catalog.mjs (the SAME `var.uc_catalog` that wires the app's
// runtime UC_CATALOG env — build and runtime cannot diverge).
//
// Runs in `prebuild`/`predev` before typegen. With the default it is a no-op on a fresh
// checkout (the committed queries already carry the default catalog).
//
//   UC_CATALOG=my_catalog node scripts/render-queries.mjs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveUcCatalog } from './uc-catalog.mjs';

const CATALOG = resolveUcCatalog();
const QUERIES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'config', 'queries');

// Catalog prefix immediately before a known framework table reference.
const CATALOG_PREFIX =
  /\b[A-Za-z_][A-Za-z0-9_]*(\.(?:metadata\.ingestion_audit_log|information_schema\.(?:tables|columns)))\b/g;

let changed = 0;
for (const file of readdirSync(QUERIES_DIR).filter((f) => f.endsWith('.sql'))) {
  const path = join(QUERIES_DIR, file);
  const before = readFileSync(path, 'utf8');
  const after = before.replace(CATALOG_PREFIX, `${CATALOG}$1`);
  if (after !== before) {
    writeFileSync(path, after);
    changed += 1;
    console.log(`[render-queries] ${file} -> catalog '${CATALOG}'`);
  }
}
console.log(`[render-queries] catalog='${CATALOG}', ${changed} file(s) updated`);
