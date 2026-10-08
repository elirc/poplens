# PopLens

A public data portal for Nigeria's population and health indicators — from
the national level down to states, local government areas (LGAs) and wards.
Clear numbers, maps, comparisons and shareable insight cards, each with its
source.

> **Status**: build in progress. Sections marked _(TBD)_ are completed in the
> final integration pass.

## Assumptions

- Medical and general population statistics is read as aggregated population and health indicators by place. The app holds no personal, patient or clinic-level records.
- The app collects no new data. It curates open sources and shows them consistently.
- Sources: GRID3 for population estimates, boundaries, settlements and health facilities; the DHS Program indicator API for survey health indicators by state; the WHO Global Health Observatory and World Bank APIs for national series; and files uploaded by staff from the National Bureau of Statistics, the National Population Commission, MICS surveys and NCDC reports.
- Nigeria's last census was in 2006. Every current population figure is a modelled estimate and is labelled as one, with its source and year.
- Many health indicators exist only at state level and only for survey years. The app shows the finest level a source provides and never estimates finer values itself.
- GRID3 ward boundaries and health facility lists are newer for some states than others. The app records the version used for each state.
- Disease outbreak figures are published as PDF reports. Staff enter them through an upload template. Nothing is scraped automatically.
- The DHS Program API was reachable when this spec was written. Confirm it at build time. The Humanitarian Data Exchange carries a copy of Nigeria's subnational DHS indicators as a fallback.
- Each source has its own licence. Downloads and API access are offered only for datasets whose licence allows redistribution.
- Browsing is free. A paid Pro plan adds downloads, custom reports, unlimited area analysis and API access. Organisation plans add seats. Prices are placeholders.
- Market: Nigeria only. Naira, Africa/Lagos time. Visitors are mostly on Android phones with slow or patchy data.
- Not in version one: the app's own projections or forecasts, user-submitted data, facility service statistics, live disease surveillance, and native mobile apps.
- The language is English.

## Quick start (mock mode, no external calls)

```bash
cp .env.example .env         # defaults point at localhost:5541
docker compose up -d db      # or use any Postgres with PostGIS + pg_trgm
pnpm install
pnpm db:setup                # creates dbs + extensions
pnpm db:migrate              # applies drizzle migrations
pnpm db:migrate --test       # migrates the test database
pnpm seed                    # geography + catalogue + SYNTHETIC demo data
pnpm dev                     # web on http://localhost:3000
pnpm worker:dev              # the queue worker (separate terminal)
```

Full Docker path: `docker compose up` (web + worker + PostGIS db), then run
the seed once: `docker compose exec web pnpm seed`.

Demo accounts (seeded, mock mode): `admin@poplens.ng`/`admin1234`,
`editor@poplens.ng`/`editor1234` (data editor), `writer@poplens.ng`/
`writer1234` (content editor), `user@poplens.ng`/`user1234`.

While synthetic demo data is published, every page shows a demo-data banner.

## Stack

TypeScript (strict) · Next.js App Router · PostgreSQL + PostGIS + pg_trgm ·
Drizzle ORM · Better Auth (email+password, phone OTP, organizations) ·
Tailwind CSS + shadcn/ui · TanStack Table · Recharts · MapLibre GL
(react-map-gl, OpenFreeMap style by default) · pg-boss worker · next/og ·
@react-pdf/renderer + d3-geo · ExcelJS/CSV · Vitest · Playwright.

### Stack notes / deviations _(kept current during the build)_

- Next.js 16 Cache Components mode is off; public pages use classic timed
  revalidation (`export const revalidate`), which matches the spec.
- shadcn/ui components are vendored into `src/components/ui/`.
- The local dev database in this workspace runs a portable PostgreSQL 18 +
  PostGIS 3.6 on port **5541** (no Docker required); docker-compose provides
  the same via the `postgis/postgis` image.

## Data sources & licences _(full table TBD — see docs/DATA-LOADING.md)_

| Source | Used for | Licence | Redistribution |
| --- | --- | --- | --- |
| GRID3 | boundaries, population, facilities | CC BY 4.0 | allowed |
| geoBoundaries (gbOpen) | fallback admin boundaries | CC BY 4.0 | allowed |
| DHS Program API | state survey indicators | DHS terms | **not** allowed |
| WHO GHO | national series | CC BY-NC-SA 3.0 IGO | **not** allowed |
| World Bank | national series | CC BY 4.0 | allowed |
| NBS / NPC / MICS / NCDC | staff uploads | per publication | per dataset |
| PopLens synthetic seed | demo only | CC0 | allowed (clearly labelled) |

If the build environment cannot download GRID3 files, the seed generates
clearly-labelled placeholder geography; `docs/DATA-LOADING.md` has the exact
steps to load the real files.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js web app |
| `pnpm worker` / `pnpm worker:dev` | pg-boss worker process |
| `pnpm db:setup` / `db:generate` / `db:migrate` | database bootstrap & migrations |
| `pnpm seed` | idempotent demo seed (synthetic, labelled) |
| `pnpm load:grid3` / `pnpm load:population` | real GRID3 loaders (documented) |
| `pnpm typecheck` / `lint` / `format` | static checks |
| `pnpm test` / `test:unit` / `test:db` / `test:e2e` | tests |

## Architecture _(short)_

- `src/db/schema/` — full schema (geo, catalogue, values, facilities,
  population cells, outbreaks, content, auth, billing, api, audit).
- `src/adapters/` — mock/real drivers: connectors (DHS, WHO, World Bank),
  email (Resend), SMS (Termii), payments (Paystack), storage (local/S3).
  In mock mode no external call is made; production refuses mock auth.
- `src/server/` — domain logic (queries enforce the published-dataset rule).
- `src/worker/` — pg-boss jobs (connectors, report builds).
- `src/app/` — public pages (server-rendered, revalidated), staff tools
  under `(staff)`, API v1 under `api/v1`, tiles under `api/tiles`.

_(Testing, API docs, deployment and the performance notes are completed in
the final pass.)_
