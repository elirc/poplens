# Agent B2 — Facilities explorer & area analysis

Read `agents/COMMON.md` and `docs/SPEC.md` (Public features → Facilities,
Area analysis; Data pipeline §2) first. Wave-1 code exists; dev DB is seeded
with facilities + population_cells.

## Owned files (exclusive)

- `src/app/(public)/facilities/**`
- `src/app/(public)/area/**`
- `src/server/facilities/**` (queries: filters, people-per-facility by LGA,
  nearest-N; unit tests for pure parts)
- `src/server/area/**` (area analysis PostGIS queries + quota enforcement;
  THE "population inside a shape" logic)
- `src/app/api/facilities/**` (GeoJSON/clustered points route for the map)
- db tests (write only): `tests/db/area-analysis.db.test.ts` — REQUIRED by
  the spec's definition of done ("population inside a shape" unit coverage):
  insert fixture cells/facilities/LGAs with known geometry, assert counts
  and populations inside a circle and a polygon, plus LGAs-touched.

## Contracts (read-only)

- Geo + map components from wave 1 (`src/components/map/**` — BaseMap,
  FacilityLayer, MapLegend; import, don't copy).
- Quotas: `getUserPlan` + `consumeDailyQuota(userId,'area_analysis',
  limits.areaAnalysesPerDay)` from `src/lib/limits.ts`. Anonymous visitors:
  area analysis requires sign-in (free accounts get 3/day per spec);
  show a friendly sign-in prompt.
- Session: `getCurrentUser`/`requireUser`.
- Facilities data: your queries over `health_facilities` (public data, no
  dataset-status join needed — facilities are loaded by geography/seed, but
  DO filter to rows whose dataset is published OR datasetId IS NULL).

## Facilities page (`/facilities`)

- Map of facilities (clustered circle layer; colour by careLevel, Okabe-Ito)
  with filter panel: type (free text options from DB distinct), care level,
  ownership, state/LGA scoping (`?lga=NG-KN-GWALE` deep link from profiles).
- List view (TanStack table) synced to filters: name, type, level,
  ownership, LGA, ward; paginated server-side (~50/page).
- "People per facility by LGA": choropleth toggle that colours LGAs by the
  people_per_facility indicator (via getValuesForLevel — A1 seeded it) +
  ranked table. Use class-breaks lib + NO_DATA_COLOR.
- "Nearest facilities": tap the map (or use my-location button) → panel of
  the 10 nearest (ST_Distance on geography, meters/km shown) with type +
  ownership. Endpoint under `src/app/api/facilities/nearest/route.ts`
  (rate-limited via limitOr429).

## Area analysis (`/area`)

- Drop a pin + radius slider 1–50 km, OR draw a polygon (simple click-to-add
  -vertex drawing you implement on the MapLibre canvas — no extra deps; store
  as GeoJSON). Show the shape on the map.
- Server action `runAreaAnalysis(shape)` (Zod-validated GeoJSON circle
  {center:[lng,lat], radiusKm} or polygon; validate radius bounds, polygon
  ring size ≤ 100 vertices, area ≤ a sane cap ~50,000 km²):
  1. `requireUser()`; enforce quota (consumeDailyQuota) — Pro/org unlimited.
  2. PostGIS: estimated population inside = SUM over population_cells where
     ST_DWithin(geography) / ST_Within (document the cell-centre
     approximation in the UI footnote: "estimate from ~1 km population
     cells"); also under-5 + women 15–49 sums where present.
  3. Facilities inside, grouped by type and care level; people per facility.
  4. LGAs touched: ST_Intersects on boundary, listed with links to profiles.
- Results panel: population (formatted, labelled estimate with source =
  population dataset source/year), facility counts by type, people/facility,
  LGA chips. Quota state shown ("2 of 3 free analyses left today").
- Shareable: shape serialized into the URL hash (no server storage).

## Done when

Typecheck + lint clean; your unit tests green; db tests written; both pages
complete with quota behaviour correct; no dev-server runs.
