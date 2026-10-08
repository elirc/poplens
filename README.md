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

## Features

- **Public**: home with national headlines + combined search; map explorer
  (`/explore` — choropleth by indicator/year/level with quantile / equal /
  Jenks class breaks, ward vector tiles, facility layer, table view, year
  stepper); a profile for every state, LGA and ward (key facts, age–sex
  pyramid, ranked indicator tiles with the national figure, trends with
  source-change markers, facilities, outbreak history, sources used);
  compare (≤4 places); rankings; trends; relationships (scatter + Pearson r,
  with the correlation-is-not-causation note); facilities explorer with
  nearest-N; area analysis (pin+radius or drawn polygon → modelled population
  inside, facilities, LGAs touched; free accounts 3/day); outbreaks (weekly
  map + epi curve); indicator pages; insight cards with share images;
  stories with live charts; embeds (`/embed/chart`, `/embed/map`); `/updates`
  data-change feed; sitemap for every place and indicator.
- **Paid**: CSV/Excel downloads (licence-gated, cited, logged), custom PDF
  reports (React-PDF + d3-geo maps, built by the worker), API v1 with hashed
  keys + per-plan quotas, Paystack subscriptions (mock checkout in dev).
- **Staff**: data editor (sources, connector runs, upload wizard with
  place-match review, draft diff → publish → rollback, aliases, quality
  flags); content editor (story editor + insight-card generator with
  preview); platform admin (users/roles, orgs, plans, API usage, download
  log, audit log).

## Testing

| Suite | Command | What it proves |
| --- | --- | --- |
| Unit (331 tests) | `pnpm test:unit` | place-name matching, upload validation, ranks, class breaks, licence gating, API-key logic, stats, parsers — pure logic, no DB |
| DB (serial) | `pnpm test:db` | draft datasets invisible until publish; rollback restores earlier values; population inside a shape; tile SQL; API quotas; billing webhook idempotency; download licence gate |
| End-to-end | `pnpm test:e2e` | the full spec journey: explore → LGA profile → compare → area analysis → upload+publish → publish a card → subscribe Pro (mock) → download → custom report → API call |

The db project migrates and runs against `TEST_DATABASE_URL` serially (one
shared test database). E2E needs the seeded dev DB and starts `pnpm dev`
itself if nothing is on port 3000.

## Public API

Key-authenticated JSON API under `/api/v1` (places, indicators, values,
facilities, outbreaks). Docs are rendered from `openapi/poplens-v1.yaml` at
`/docs/api` (raw file at `/docs/api/openapi.yaml`). Keys are created in the
account area, stored as SHA-256 hashes, burst-limited at 60/min and
quota-limited per plan per day. Responses exclude data whose source licence
does not allow redistribution and report the exclusion count.

## Performance notes (slow-phone market)

- Public pages are server-rendered with timed revalidation; the site chrome
  lives in route-group layouts so `/embed/**` ships without it.
- Shapes are pre-simplified in PostGIS; states GeoJSON ≈ 84 KB, LGAs ≈ 700 KB
  (cached for an hour), wards only ever as vector tiles (LRU + HTTP cached).
- Choropleth values travel as a small JSON array separate from shapes, so
  stepping through years refetches numbers, not geometry.
- Native form controls instead of heavy picker libraries; charts are
  Recharts with table fallbacks; colour ramps are colour-blind-safe.

## Deployment

`docker compose up` starts db (PostGIS), web and worker; run
`docker compose exec web pnpm seed` once. For any other host: provide
PostgreSQL 15+ with PostGIS + pg_trgm, set the env vars from `.env.example`
(real `AUTH_SECRET`, `AUTH_MODE=real`, real adapter drivers and keys), run
`pnpm db:setup && pnpm db:migrate`, build with `pnpm build`, and run both
`pnpm start` and `pnpm worker`. The app refuses to start in production with
mock auth or the dev secret. Note: `pnpm build` prerenders public pages and
therefore needs a reachable database.

## Stack deviations from the spec (all noted during the build)

- shadcn/ui components are vendored by hand in `src/components/ui/` (no CLI,
  no Radix): native `<select>`/`<dialog>` are lighter on low-end Android.
- Next.js 16 Cache Components mode is off — classic timed revalidation.
- The OpenAPI docs page uses a small in-repo YAML-subset parser (no YAML
  dependency); the spec file is hand-maintained beside the routes.
- DHS indicators with no Nigerian API rows (HIV prevalence, household size,
  health insurance, handwashing) come from uploads rather than the DHS
  connector; the WHO connector supplies HIV prevalence nationally.
- Dev on this machine runs a portable PostgreSQL 18 + PostGIS 3.6 on port
  5541 (no Docker needed); docker-compose provides the same via
  `postgis/postgis`.
