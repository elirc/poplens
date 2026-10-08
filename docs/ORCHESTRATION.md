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

## Wave 2 (parallel Opus agents, after wave-1 integration)

| Agent | Brief | Area |
| --- | --- | --- |
| B1 | agents/B1-analytics.md | compare, rankings, trends, relationships, outbreaks |
| B2 | agents/B2-facilities-area.md | facilities explorer + area analysis |
| B3 | agents/B3-content-share.md | insight cards, stories, embeds, downloads |
| B4 | agents/B4-accounts-billing-api.md | auth UI, billing, reports, API v1, admin |

## Wave 3 (orchestrator)

Integration, serial test runs (unit → db → e2e), dev-server verification of
every page, e2e suite authoring, README completion, perf pass, commits.
