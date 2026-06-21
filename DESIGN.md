# DESIGN.md — Autoloader Console Design-System Baseline

> **Status:** Baseline / as-built snapshot. This is an **observational record of reality**, not a
> target spec. Where a value is undefined, inconsistent, duplicated, or hardcoded, it is **recorded
> as a finding** — it is *not* normalized, fixed, or invented here. Normalizing is a later step.
>
> **Scope:** the `autoloader-console/` Databricks App frontend only. Every entry cites the file it
> came from and is tagged **[observed]** (read directly in code/assets) or **[inferred]** (deduced
> from framework defaults or absence of code). Citations are relative to the repo root unless noted.
>
> Generated from a read-only investigation of `origin/main` plus the gitignored reference design
> export (see §3 and §10). No application files were modified to produce this document.

---

## 1. Stack & boundaries

### Languages, frameworks, build (all [observed], from `autoloader-console/package.json`)

| Layer | Tech | Version | Source |
| --- | --- | --- | --- |
| UI framework | React + React DOM | `19.2.4` | `package.json:45-46` |
| Routing | `react-router` | `7.13.0` | `package.json:48`; routes in `client/src/App.tsx:54-66` |
| Language | TypeScript | `5.9.3` | `package.json:79`; `tsconfig.*.json` |
| Bundler (client) | Vite via **rolldown-vite** | `npm:rolldown-vite@7.1.14` (forced via `overrides`) | `package.json:81,84-86`; `client/vite.config.ts` |
| Bundler (server) | `tsdown` | `0.20.3` | `package.json:77`; `tsdown.server.config.ts` |
| Dev runner | `tsx` watch | `4.20.6` | `package.json:8,78` |
| Styling | **Tailwind CSS v4** | `tailwindcss 4.0.14`, `@tailwindcss/postcss` + `@tailwindcss/vite` `4.1.17`, `autoprefixer 10.4.21` | `package.json:59-60,68,76`; `client/postcss.config.js`; `client/tailwind.config.ts` |
| Design system / UI kit | **Databricks AppKit** + **AppKit-UI** | `@databricks/appkit` `0.38.1`, `@databricks/appkit-ui` `0.38.1` | `package.json:37-38` |
| Component conventions | **shadcn/ui** "new-york" style, base color `neutral`, CSS variables on, lucide icons | — | `client/components.json` |
| Icons | `lucide-react` | `0.546.0` | `package.json:43`; e.g. `client/src/nav.ts:1-9` |
| Class utils | `clsx` `2.1.1`, `tailwind-merge` `3.3.1` (wrapped as `cn()`) | — | `package.json:41,49`; `client/src/lib/utils.ts:4` |
| Lineage graph | `@xyflow/react` (React Flow) | `^12.11.0` | `package.json:40`; `client/src/pages/LineagePage.tsx` |
| Misc UI deps | `embla-carousel-react 8.6.0`, `next-themes 0.4.6`, `react-resizable-panels 3.0.6`, `tailwindcss-animate 1.0.7`, `tw-animate-css 1.4.0` | — | `package.json:42,44,47,50-51` |
| Validation | `zod` | `4.3.6` | `package.json:52` (server-side; see §1 boundary) |
| Server | Node / **Express** (via AppKit `createApp`) | `@types/express 5.0.5`; Node **v22+** | `package.json:61`; `autoloader-console/README.md`; `server/server.ts` |
| Tests | `vitest 4.0.14`, `@playwright/test 1.57.0` | — | `package.json:57,82`; `tests/smoke.spec.ts`, `playwright.config.ts` |
| Databricks SDK | `@databricks/sdk-experimental` | `0.17.0` | `package.json:39` |

**Rendering approach [observed]:** client-side SPA. `client/index.html` mounts a single `#root` and loads
`/src/main.tsx`, which renders `<App/>` inside `<StrictMode>` + a class `ErrorBoundary`
(`client/src/main.tsx:7-13`). Routing is a single `createBrowserRouter` with one `<Layout>` route and
six child routes (`client/src/App.tsx:54-66`). No SSR (`rsc: false` in `client/components.json`).

**App shell [observed]** (`client/src/App.tsx:21-52`): a flex row — desktop `<aside class="w-60">`
sidebar (hidden under `md`) + a mobile drawer (`Sheet`, mounted only when `useIsMobile()`), with a
`<Topbar>` and a `<main class="p-4 md:p-6">` rendering the routed `<Outlet/>`. Two global providers
wrap everything: `LanguageProvider` (ES/EN) and `CurrentUserProvider` (signed-in user).

**Six views / routes [observed]** (`client/src/nav.ts:25-68`, `App.tsx:58-63`): Overview `/`,
Sources `/sources`, Lineage `/lineage`, Detail `/detail`, Onboarding `/onboarding`, Observability
`/observability`. Per `autoloader-console/README.md` + `docs/autoloader-console/ROADMAP-stubbed-features.md`:
**Sources, Lineage, Onboarding are fully built; Overview and Observability are Phase-0 stubs**
(render only `ViewShell` + a "Phase 0 · shell" badge); Detail is a hybrid (real run-now seam + lineage
cards inside a Phase-0-badged `ViewShell`).

### The UI ↔ backend boundary [observed]

- **Frontend** = everything under `autoloader-console/client/src/` (rendering, routing, i18n, form
  state). Its *only* contract with the server is `client/src/lib/api.ts` — a thin handwritten `fetch`
  wrapper (no axios, no generated SDK; **no client-side Zod**) that calls `/api/*` and surfaces
  `{ error, issues }` through a single `asJson<T>()` helper (`api.ts:78-88`). Pure client-side derivation
  (e.g. the lineage node graph) lives in `client/src/lib/lineage.ts` — no HTTP.
- Client endpoints called (`client/src/lib/api.ts`): `GET /api/reference`, `GET /api/me`,
  `GET /api/sources`, `POST /api/sources`, `PUT /api/sources/:id`, `PATCH /api/sources/:id/enabled`,
  `POST /api/publish`, `GET /api/describe-detail/:table`, `POST /api/operations/:id/run` (stub →
  `SIMULATED`). UI dropdown enums also live here: `FILE_FORMATS`, `LOAD_TYPES`, `EVOLUTION_MODES`,
  `UC_CATALOG`, `DEFAULT_VOLUME_ROOT` (`api.ts:58-66`).
- **Backend** (this app's own Node/Express server, under `autoloader-console/server/`) = AppKit
  `createApp({ plugins: [analytics(), lakebase(), server()] })` (`server/server.ts:7-21`) with four
  route groups (`identity`, `metadata`, `publish`, `operations`), Zod validation
  (`server/lib/validation.ts`), Lakebase Postgres CRUD on an isolated `metadata_console` schema, and
  on-behalf-of-user (OBO) Databricks SQL for publish-to-Delta + the read-only `config/queries/*.obo.sql`.

### Off-limits — never change (architecture lock)

This document covers the **`autoloader-console/` frontend** only. The following are **read-only**
context that must **never** be edited, restyled, or refactored as part of any design work derived
from this baseline:

- **`autoloader-sources/`** — the **LIVE production** ingestion app (separate Databricks App).
- All **backend / data / infra**: `src/` (notebooks + SQL), `resources/`, `seed/`, `databricks.yml`,
  the DABs bundles, Unity Catalog objects, and the Lakebase Postgres instances/schemas.
- The architecture is **Databricks-native and locked**: Databricks Apps (AppKit; React + TypeScript
  + Vite client, Node/Express server), Unity Catalog, DABs, Lakebase Postgres, Spark/Auto Loader
  pipelines. **Do not add, remove, upgrade, downgrade, or swap** any framework, UI library, state
  manager, CSS system, database, build step, service, or deployment target.

---

## 2. Source of truth

**Read this file before building or changing any UI in `autoloader-console/`. All UI must conform to
it. Do not introduce styles, tokens, or components outside it.**

Today, the *de-facto* visual source of truth is **`@databricks/appkit-ui`'s shipped stylesheet**
(`@import "@databricks/appkit-ui/styles.css"` at `client/src/index.css:1`) — see §3–§7 for the real
token values it provides. The app layers a small set of **ad-hoc, hardcoded Scotiabank brand
overrides** on top of those tokens (recorded in §3). There is **no app-owned design-token file,
Storybook, theme module, or style guide** in the repo (the only design doc is
`docs/autoloader-console/ROADMAP-stubbed-features.md`, which is feature scope, not visual design).
A separate **intended/target design exists only as a gitignored canvas export** (`Scotiabank
Autoloader Framework/Autoloader Console.dc.html`) and diverges from the implementation — see §10.

---

## 3. Color

### 3a. Token palette (the real system) — [observed], from `@databricks/appkit-ui/dist/styles.css`

All app color tokens come from AppKit-UI. They are defined as **OKLCH** CSS custom properties on
`:root` (light) with a `.dark` class + `@media (prefers-color-scheme: dark)` override, and exposed to
Tailwind v4 via `@theme inline { --color-*: var(--token) }` — so Tailwind utilities like
`bg-background`, `text-foreground`, `bg-primary`, `text-muted-foreground`, `border`, `bg-muted`,
`text-destructive`, `bg-secondary` resolve to these.

> ⚠️ **Finding (see §10):** `client/src/index.css` contains a *copy* of this entire token set (light
> `:root` at `index.css:4-40` and dark at `index.css:45-80`) but **every line is commented out / inert**.
> The app therefore relies **solely on AppKit-UI's defaults**; the local overrides do nothing.

**Light theme tokens** (values verbatim from the installed `appkit-ui@0.38.1/dist/styles.css`; mirror
the commented `client/src/index.css:4-40`):

| Role | Token | Light value (OKLCH) | Notes |
| --- | --- | --- | --- |
| Background | `--background` | `oklch(1 0 0)` | white |
| Foreground (text) | `--foreground` | `oklch(0.141 0.005 285.823)` | near-black |
| Surface | `--card`, `--popover` | `oklch(1 0 0)` | white; fg = `oklch(0.141 0.005 285.823)` |
| Primary | `--primary` | `oklch(0.21 0.006 285.885)` | dark neutral; fg `oklch(0.985 0 0)` |
| Secondary | `--secondary` | `oklch(0.967 0.001 286.375)` | light grey; fg `oklch(0.21 …)` |
| Muted | `--muted` | `oklch(0.967 0.001 286.375)` | fg `--muted-foreground` `oklch(0.552 0.016 285.938)` |
| Accent | `--accent` | `oklch(0.967 0.001 286.375)` | fg `oklch(0.21 …)` |
| Destructive | `--destructive` | `oklch(0.577 0.245 27.325)` | red |
| Success | `--success` | `oklch(0.603 0.135 166.892)` | green; fg `oklch(1 0 0)` |
| Warning | `--warning` | `oklch(0.795 0.157 78.748)` | amber; fg `oklch(0.199 0.027 238.732)` |
| Border / Input | `--border`, `--input` | `oklch(0.92 0.004 286.32)` | |
| Focus ring | `--ring` | `oklch(0.705 0.015 286.067)` | used by `:focus-visible` (see §9) |
| Charts | `--chart-1..8` | categorical/sequential/diverging `hsla(...)` ramps | e.g. `--chart-cat-1: hsla(221,83%,53%,1)` (blue) |
| Sidebar | `--sidebar*` | `--sidebar oklch(0.985 0 0)`, `--sidebar-primary oklch(0.21 …)`, etc. | dedicated sidebar token group |

**Dark theme tokens** (verbatim; mirror commented `index.css:45-80`): `--background
oklch(0.141 0.005 285.823)`, `--foreground oklch(0.985 0 0)`, `--card oklch(0.21 0.006 285.885)`,
`--primary oklch(0.92 0.004 286.32)`, `--destructive oklch(0.704 0.191 22.216)`, `--success
oklch(0.67 0.12 167)`, `--warning oklch(0.83 0.165 85)`, `--border oklch(1 0 0 / 10%)`, `--ring
oklch(0.552 0.016 285.938)`, plus a dark chart ramp and dark `--sidebar*`. Dark mode is enabled both
by the `.dark` class and by OS preference (`tailwind.config.ts:5` `darkMode: ['class','media']`).
*(No app-level light/dark toggle was observed; the only user toggle is ES/EN language. `next-themes`
is installed but no wiring was found in `client/src`. **[observed absence]**)*

### 3b. Ad-hoc / hardcoded colors (NOT tokenized) — [observed]

These literal values bypass the token system. **Flagged for future tokenization (do not change now).**

**Scotiabank brand reds / orange + status green:**

| Value | Where | Used for |
| --- | --- | --- |
| `#ec111a` (brand red) | `Sidebar.tsx:10` | active nav item background (`bg-[#ec111a] text-white`) |
| `#ec111a` → `#ed431d` | `Sidebar.tsx:71` | user-avatar gradient (`linear-gradient(135deg, #ec111a, #ed431d)`) |
| `#ec111a` | `Topbar.tsx:50` | active language-toggle button background (inline `style`) |
| `#ec111a` + hover `#c20f17` | `Topbar.tsx:62` | "New operation" CTA (`bg-[#ec111a] … hover:bg-[#c20f17]`) |
| `#ec111a` + hover `#c20f17` | `DetailPage.tsx:50` | "Run now" button (same hand-copied classes) |
| `#22c38e` (status green) | `Topbar.tsx:34` | "Framework active" status dot fill **and** glow (`boxShadow: '0 0 6px #22c38e'`) |

*(All paths under `autoloader-console/client/src/components/` and `…/pages/`.)*

**Lineage graph palette** (inline on `@xyflow/react` nodes/edges, `client/src/pages/LineagePage.tsx`):
`#4462c9` (framework node, `:165`; also legend `bg-[#4462c9]` `:132`), `#40d1f5` (source node, `:190`),
`#0B2026` (source-node text, `:191`), `#059669` (ingested bronze node/edge, `:210,242`), `#e5e7eb`
(not-ingested node, `:210`), `#6b7280` (not-ingested text, `:211`), `'white'` (node text, `:166,211`),
`#94a3b8` (edge stroke, `:230`), `#cbd5e1` (inactive edge, `:242`); plus Tailwind palette `bg-emerald-600`
(legend, `:133`). xyflow node radius/font are also inline px (`borderRadius: 8`, `fontSize: 12/11/10`).

> **Finding:** the Lineage **legend** dots (`bg-primary` `:131`, `bg-emerald-600` `:133`,
> `bg-muted-foreground/40` `:134`) **do not match** the actual node colors (`#40d1f5`, `#059669`) — a
> color inconsistency. **[observed]**

---

## 4. Typography

### 4a. Font families — **Not currently defined by the app** (uses framework defaults) [observed absence → inferred stack]

- `client/index.html` references **no web font** (favicons + manifest only, `index.html:5-12`).
- Neither the app CSS (`client/src/index.css`) nor AppKit's `styles.css` sets a `font-family`; AppKit
  only sets `-webkit-font-smoothing: antialiased` + `font-feature-settings: "rlig" 1, "calt" 1` on
  `body`. **[observed]**
- ⇒ Text therefore renders in **Tailwind v4's default sans stack** (`ui-sans-serif, system-ui,
  sans-serif, "Apple Color Emoji"…`) and default mono stack (`ui-monospace, SFMono-Regular, Menlo,
  Consolas, …`) for `font-mono`. **[inferred]** *(Contrast with the reference export's DM Sans / DM
  Mono — see §10.)*

### 4b. Type scale

**Base/heading scale from AppKit `styles.css` `@layer base` [observed]** (applies to raw `h1`–`h5`/`p`):

| Element | Size | Line-height | Weight / spacing |
| --- | --- | --- | --- |
| `h1` | `2.25rem` | `1.2` | all headings `font-weight: 600`, `letter-spacing: -0.025em` |
| `h2` | `1.875rem` | `1.3` | |
| `h3` | `1.5rem` | `1.4` | |
| `h4` | `1.25rem` | — | |
| `h5` | `1.125rem` | — | |
| `p` | inherited | `1.75rem` | |

**App-level Tailwind text utilities actually used [observed]** (distinct values; the app drives headings
via utilities, not raw `<h1>`): `text-[10px]`, `text-[11px]`, `text-xs`, `text-sm`, `text-base`,
`text-2xl`. **No `text-lg`/`text-xl`/`text-3xl+` are used.** Representative: page headings
`text-2xl font-bold` (`ViewShell.tsx:26`, `SourcesPage.tsx:89`, `OnboardingPage.tsx:18`); body/subtitle
`text-sm text-muted-foreground`; metadata `text-xs`; micro-labels `text-[10px]`.

- **Weights:** `font-medium`, `font-semibold`, `font-bold` (e.g. `Sidebar.tsx:8,36,45`).
- **Mono:** `font-mono` for IDs / paths / code / table cells / JSON preview (e.g. `Topbar.tsx:24`,
  `SourcesPage.tsx:135,190`, `SourceWizard.tsx:596`, `LineagePage.tsx:403,411`).
- **Tracking:** `tracking-wide`, `tracking-wider` (`Sidebar.tsx:37,45`, `SourceWizard.tsx:321`).
- **Leading:** only `leading-tight` (`Sidebar.tsx:35,75`); no numeric `leading-*`.
- **Other:** `uppercase` (section eyebrows / lang toggle), `truncate`, `break-all`.

---

## 5. Spacing

**System [observed]:** the default **Tailwind 4px-based scale** (1 unit = `0.25rem`). The app uses **no
arbitrary spacing values** (`p-[…]`, `gap-[…]`) — everything is on-scale.

Distinct utilities in use (deduped across `client/src/`):

- **gap:** `gap-0.5`, `gap-1.5`, `gap-2`, `gap-2.5`, `gap-3`, `gap-4`, `gap-x-4`, `gap-x-6`, `gap-y-1`
- **padding:** `p-0`, `p-3`, `p-4`, `px-2`, `px-2.5`, `px-3`, `px-4`, `py-1`, `py-2`, `py-3`, `py-4`,
  `py-10`, `py-12`, `pt-0`, `pt-1`, `pb-2`
- **margin:** `mb-2`, `ml-2`, `mr-1`, `mt-1`, `mt-2`, `mt-4`, `mt-8`, `my-2`, `ml-auto`, `mx-auto`
- **stacks:** `space-y-1.5`, `space-y-2`, `space-y-3`, `space-y-4`, `space-y-5`, `space-y-6` (no `space-x-*`)
- **responsive:** `md:p-6` (`App.tsx:46`), `md:px-6` (`Topbar.tsx:16`)

**Layout dimensions [observed]:** desktop sidebar `w-60` (`App.tsx:28`), mobile drawer `w-64`
(`App.tsx:35`); page max-widths `max-w-3xl` (Onboarding/SourceWizard), `max-w-6xl` (ViewShell/Sources),
`max-w-7xl` (Lineage), `max-w-2xl` (ErrorBoundary), `sm:max-w-xl` (Lineage detail sheet). React Flow
nodes use inline px geometry (not the Tailwind scale).

---

## 6. Radius

**System [observed]:** AppKit defines `--radius: 0.625rem` (**10px**) and a base rule
`.rounded { border-radius: var(--radius) }` (AppKit `styles.css`). The same `--radius` is present but
**commented out** in `client/src/index.css:4`.

App-level `rounded*` utilities in use (no arbitrary radius in component code):

| Utility | Where (examples) |
| --- | --- |
| `rounded` (→ `--radius`, 10px) | logo `Sidebar.tsx:33`; error `<pre>` `ErrorBoundary.tsx:50,55,63`; legend dot `LineagePage.tsx:254` |
| `rounded-md` (`0.375rem`) | nav item `Sidebar.tsx:8`; lang-toggle wrapper `Topbar.tsx:40`; schema box `SourceWizard.tsx:403` |
| `rounded-lg` (`0.5rem`) | lineage tier card `DetailPage.tsx:70` |
| `rounded-full` | avatar `Sidebar.tsx:70`; status dot `Topbar.tsx:33`; "Framework active" pill `Topbar.tsx:31` |

Exception: `@xyflow/react` nodes set `borderRadius: 8` inline (px, off the Tailwind scale)
(`LineagePage.tsx:171,196,213`).

---

## 7. Shadow / elevation

**System [observed]:** there is **no app-level elevation scale** — **no Tailwind `shadow-*` utility is
used anywhere** in `client/src/` (grep-confirmed). What exists:

- **One inline glow:** `boxShadow: '0 0 6px #22c38e'` on the "Framework active" status dot
  (`Topbar.tsx:34`) — 6px green glow, no offset/spread.
- **Global focus ring** (AppKit `styles.css` `@layer base`): `:focus-visible { outline: none;
  box-shadow: 0 0 0 2px var(--background), 0 0 0 4px var(--ring); }` **[observed]**.
- Card / Dialog / Sheet / Popover surface elevation, if any, comes from **AppKit-UI component
  internals**, not from app code. **[inferred]**

---

## 8. Components

### 8a. AppKit-UI components consumed [observed]

All from `@databricks/appkit-ui/react`. Distinct set (~38 components + 2 hooks):

- **Layout / overlay:** `Card`, `CardHeader`, `CardTitle`, `CardContent`, `Separator`, `Sheet`,
  `SheetContent`, `SheetHeader`, `SheetTitle`, `SheetDescription`, `Dialog`, `DialogContent`,
  `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`
- **Form:** `Button`, `Input`, `Label`, `Textarea`, `Switch`, `Select`, `SelectTrigger`,
  `SelectValue`, `SelectContent`, `SelectItem`
- **Feedback / data:** `Alert`, `Badge`, `Skeleton`, `Table`, `TableHeader`, `TableBody`, `TableRow`,
  `TableHead`, `TableCell`
- **Hooks:** `useIsMobile` (`App.tsx:22`), `useAnalyticsQuery` (`LineagePage.tsx:67`)

Other third-party UI: `@xyflow/react` (`ReactFlow`, `Background`, `Controls`, `MarkerType`,
`Position` + `dist/style.css`) in `LineagePage.tsx`; `lucide-react` icons throughout; `react-router`
primitives.

### 8b. Local components [observed]

| Component | File | Reuse | Role |
| --- | --- | --- | --- |
| `App` / inline `Layout` | `App.tsx:21,68` | shell (one-off) | sidebar + mobile `Sheet` + `<main>` |
| `Sidebar` (+ `navItemClass()`) | `components/Sidebar.tsx:6,16` | reused (desktop + mobile drawer) | brand, nav, user card |
| `Topbar` | `components/Topbar.tsx:9` | one-off | breadcrumb, status pill, ES/EN toggle, CTA |
| `ViewShell` | `components/ViewShell.tsx:11` | reused (Overview, Observability, Detail) | Phase-0 stub scaffold + badge |
| `SourceWizard` (+ `Field`, `Toggle`) | `components/SourceWizard.tsx:238,617,635` | reused (Sources **and** Onboarding) | the single create/edit **dialog** |
| `ErrorBoundary` (class) | `ErrorBoundary.tsx:15` | one-off | wraps `<App>` |
| `OverviewPage` | `pages/OverviewPage.tsx:3` | route `/` | pure `ViewShell` stub |
| `SourcesPage` (+ `Detail`) | `pages/SourcesPage.tsx:24,186` | route `/sources` | CRUD list + publish |
| `LineagePage` (+ `buildGraph`, `LegendDot`, `DetailPanel`, `Spec`) | `pages/LineagePage.tsx:56,149,251,260,428` | route `/lineage` | xyflow graph + side sheet |
| `DetailPage` (+ `tierLabelKey`) | `pages/DetailPage.tsx:13,26` | route `/detail` | run-now seam + 4-tier cards |
| `OnboardingPage` | `pages/OnboardingPage.tsx:11` | route `/onboarding` | wraps `SourceWizard` (see §10) |
| `ObservabilityPage` | `pages/ObservabilityPage.tsx:4` | route `/observability` | pure `ViewShell` stub |
| `LanguageProvider` (+ `useLanguage`) | `i18n/LanguageProvider.tsx:15`, `i18n/context.ts` | global | ES default |
| `CurrentUserProvider` (+ `useCurrentUser`, `initials`) | `identity/CurrentUserProvider.tsx:11`, `identity/context.ts` | global | `/api/me` |

### 8c. One-offs / duplication — future consolidation candidates (record only; do NOT consolidate now) [observed]

- **`Detail` (`SourcesPage.tsx:186`) vs `Spec` (`LineagePage.tsx:428`)** — two near-identical
  "label + optional-mono value + `?? '—'`" renderers; differ only in layout. Strong de-dup candidate.
- **Operation-badge cluster** — the identical `Badge`(`file_format`)/`Badge`(`load_type`)/
  `Badge`(`evolution`)/`cast→string` group is repeated in `SourcesPage.tsx:136-139` and
  `SourceWizard.tsx:589-592`. Candidate `<OperationBadges>`.
- **Brand-red button styling** `bg-[#ec111a] text-white hover:bg-[#c20f17]` is hand-copied on two
  separate `<Button>`s (`Topbar.tsx:62`, `DetailPage.tsx:50`). Candidate for a shared variant.
- **`Toggle` (`SourceWizard.tsx:635`)** (Switch+Label) is not reused by `SourcesPage.tsx:142-149`,
  which re-implements the same Switch+text pattern inline.
- **Centered empty-state/CTA card** pattern repeated (`SourcesPage.tsx:122-128`, `OnboardingPage.tsx:26-35`).
- **`cn()` helper** (`lib/utils.ts:4`) exists but appears **unused** across `client/src` (class strings
  are built with template literals / `.join(' ')`). Possible dead utility. **[observed]**

---

## 9. Interaction, motion & accessibility (recorded as-is)

**Hover [observed]:** `transition-colors` + `hover:bg-muted hover:text-foreground` on inactive nav
(`Sidebar.tsx:8,11`); `hover:bg-muted` on inactive lang toggle (`Topbar.tsx:48`); `hover:bg-[#c20f17]`
on brand-red buttons (`Topbar.tsx:62`, `DetailPage.tsx:50`).

**Focus [observed/inferred]:** no explicit `focus:`/`focus-visible:` classes in app code; focus rings
come from AppKit-UI defaults + the global `:focus-visible` ring (§7). **[inferred]**

**Disabled [observed]:** `disabled={submitting|publishing|running}` and `disabled={isEdit}` /
`disabled={form.use_schema}` on relevant controls (`SourceWizard.tsx:328,464,513,537,605,608`,
`SourcesPage.tsx:99`, `DetailPage.tsx:49`). No custom disabled styling — relies on component defaults.

**Loading [observed]:** text swaps — `'Saving…'` (`SourceWizard.tsx:609`), `'Publishing…'`
(`SourcesPage.tsx:101`), `'…'`/`'··'` placeholders (`Sidebar.tsx:21,73`); `Skeleton` blocks
(`SourcesPage.tsx:117`, `LineagePage.tsx:361,385`). **No spinners / no `animate-spin`.**

**Motion / transitions [observed]:** only `transition-colors` (nav + lang toggle). **The installed
`tailwindcss-animate` / `tw-animate-css` `animate-*` classes are unused** in app code. Disabled-row
dimming via `opacity-60`/`opacity-50`/inline `opacity:0.5`. The only "animation" is xyflow's
`animated` edge prop driven by `operation.enabled` (`LineagePage.tsx:229,241`). Reduced motion is
handled globally by AppKit (`@media (prefers-reduced-motion: reduce)` forces near-zero durations).

**Accessibility [observed]:** `sr-only` (`Topbar.tsx:19`, `App.tsx:36`); `aria-label`
(`SourceWizard.tsx:430` "Remove column", `SourcesPage.tsx:145` "Enable operation");
`aria-pressed` (lang toggle, `Topbar.tsx:46`); `alt="Scotiabank"` (`Sidebar.tsx:30`);
`htmlFor`/`Label` pairing (`SourceWizard.tsx:398-399`); `document.documentElement.lang` kept in sync
with the active language (`LanguageProvider.tsx:24`). **No explicit `role=` attributes** in app code.

**Responsive [observed]:** only the `sm:` and `md:` breakpoints are used (no `lg:`/`xl:`). `md:` toggles
desktop sidebar vs mobile menu and grid columns; `sm:` toggles a few grids/visibility + the Lineage
detail sheet width. Mobile vs desktop nav is also branched programmatically via `useIsMobile()`
(`App.tsx:22,33`). Dark mode: `darkMode: ['class','media']` (`tailwind.config.ts:5`).

---

## 10. Findings — inconsistencies, undefined values, divergence, open questions

### 10a. ⭐ Implemented console vs. reference design export — the core divergence

A gitignored **target design export** exists at
`Scotiabank Autoloader Framework/Autoloader Console.dc.html` (a ~100 KB design-canvas prototype; read
read-only, **not** copied into the repo). It is **dark-only, px-based, with raw-hex CSS variables and
DM Sans / DM Mono web fonts** — a *different representation* from the shipped app's OKLCH/shadcn
"new-york" token system. The deployed console does **not** match it. The headline gap is the
**"New Operation" flow**:

| Aspect | **Implemented (as-built)** [observed] | **Reference export (intended)** [observed] |
| --- | --- | --- |
| Entry | Topbar "New operation" → `navigate('/onboarding')` (`Topbar.tsx:58`) → `OnboardingPage` auto-opens the dialog (`useState(true)`, `OnboardingPage.tsx:13`) | Topbar / sidebar → full-page `onboarding` view |
| Container | **Modal `Dialog`** (`SourceWizard.tsx:308`, `max-w-3xl max-h-[90vh] overflow-y-auto`) | **Full-page wizard**, centered `max-width:1000px`, card `border-radius:14px` |
| Structure | **Single scrolling screen**, 3 numbered `<section>`s: "1. Source", "2. Target Bronze table", "3. Operation behaviour" (`SourceWizard.tsx:321,457,506`) | **4-step horizontal stepper** with circular indicators + connectors: **Source → Target → Behavior → Review** (step icons `folder / table-2 / sliders-horizontal / terminal`) |
| Step nav | none (all fields at once) | Back / Next per step; green **"Create operation"** on final step |
| Preview | read-only **raw JSON** of the bundle in a `Textarea` (`SourceWizard.tsx:594-598`) | a **fake code editor** (traffic-light chrome, `onboard_{id}.sql`) showing **live-generated SQL `INSERT`s** into `…metadata.object` / `…metadata.operation` |
| Fields | no Country field | adds a **Country** dimension (México / Chile / Perú / Colombia) |
| i18n | **hardcoded English** — `SourceWizard` + `OnboardingPage` do **not** call `useLanguage()` (`OnboardingPage.tsx:18,32`), despite `onboarding.*` i18n keys existing | fully **bilingual ES/EN** |

> The implemented "New Operation" pane is, in effect, an **older single-dialog form**; the reference
> defines a **multi-step, full-page, no-code wizard** ending in a generated-SQL preview. This is the
> primary structural design gap to reconcile in a follow-up. *(Note: `OnboardingPage` itself is a
> finished, real page — not a Phase-0 stub — it just renders the old wizard.)*

### 10b. Tokens present in the reference but **absent in code** (and vice-versa) [observed]

The reference export defines a complete **dark surface ramp + semantic + info palette** as raw hex
(`:root` in the `.dc.html`). Only the **brand red** maps cleanly to the implementation; almost
everything else is **absent as a token in code**:

| Reference token (hex) | Role | Status in implemented code |
| --- | --- | --- |
| `#EC111A` (`--primary`), `#B80D14` (`--primary-d`), `#ED431D` (`--accent`) | brand red family + orange | **partially matches** — `#ec111a`/`#ed431d` exist but **hardcoded, not tokenized**; hover uses `#c20f17` (≠ ref `#B80D14`) |
| `#22C38E` (`--success`) | success green | **matches** the hardcoded `#22c38e` (Topbar); differs from AppKit's OKLCH `--success` |
| `#F4AF25` (`--warn`) | warning amber | no app hardcode; AppKit `--warning` is a *different* amber |
| `#FF5A4D` (`--danger`) | error coral-red | **absent**; AppKit `--destructive` is a different red |
| `#0E1418 / #11181C / #171F26 / #1B252C / #252F37` | dark surface ramp (sidebar→bg→card→card2→panel) | **absent** — app has no equivalent custom dark ramp (uses AppKit OKLCH dark) |
| `#2D3943 / #34414B` | borders | **absent** |
| `#E9EDF1 / #A7B3BE / #7C8896` | text / muted / dim | **absent** |
| `#40D1F5 / #669ECC / #AD5CD6` | info cyan / blue / purple | partial — `#40d1f5` appears hardcoded in the Lineage graph only |
| `#CD8B3C` / `#CD7F32` | "Bronze Delta" bronze | **absent** |
| per-format color map (`parquet #669ECC`, `csv #22C38E`, `json #F4AF25`, `jsonl #AD5CD6`, `xml #ED431D`, `avro #40D1F5`) | format semantics | **absent** (app uses neutral `Badge`s) |
| **DM Sans** + **DM Mono** (Google Fonts) | type family | **absent** — app uses the default system stack (§4a) |
| brand-tinted shadows/glows (`rgba(236,17,26,.35/.4)`), focus ring `rgba(236,17,26,.18)` | elevation/focus | **absent** — app has no shadow scale; focus ring is the neutral AppKit `--ring` |
| Layout: 252px sidebar / 60px topbar / 1320px & 1000px content widths / 12–14px card radius | geometry | **differs** — app uses `w-60` (240px), `p-4 md:p-6` chrome, `max-w-3xl/6xl/7xl`, 10px `--radius` |

Conversely, **present in code but not in the reference:** the full OKLCH light theme + light/dark
duality (the reference is dark-only); the AppKit chart token ramps (`--chart-cat/seq/div`); the shadcn
"new-york" component primitives.

### 10c. Other findings (record only)

1. **Inert token override:** the entire light + dark token block in `client/src/index.css:4-40,45-80`
   is **commented out**, so the app silently rides AppKit-UI's defaults. Either intentional (defer to
   AppKit) or an abandoned customization — undefined which. **[observed]**
2. **Ad-hoc colors bypass tokens:** brand reds, status green, and the whole Lineage palette are
   hardcoded hex (§3b) rather than tokens — no single place defines "Scotiabank red." **[observed]**
3. **Lineage legend ≠ node colors** (`bg-primary`/`bg-emerald-600` legend vs `#40d1f5`/`#059669`
   nodes). **[observed]**
4. **Localization gap:** `OnboardingPage` + `SourceWizard` are hardcoded English while every other
   view is ES/EN via `useLanguage()`; `onboarding.*` keys exist but are unused there. **[observed]**
5. **Unused tooling:** `tailwindcss-animate` + `tw-animate-css` installed but no `animate-*` class is
   used; `next-themes` installed but no theme toggle wired; `cn()` helper unused in `client/src`. **[observed]**
6. **Dual Tailwind config surfaces:** a v3-style `client/tailwind.config.ts` (content + `darkMode` +
   `tailwindcss-animate` plugin) coexists with Tailwind **v4**'s CSS-first model (`@tailwindcss/vite`
   plugin + `@theme inline` living in AppKit's CSS); `client/components.json`'s `tailwind.config` is
   `""`. Whether `tailwind.config.ts` is still authoritative under v4 is unclear. **[observed]**
7. **No app-owned design system:** no token file, theme module, Storybook, or style guide; no
   formally defined type/spacing/elevation scales beyond what AppKit ships and what utilities happen to
   be used. Categories §4a, §7 are **"Not currently defined" by the app** and rely on framework
   defaults / ad-hoc usage. **[observed]**
8. **Phase-0 stubs vs built views:** Overview + Observability render only `ViewShell` + a "Phase 0 ·
   shell" badge; Detail is a hybrid; Sources/Lineage/Onboarding are built (§1). Visual completeness is
   uneven by design. **[observed]**

### 10d. Open questions for the follow-up refactor scope

1. **Theme direction:** adopt the reference's **dark-only** palette as real tokens (map hex → OKLCH),
   or keep AppKit's light-capable OKLCH system and re-skin it toward the reference? These are
   fundamentally different (dark-only vs light+dark).
2. **Typography:** introduce **DM Sans / DM Mono**, or stay on the system stack?
3. **New Operation rebuild:** re-implement as the **4-step full-page stepper** (Source → Target →
   Behavior → Review) with the generated-SQL preview + Country dimension + ES/EN — or keep the modal
   dialog? (Architecture lock: still `Dialog`/AppKit-UI primitives — no new wizard library.)
4. **Tokenization:** define a single Scotiabank brand-token set (red family, status colors, lineage +
   format palette) and replace the hardcoded hex — without changing the OKLCH base.
5. **Inert `index.css` block:** delete it, or uncomment + reconcile it with AppKit's defaults?
6. **Tailwind config:** consolidate the v3 `tailwind.config.ts` and the v4 CSS-first model into one
   authoritative surface.
7. **Component consolidation:** `Detail`/`Spec`, `<OperationBadges>`, the brand-button variant, and the
   `Toggle` reuse (§8c).
8. **Localize** `OnboardingPage` + `SourceWizard`.

---

*Baseline authored read-only from `origin/main` (`autoloader_framework`) + the gitignored
`Scotiabank Autoloader Framework/` design export. No application code, dependencies, services, or
infrastructure were modified. This file (`DESIGN.md`) is the only change.*
