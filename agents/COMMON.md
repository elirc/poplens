# PopLens build — common rules for every feature agent

Read `docs/SPEC.md` first (the authoritative product spec), then your own
brief in this folder. These rules are non-negotiable; they exist because
parallel agents share one filesystem, one package store and one database.

## Hard rules

1. **Never run `pnpm install`, `pnpm add`, `npm`, or touch `node_modules/` or
   `pnpm-lock.yaml`.** All dependencies are already installed. If you believe a
   package is missing, STOP and say so in your final report instead.
2. **Edit only files you own** (listed in your brief). Everything else —
   especially `src/db/schema/**`, `src/env.ts`, `src/lib/**`, `src/adapters/types.ts`,
   `src/adapters/index.ts`, `src/server/geo/queries.ts`, `src/server/indicators/**`,
   `src/server/datasets/versioning.ts`, `src/components/shell/**`,
   `src/components/data/**`, config files, `package.json` — is READ-ONLY shared
   contract. If a contract file blocks you, report it; do not "fix" it.
3. **Do not run**: the dev server (`pnpm dev`), `pnpm build`, `pnpm test:db`,
   `pnpm test:e2e`, Playwright, or anything that starts a server or writes the
   dev database — EXCEPT where your brief explicitly grants an exception.
4. **Verification you must run before finishing**:
   - `pnpm typecheck` (must be clean for the whole repo)
   - `pnpm lint` (must be clean for your files)
   - `pnpm vitest run --project unit <paths to your own unit test files>` for
     pure-logic tests only. Never run the whole suite or the db project.
5. **Report format**: end with (a) list of files you created/changed, (b) the
   exact commands you ran and their real exit status (beware `cmd | tail`
   masking failures — check `${PIPESTATUS[0]}`), (c) anything unfinished or
   uncertain, (d) any contract-file change you need from the orchestrator.
6. Write **db-project tests** (`*.db.test.ts`) where your brief asks, but DO
   NOT execute them — the orchestrator runs them serially afterwards.

## Engineering rules from the spec (apply everywhere)

- Never invent a statistic. Synthetic demo values must be clearly labelled
  (dataset `isSynthetic: true`, note "SYNTHETIC demo value…").
- Missing data renders as "No data" (use `formatValue`/`NO_DATA` from
  `src/lib/format.ts`), never 0.
- Every on-screen value/chart/map carries source + year + estimate flag:
  use `SourceLine` / `StatTile` / `ChartFrame` from `src/components/data/`.
- Charts: colour-blind-safe palettes only (use `rampFor`/`SEQUENTIAL_RAMPS`
  from `src/lib/class-breaks.ts`; for categorical series use the Okabe-Ito
  palette: #0072B2 #E69F00 #009E73 #CC79A7 #56B4E9 #D55E00 #F0E442).
  Every chart must be wrapped in `ChartFrame` with a real table view.
- Public values come ONLY through `src/server/indicators/queries.ts`
  (published-dataset join). Never query `indicator_values` directly from
  feature code.
- All mutations are Server Actions with Zod-validated input and server-side
  permission checks (`requireUser` / `requireRole` from `src/lib/session.ts`).
- Public pages: server-render with `export const revalidate = <seconds>`;
  keep payloads small (phone-first market, slow networks).
- Trend lines never silently join different sources: break the line / mark
  the point where `sourceId` changes.
- Audit staff/billing actions with `writeAudit` from `src/lib/audit.ts`.

## Environment facts

- Postgres 18 + PostGIS 3.6 runs on `localhost:5541` (postgres/postgres),
  databases `poplens_dev` (seeded dev) and `poplens_test` (db tests).
  psql client: `C:/Users/Owner/pg18-poplens/pgsql/bin/psql`. You may run
  READ-ONLY queries against poplens_dev to inspect schema/data.
- `.env` already exists (mock mode). `src/env.ts` is the only way to read env.
- The repo typechecks cleanly at handoff; keep it that way.
- UI stack: Tailwind 4 + the shared shell; shadcn/ui primitives live in
  `src/components/ui/` — use them, add new primitives only via writing the
  component file yourself in your own folders (no CLI).
- Icons: lucide-react. Charts: recharts. Maps: react-map-gl v8 + maplibre-gl
  (`import Map from "react-map-gl/maplibre"`), style URL from env
  (`MAP_STYLE_URL`, already set to OpenFreeMap positron).
- Date/time display: Africa/Lagos (`formatLagosDate`).

## Next.js 16 gotchas (this repo uses Next 16.4, classic mode)

- `params` and `searchParams` in pages/layouts/route handlers are **Promises**:
  `const { code } = await params;` — never access them synchronously.
- Cache Components mode is OFF. Use classic `export const revalidate = 300`
  on public pages; use `dynamic = "force-dynamic"` only where truly needed
  (staff/account pages are naturally dynamic via cookies()).
- Route handlers: `export async function GET(req: Request, { params }:
  { params: Promise<{...}> })`.
- When in doubt check `node_modules/next/dist/docs/` (see AGENTS.md) —
  Next 16 changed things since your training data.
- Client components must not import `@/env`, `@/db`, or anything under
  `src/server/` — pass data via props from server components.
