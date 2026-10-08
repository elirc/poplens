# Build orchestration log

Fable orchestrates; Opus agents build feature areas against pre-written
shared contracts. This file tracks waves and integration state.

## Baseline (orchestrator, done)

- Portable PostgreSQL 18 + PostGIS 3.6.2 on localhost:5541
  (binaries: C:\Users\Owner\pg18-poplens, data: C:\Users\Owner\pgdata-poplens;
  start: `pg18-poplens/pgsql/bin/pg_ctl -D C:/Users/Owner/pgdata-poplens start`).
  Databases poplens_dev + poplens_test, extensions installed, migrated.
- Full Drizzle schema (all spec tables), env contract, adapters (mock+real
  email/SMS/payments/storage, mock connectors, real connector stubs), auth
  (Better Auth + phone OTP + orgs), session/permissions, limits/quotas,
  rate limiting, audit, dataset versioning (publish/supersede/rollback),
  published-value queries, ranks, class breaks, formatting, queue, worker
  boot + job registry, UI shell + primitives, chart/stat/source components,
  vitest (unit/db projects), playwright config, docker compose, README core.
- Runtime smoke (scripts/smoke.ts): PostGIS roundtrip, draft→publish→
  supersede→rollback visibility, Better Auth signup.

## Wave 1 (parallel Opus agents)

| Agent | Brief | Area |
| --- | --- | --- |
| A1 | agents/A1-geo-seed.md | geography load + full synthetic seed |
| A2 | agents/A2-pipeline.md | matching, connectors, upload wizard, publish UI |
| A3 | agents/A3-maps-tiles.md | GeoJSON/MVT routes + map explorer |
| A4 | agents/A4-profiles-search.md | home, place profiles, indicator pages, search |

## Wave 2 (parallel Opus agents — LAUNCHED 2026-10-08, after wave-1 gates green)

| Agent | Brief | Area |
| --- | --- | --- |
| B1 | agents/B1-analytics.md | compare, rankings, trends, relationships, outbreaks |
| B2 | agents/B2-facilities-area.md | facilities explorer + area analysis |
| B3 | agents/B3-content-share.md | insight cards, stories, embeds, downloads |
| B4 | agents/B4-accounts-billing-api.md | auth UI, billing, reports, API v1, admin |

## Wave 3 (orchestrator)

Integration, serial test runs (unit → db → e2e), dev-server verification of
every page, e2e suite authoring, README completion, perf pass, commits.

## Integration notes (wave 1)

- A3 done: run tests/db/tiles.db.test.ts; check GeoJSON payload sizes vs
  targets after seed; facilities route may need a required state filter at
  GRID3 scale (perf pass); facility layers re-mount check in rendered map.
- A4 done: run tests/db/profile-queries.db.test.ts; sitemap links
  /data-updates — A2's page is /updates, reconcile; approved
  getDatasetsForIndicator in profile-extra.ts (metadata, published join);
  optional perf item: bulk getLatestValuesForPlace() to cut ~120 queries per
  profile render; pyramid needs A1 seed with sex+ageGroup rows on pop_total.
- GiST index on boundary_simplified added as migration 0002 (apply at
  integration if A1's migrate didn't).

## Integration notes (wave 2)

- B1 done (55/55 unit): run tests/db/analytics.db.test.ts; verify in browser:
  horizontal ErrorBar direction on compare, scatter trend-line clipping,
  epi-curve bar click; ordinal duplicated in components/analytics/rank-format
  (acceptable; optional move to lib later).
- B3 done (64/64 unit): run tests/db/downloads.db.test.ts; WAVE-3 TODOS from
  B3: (1) move SiteHeader/Footer/DemoBanner from root layout into a (site)
  route-group layout so /embed/** is chrome-free + cacheable, then delete
  B3's CSS workaround in embed/layout.tsx; (2) move getPublishedDatasetValues
  from src/server/downloads/datasets.ts into src/server/indicators/queries.ts;
  (3) wire <DownloadButtons> into rankings (B1), place profiles (A4) and
  /updates (A2); (4) optional: /editor/content link in data-editor tabs;
  (5) browser-check OG images (single font weight), ward-level embed map
  payload (~7.8k values).
- B2 done (26/26 unit): run tests/db/area-analysis.db.test.ts; WAVE-3 TODO:
  add "dataset published OR NULL" filter to getFacilitiesGeoJSONString in
  src/server/tiles/geo-cache.ts (A3's route lacks it; B2's own route has it);
  known limits: quota not refunded on unexpected DB error after consume;
  1 km circles may hold no 2-km-spaced seed cells (UI explains).
- B4 done (45/45 unit): run tests/db/api-keys.db.test.ts + billing.db.test.ts;
  WAVE-3 TODO: (1) redistributableOnly option in getValuesForLevel/
  getTrendSeries so API licence gate falls back to older allowed values;
  (2) mock payments customerCode derive from reference not plan; known mock
  quirk otherwise. YAML subset parser lives under docs/api/_lib (accepted).
