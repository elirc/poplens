# Agent A1 — Geography, sources, seed & synthetic demo data

Read `agents/COMMON.md` and `docs/SPEC.md` (Data pipeline §1–2, Indicator
catalogue, Definition of done) first.

## Mission

Build the geography load + the full synthetic demo seed so that after
`pnpm seed` the portal has: all real states/zones + real LGA names, synthetic
wards, placeholder boundaries, the ~60-indicator catalogue, sources with
licences, a clearly-synthetic published demo dataset covering the catalogue,
sample facilities, population cells, outbreak history, demo accounts, two
stories and six insight cards.

## Owned files (exclusive)

- `scripts/seed.ts` (orchestrator; idempotent — safe to re-run)
- `scripts/load-grid3.ts` (REAL GRID3 load path: documented, runnable when
  files are present locally; graceful "file not found" message otherwise)
- `scripts/population-grid.ts` (REAL gridded-population aggregation script,
  documented the same way)
- `src/server/seed/**` (all seed/generator code)
- `docs/DATA-LOADING.md` (exact steps to obtain + load real GRID3/DHS files)
- Unit tests: `src/server/seed/*.test.ts`

## What to build

1. **Geography** (`src/server/seed/geography.ts`):
   - Nation + 6 zones + 37 states from `src/server/geo/nigeria-states.ts`.
   - All 774 real LGA names per state (embed the standard public list in a
     data file `src/server/seed/nigeria-lgas.ts`; this is reference data, not
     statistics — be accurate, it's well-known public information).
   - Synthetic wards: 8–12 per LGA named "<LGA> Ward 1..N", codes
     `<lgaCode>-W01`…
   - Boundaries: try downloading real simplified boundaries from geoBoundaries
     (ADM0/ADM1/ADM2 for Nigeria, CC BY 4.0 — cite in sources). URL pattern:
     check https://www.geoboundaries.org/api/current/gbOpen/NGA/ADM1/ for the
     `simplifiedGeometryGeoJSON` link. Cache downloads under `.storage/geo/`.
     If download fails, FALL BACK to placeholder geometry: subdivide Nigeria's
     bbox (2.6–14.7°E, 4.2–13.9°N) into state cells via a simple Voronoi
     around rough state centroids (embed centroid list), then grid-split each
     state cell into LGA rectangles and each LGA into ward rectangles.
     Either way set `boundary`, `boundarySimplified`
     (ST_SimplifyPreserveTopology ~0.01° for states, 0.005 LGAs, 0.002 wards),
     `centre` (ST_PointOnSurface), `areaSqKm` (ST_Area geography / 1e6), and
     `boundaryVersion` ('geoBoundaries-gbOpen-<date>' or 'placeholder-v1').
     Record which path was taken in the seed output + import_runs row.
   - Wards ALWAYS placeholder-subdivided (real ward shapes need GRID3 —
     document in DATA-LOADING.md).
   - geo_aliases: seed common alternates ("FCT", "Abuja", "Federal Capital
     Territory", "Akwa-Ibom", "Cross-River", "Nassarawa", etc.).
2. **Sources** (`src/server/seed/sources.ts`): rows for GRID3 (CC BY 4.0,
   redistribution allowed), DHS Program (registration terms — redistribution
   NOT allowed), WHO GHO (CC BY-NC-SA — NOT allowed), World Bank (CC BY 4.0 —
   allowed), NBS, NPC, NCDC, geoBoundaries, and 'synthetic' (PopLens demo,
   redistribution allowed). Fill citationTemplate.
3. **Indicator catalogue**: insert every entry from
   `src/server/indicators/catalogue-data.ts` (upsert by code).
4. **Synthetic demo dataset(s)** — all with `isSynthetic: true`, note
   "SYNTHETIC demo value — not a real statistic", source 'synthetic',
   PUBLISHED via `publishDataset` from `src/server/datasets/versioning.ts`:
   - Population indicators: national + state + LGA + ward values for 2023
     (make them plausibly consistent: ward sums ≈ LGA ≈ state ≈ national
     ~220m; use a deterministic PRNG seeded by code — reuse the hash approach
     from `src/adapters/connectors/synthetic.ts`). Include sex breakdown rows
     (sex='male'/'female') for pop_total, and age-group rows for the
     age-pyramid chart (ageGroup '0-4','5-9',…,'80+' for pop_total at
     state+national level).
   - Survey-style indicators (health outcomes/services/living): national +
     state values for 2013 & 2018 with CIs (reuse/extend the mock connector
     generators); LGA values for ~10 indicators for 2023 so LGA maps work.
   - Derived: pop_density, facilities_per_100k, people_per_facility computed
     from the seeded facilities + population.
   - Outbreak weekly data: `outbreak_reports` for all 4 diseases × 37 states
     × weeks 1–40 of 2024 (sparse — most state-weeks zero-case rows OMITTED,
     not zero), plus matching dataset row.
   - Facilities: ~3,000 synthetic facilities ("<Ward> Primary Health Centre",
     general hospitals per LGA, teaching hospitals per state) with points
     inside their ward/LGA boundary (ST_PointOnSurface + jitter), realistic
     type/careLevel/ownership mix.
   - population_cells: synthetic ~1km-ish grid, enough for area analysis to
     be meaningful around state capitals (~50k cells max; scatter within
     state polygons, weight toward centres; pop_total/u5/w1549 consistent
     with state totals).
5. **Demo accounts** (via Better Auth's server API `auth.api.signUpEmail` or
   direct insert matching its hash format — prefer the API):
   admin@poplens.ng / admin1234 (role admin), editor@poplens.ng / editor1234
   (data_editor), writer@poplens.ng / writer1234 (content_editor),
   user@poplens.ng / user1234 (user). Set roles by direct db update after
   signup. Also seed plans: free ₦0, pro ₦5,000/mo, org ₦50,000/mo
   (placeholders) using `DEFAULT_PLAN_LIMITS` from `src/lib/limits.ts`.
6. **Stories (2) + insight cards (6)**, published, authored by writer:
   stories use the chart shortcode contract documented in
   `src/db/schema/content.ts`; cards use spec kinds 'top5', 'vs_national',
   'single_stat' with real seeded indicator codes. Captions must say the data
   is synthetic demo data.
7. **import_runs**: one 'seed' run row recording stats.

## Exceptions granted (unlike other agents)

- You MAY run `pnpm db:setup`, `pnpm db:migrate`, `pnpm seed` and re-run them
  against the dev database (localhost:5541/poplens_dev) — you own dev-db
  content during your window. Keep seed idempotent (wipe-and-reload your own
  data: delete by source/series, not TRUNCATE of auth tables except your demo
  users).
- You MAY download geoBoundaries files (network) and cache under `.storage/geo/`.

## Unit tests (write AND run)

- Deterministic generator: same seed string → same values.
- Ward/LGA/state population consistency (sums within tolerance).
- Placeholder geometry validity: every ward centre inside its LGA bbox.

## Definition of done for this brief

`pnpm seed` (fresh db after migrate) completes < ~10 min, prints a summary
table (counts per table), `pnpm typecheck` clean, your unit tests green, and
simple psql spot-checks show: 37 states with boundaries, 774 LGAs, wards
present, >55 indicators, published synthetic datasets, demo banner condition
true (published synthetic dataset exists), facilities + cells + outbreaks
present, demo users exist.
