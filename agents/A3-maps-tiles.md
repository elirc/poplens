# Agent A3 — Map explorer, GeoJSON & vector tiles

Read `agents/COMMON.md` and `docs/SPEC.md` (Public features → Map explorer;
Tech stack → MapLibre; Engineering rules on performance + colour) first.

## Mission

The map platform: cached GeoJSON + MVT tile routes, the shared MapLibre map
components, and the full `/explore` map explorer (indicator/year/level
pickers, class-break legend, hover values, click-through to profiles,
facility layer toggle, table view, year stepper).

## Owned files (exclusive)

- `src/app/api/geo/**` (GeoJSON route handlers)
- `src/app/api/tiles/**` (MVT ward/LGA tiles via ST_AsMVT)
- `src/server/tiles/**` (tile SQL + in-memory LRU cache; include unit tests
  for cache key logic)
- `src/components/map/**` (shared: BaseMap, ChoroplethLayer, FacilityLayer,
  MapLegend, hover popup)
- `src/app/(public)/explore/**` (the explorer page + its client components)
- `src/lib/map-state.ts` (URL-param (de)serialization for map state so views
  are shareable/savable; unit tests)

## Contracts (read-only)

- Geo data: `src/server/geo/queries.ts` (`getLevelGeoJSON`, …). Values:
  `getValuesForLevel`, `getAvailableYears` from
  `src/server/indicators/queries.ts`.
- Class breaks + ramps + NO_DATA_COLOR: `src/lib/class-breaks.ts` (quantile /
  equal / jenks — expose the choice in the legend UI).
- Map style: `env.MAP_STYLE_URL` passed from a server component (client gets
  it via props — never read env client-side).
- react-map-gl v8: `import Map, { Source, Layer } from "react-map-gl/maplibre"`,
  maplibre-gl CSS imported once in your BaseMap.

## Routes

- `GET /api/geo/levels/[level]` → FeatureCollection (simplified) for states /
  LGAs (optionally `?parent=<id>`); `Cache-Control: public, max-age=3600,
  stale-while-revalidate=86400`. Rate-limit with `limitOr429` (generous).
- `GET /api/geo/unit/[code]` → single Feature (profile pages will reuse).
- `GET /api/tiles/wards/[z]/[x]/[y]` → application/x-protobuf MVT from
  PostGIS `ST_AsMVT(ST_AsMVTGeom(boundary_simplified, ST_TileEnvelope(z,x,y)))`
  with properties id/code/name; LRU-cache tiles in-process (~500 tiles) +
  HTTP caching; 204 for empty tiles. Guard z to 4–12.
- Optionally `/api/tiles/lgas/...` same way if GeoJSON proves heavy; states
  always GeoJSON.

## Explorer UX (phone-first)

- Controls: indicator picker (grouped by category, searchable), year stepper
  (from `getAvailableYears`, ◀ year ▶ + a small timeline), level toggle
  (states / LGAs / wards), class-break method + bucket count (5 default),
  facility layer toggle (clustered circles by careLevel colour — Okabe-Ito),
  legend with ranges formatted via `formatValue`.
- Choropleth: join values client-side onto features by geo id (fetch values
  from a small JSON route you own: `GET /api/geo/values?indicator=&year=&level=`
  → [{id, value}] — implement under `src/app/api/geo/values/route.ts` using
  `getValuesForLevel`). Fill colours via feature-state or a match expression;
  places with no value get NO_DATA_COLOR and "No data" in the hover popup.
- Hover (desktop) / tap (mobile): name + formatted value + source short line.
  Click → `/places/<code>` (pages built by A4 — link regardless).
- Table view: same data as a sortable table (TanStack Table), with the same
  source line; toggle chart/table lives in the page (you may use ChartFrame
  or your own tabs — keep the attribution visible either way).
- Wards level: switch choropleth source to the MVT tiles; when zoomed out
  past z6 show a notice "zoom in to see wards".
- The whole map state lives in the URL (`src/lib/map-state.ts`) so Save-view
  (later feature) and sharing work.
- Demo banner comes from the layout automatically; you do nothing.
- Outbreak map mode is NOT yours (B1); facilities full page is NOT yours (B2) —
  but build `FacilityLayer` generic enough for reuse (props: filters).

## Performance

Simplified geometries only; never ship full boundaries. States GeoJSON should
be well under ~400 KB; if the LGA FeatureCollection exceeds ~1.5 MB from the
seeded placeholder shapes, note it in your report (A1 controls simplification
tolerances). Memoize parsed GeoJSON client-side; avoid re-fetch on year
change (values route is separate from shapes).

## Tests

Unit: map-state round-trip; tile cache keys; (class-breaks already tested by
orchestrator). Write a db test `tests/db/tiles.db.test.ts` asserting the MVT
SQL returns a non-empty buffer for a seeded fixture ward at its centre tile
(insert fixture geometry yourself; don't rely on A1's seed) — WRITE ONLY, do
not run.

## Done when

Typecheck + lint clean; unit tests green; explorer page complete with all
controls wired; routes correct and cached; no dev-server run (orchestrator
verifies rendering).
