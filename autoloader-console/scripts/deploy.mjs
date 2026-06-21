// THE supported way to deploy / retarget the Console's UC (Delta) catalog.
//
// One catalog input drives BOTH sides, so build-baked artifacts and the deployed runtime
// can never target different catalogs:
//   (a) it is exported as UC_CATALOG for `npm run build`, so scripts/render-queries.mjs
//       (baked analytics SQL) and client/vite.config.ts (VITE_UC_CATALOG) bake THIS catalog;
//   (b) the SAME value is passed to `databricks bundle deploy --var=uc_catalog=<catalog>`,
//       which wires the app's runtime UC_CATALOG env (publish/seed).
//
// Resolution (one input): --catalog=NAME  >  UC_CATALOG env  >  var.uc_catalog default
// (from databricks.yml, via scripts/uc-catalog.mjs). Default: autoloader_console.
//
//   npm run deploy                                  # default catalog
//   npm run deploy -- --catalog=my_catalog          # retarget build + runtime together
//   UC_CATALOG=my_catalog npm run deploy            # same, via env
//   npm run deploy -- --dry-run --catalog=my_catalog  # print the plan; no build, no deploy
//   npm run deploy -- -t prod -p PROFILE            # extra args pass through to bundle deploy
//
// Do NOT retarget with a bare `databricks bundle deploy --var=uc_catalog=...`: that changes
// the RUNTIME env only, leaving the already-built SQL/client baked at the previous catalog.
import { spawnSync } from 'node:child_process';
import { resolveUcCatalog, validateCatalog } from './uc-catalog.mjs';

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const catalogArg = argv.find((a) => a.startsWith('--catalog='))?.slice('--catalog='.length);
// Everything else passes through to `databricks bundle deploy` (targets, profiles, ...).
const passthrough = argv.filter((a) => a !== '--dry-run' && !a.startsWith('--catalog='));

// ONE input. An explicit --catalog wins; otherwise resolveUcCatalog() (UC_CATALOG env, else
// the databricks.yml var.uc_catalog default) — the exact value the build resolver will bake.
const catalog = catalogArg ? validateCatalog(catalogArg, '--catalog') : resolveUcCatalog();

const buildEnv = { ...process.env, UC_CATALOG: catalog };
const deployArgs = ['bundle', 'deploy', `--var=uc_catalog=${catalog}`, ...passthrough];

console.log(`[deploy] catalog = ${catalog}  (drives BUILD and RUNTIME from one value)`);
console.log(`[deploy] build : UC_CATALOG=${catalog} npm run build   → baked SQL + VITE_UC_CATALOG`);
console.log(`[deploy] deploy: databricks ${deployArgs.join(' ')}   → runtime UC_CATALOG env`);

if (dryRun) {
  console.log('[deploy] --dry-run: nothing built or deployed.');
  process.exit(0);
}

function run(cmd, args, env) {
  console.log(`[deploy] $ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', env, shell: false });
  if (r.status !== 0) {
    console.error(`[deploy] '${cmd} ${args.join(' ')}' exited with ${r.status ?? r.signal}`);
    process.exit(typeof r.status === 'number' ? r.status : 1);
  }
}

// 1) Build with the catalog so render-queries + Vite bake it into the artifacts.
run('npm', ['run', 'build'], buildEnv);
// 2) Deploy with the SAME catalog as the bundle var so runtime matches the baked artifacts.
run('databricks', deployArgs, process.env);
