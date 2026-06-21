# autoloader-console

The **Autoloader Console** — a Databricks App powered by [AppKit](https://www.databricks.com/devhub/docs/appkit/v0/) (React, TypeScript, Tailwind CSS) over the metadata-driven Auto Loader framework, with an ES/EN language toggle and Scotiabank LATAM branding. Views: **Overview**, **Sources** (CRUD + publish-to-Delta), **Lineage** (tables & lineage graph), **Detail**, **Onboarding** (guided source wizard), **Observability**. Sources, Lineage, and Onboarding are fully built; Overview and Observability remain Phase-0 stubs.

It shares the `autoloader-meta` Lakebase instance with the live `autoloader-sources` app but uses its own isolated `metadata_console` schema (via the `METADATA_SCHEMA` env var) and deploys as a separate app named via the `app_name` DABs variable. This is the **Phase 0** shell: working routes + stubs with clean extension points (`TODO(run-now)`, `TODO(lineage-tiers)`, `TODO(observability)`); full view content lands in later phases. See `docs/autoloader-console/ROADMAP-stubbed-features.md`.

**Enabled plugins:**
- **Analytics** -- SQL query execution against Databricks SQL Warehouses
- **Lakebase** -- Fully managed Postgres database for transactional (OLTP) workloads on Databricks
- **Server** -- Express HTTP server with static file serving and Vite dev mode

## Identity & on-behalf-of-user (OBO) auth

The Console shows the **real signed-in user** and runs Unity Catalog work **as that user**, not as the app service principal (SP).

**Who is signed in.** `GET /api/me` (`server/routes/identity-routes.ts`) derives `{ email, username, displayName }` from the Databricks Apps identity headers injected on every request — `x-forwarded-email`, `x-forwarded-preferred-username`, `x-forwarded-user` — with a local-dev fallback (OS/CLI user) when no Apps proxy is in front. The client `useCurrentUser` hook (`client/src/identity/`) fetches it and renders it in the sidebar.

**OBO policy** (`user_api_scopes: [sql]` in `databricks.yml`):

| Path | Runs as | How |
| ---- | ------- | --- |
| UC analytics **reads** (Lineage page: bronze tables/columns, audit) | **User (OBO)** | Query files renamed `config/queries/*.obo.sql` — AppKit's analytics plugin executes `*.obo.sql` with the user's credentials (the query key is unchanged, so the client is untouched). |
| **Publish-to-Delta** + `DESCRIBE DETAIL` (`server/routes/publish-routes.ts`) | **User (OBO)** | A **per-request** `WorkspaceClient({ host, token })` is built from `x-forwarded-access-token` — never the process-cached SP client. |
| Lakebase `metadata_console` **writes** (`server/routes/metadata-routes.ts`) | **Service principal** | The console owns its own Postgres schema, so CRUD stays on the default `appkit.lakebase` pool. |

So UC grants/audit reflect the actual person, while the console keeps full ownership of its own metadata schema.

**No user token?** The publish/describe routes **fail with a clear 401** rather than silently using the SP (which would hide the acting identity). The sole exception is local `npm run dev` (no Apps proxy injects the header): there the publish path falls back to the default auth chain and **warns loudly** that it is running as the SP — it never silently masquerades.

**Why not `appkit.analytics.asUser(req)` for publish?** The analytics plugin only runs file-based queries (it can't carry the dynamic `INSERT OVERWRITE` statements) and caches results — which would defeat the post-publish read-back `COUNT` assertion. The hand-rolled per-request client keeps that safeguard intact and makes the acting identity explicit. Native filename OBO (`*.obo.sql`) is used for the read-only analytics queries.

## Prerequisites

- Node.js v22+ and npm
- Databricks CLI (for deployment)
- Access to a Databricks workspace

## Databricks Authentication

### Local Development

For local development, configure your environment variables by creating a `.env` file:

```bash
cp .env.example .env
```

Edit `.env` and set the environment variables you need:

```env
DATABRICKS_HOST=https://your-workspace.cloud.databricks.com
DATABRICKS_APP_PORT=8000
# ... other environment variables, depending on the plugins you use
```

#### Lakebase Configuration

The Lakebase plugin requires additional environment variables for PostgreSQL connectivity. To learn how to configure the Lakebase plugin, see the [Lakebase plugin documentation](https://www.databricks.com/devhub/docs/appkit/v0/plugins/lakebase).

### CLI Authentication

The Databricks CLI requires authentication to deploy and manage apps. Configure authentication using one of these methods:

#### OAuth U2M

Interactive browser-based authentication with short-lived tokens:

```bash
databricks auth login --host https://your-workspace.cloud.databricks.com
```

This will open your browser to complete authentication. The CLI saves credentials to `~/.databrickscfg`.

#### Configuration Profiles

Use multiple profiles for different workspaces:

```ini
[DEFAULT]
host = https://dev-workspace.cloud.databricks.com

[production]
host = https://prod-workspace.cloud.databricks.com
client_id = prod-client-id
client_secret = prod-client-secret
```

Deploy using a specific profile:

```bash
databricks bundle deploy --profile production
```

**Note:** Personal Access Tokens (PATs) are legacy authentication. OAuth is strongly recommended for better security.

## Getting Started

### Install Dependencies

```bash
npm install
```

### Development

Run the app in development mode with hot reload:

```bash
npm run dev
```

The app will be available at the URL shown in the console output.

### Build

Build both client and server for production:

```bash
npm run build
```

This creates:

- `dist/server.js` - Compiled server bundle
- `client/dist/` - Bundled client assets

### Production

Run the production build:

```bash
npm start
```

## Code Quality

There are a few commands to help you with code quality:

```bash
# Type checking
npm run typecheck

# Linting
npm run lint
npm run lint:fix

# Formatting
npm run format
npm run format:fix
```

## Deployment with Databricks Asset Bundles

### 1. Configure Bundle

Update `databricks.yml` with your workspace settings:

```yaml
targets:
  default:
    workspace:
      host: https://your-workspace.cloud.databricks.com
```

Make sure to replace all placeholder values in `databricks.yml` with your actual resource IDs.

### 2. Validate Bundle

```bash
databricks bundle validate
```

### 3. Deploy

Deploy with the single entrypoint, which builds and deploys from **one** catalog input so the
build-baked artifacts (rendered analytics SQL + the client's `VITE_UC_CATALOG`) and the deployed
runtime `UC_CATALOG` env can never target different catalogs:

```bash
npm run deploy                              # default catalog (autoloader_console)
npm run deploy -- --catalog=my_catalog      # retarget BUILD + RUNTIME together
UC_CATALOG=my_catalog npm run deploy        # same, via env
npm run deploy -- --dry-run --catalog=...   # print the plan; build/deploy nothing
npm run deploy -- -t prod                   # extra args pass through to bundle deploy
```

It exports the catalog as `UC_CATALOG` for `npm run build` (so `render-queries` + Vite bake it)
and passes the same value to `databricks bundle deploy --var=uc_catalog=<catalog>` (the runtime
env). This is **THE supported way to retarget the catalog** (default `autoloader_console`).

> **Do not** retarget with a bare `databricks bundle deploy --var=uc_catalog=...`: that changes
> the runtime env only and leaves the already-built SQL/client baked at the previous catalog,
> causing build↔runtime divergence. To change only the default, edit `variables.uc_catalog.default`
> in `databricks.yml` (the build resolver and the runtime env both read it) and re-run `npm run deploy`.
> `npm run deploy` rejects a pass-through `--var=uc_catalog=...` for the same reason — set the
> catalog via `--catalog=NAME` (or `UC_CATALOG` / the default), which feeds build and runtime together.

### 4. Run

Start the deployed app:

```bash
databricks bundle run <APP_NAME> -t dev
```

### Deploy to Production

1. Configure the production target in `databricks.yml`
2. Deploy to production (same single-input entrypoint):

```bash
npm run deploy -- -t prod
```

## Project Structure

```
* client/          # React frontend
  * src/           # Source code
  * public/        # Static assets
* server/          # Express backend
  * server.ts      # Server entry point
  * routes/        # Routes
* shared/          # Shared types
* config/          # Configuration
  * queries/       # SQL query files
* scripts/         # Build tooling (uc-catalog resolver, query render)
* databricks.yml   # Bundle config + app runtime config (command/env, incl. UC_CATALOG)
* .env.example     # Environment variables example
```

## Tech Stack

- **Backend**: Node.js, Express
- **Frontend**: React.js, TypeScript, Vite, Tailwind CSS, React Router
- **UI Components**: Radix UI, shadcn/ui
- **Databricks**: AppKit SDK
