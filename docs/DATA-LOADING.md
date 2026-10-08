# Data loading — demo seed and real sources

PopLens never invents statistics. Out of the box, `pnpm seed` loads **real
reference geography** (names, codes and, when downloadable, real boundaries)
plus a **clearly labelled SYNTHETIC demo dataset** so every page works. This
document explains exactly what the seed loads, and the steps to replace the
synthetic parts with real GRID3 / survey data.

---

## 1. Demo seed (`pnpm seed`)

```bash
pnpm db:setup && pnpm db:migrate     # once
pnpm seed                            # real boundaries if downloadable
pnpm seed --placeholder-geo          # force offline placeholder shapes
```

The seed is idempotent: re-running it upserts reference data and replaces all
synthetic datasets. It prints a per-table summary and records an `import_runs`
row (`kind = 'seed'`) whose `stats` say which geography path was used. It takes
roughly 4–6 minutes on a laptop (mostly PostGIS work and password hashing).

| Loaded | Real or synthetic | Notes |
| --- | --- | --- |
| Nation, 6 zones, 37 states (36 + FCT) | Real reference data | `src/server/geo/nigeria-states.ts` |
| 774 LGAs | Real reference data | `src/server/seed/nigeria-lgas.ts`; names follow GRID3 (2022) with common spellings; alternates seeded as `geo_aliases` |
| State / LGA boundaries | **Real** (geoBoundaries gbOpen, sourced from GRID3, CC BY 4.0) or placeholder | see §1.1 |
| Wards (8–12 per LGA, "`<LGA>` Ward N", codes `<lga>-W01`…) | **Synthetic** | real ward shapes need GRID3 operational wards (§2.2) |
| Sources + licences | Real licence facts | `src/server/seed/sources.ts` — re-check before production |
| ~60-indicator catalogue | Definitions only | `src/server/indicators/catalogue-data.ts` |
| Values, facilities, population cells, outbreaks | **SYNTHETIC** | source `synthetic`, `datasets.is_synthetic = true`, every value noted "SYNTHETIC demo value — not a real statistic" |
| Demo accounts, plans, 2 stories, 6 insight cards | Demo content | copy says the data is synthetic |

While any published dataset is synthetic, every page shows the demo banner
(`src/server/demo.ts`).

### 1.1 Boundaries: real download or placeholder

The seed calls the geoBoundaries API
(`https://www.geoboundaries.org/api/current/gbOpen/NGA/ADM{0,1,2}/`), follows
each level's `simplifiedGeometryGeoJSON` link and caches the files in
`.storage/geo/` (re-runs use the cache, no network). At build time the
API was reachable and reported: source GRID3, licence CC BY 4.0, build date
2023-12-12, 37 ADM1 units and 774 ADM2 units. Geo units then carry
`boundary_version = 'geoBoundaries-gbOpen-2023-12-12'`.

- States match by ISO code (`NG-KN`…); LGAs are assigned to the state
  containing their point-on-surface and matched by name (plus aliases) within
  that state. At build time all 774 matched.
- If the download or matching fails, **or** `--placeholder-geo` is passed, the
  seed falls back to **placeholder geometry** (`boundary_version =
  'placeholder-v1'`): Voronoi cells around rough state centroids inside
  Nigeria's bounding box (2.6–14.7°E, 4.2–13.9°N), each cell sliced into LGA
  rectangles and each LGA into ward rectangles. These shapes are schematic and
  must not be used for anything but demos.
- Wards are always synthetic: on the real path each LGA is split into its
  wards by seeded random points → Voronoi cells clipped to the LGA.
- Every unit gets `boundary_simplified` (ST_SimplifyPreserveTopology: 0.01°
  states/zones, 0.005° LGAs, 0.002° wards), `centre` (ST_PointOnSurface) and
  `area_sq_km` (geography area).

---

## 2. Loading real GRID3 boundaries and facilities (`pnpm load:grid3`)

GRID3 Nigeria data is published on the GRID3 data hub
(<https://data.grid3.org/>), e.g. the state and LGA boundary datasets
`grid3-nigeria-state-boundaries` and
`grid3-nigeria-local-government-area-boundaries-1`, plus the operational ward
boundaries and the health-facility list. GRID3 data is CC BY 4.0; cite GRID3
and record the version you downloaded.

### 2.1 Prepare the files

1. Download each layer as **GeoJSON** (or shapefile → convert:
   `ogr2ogr -f GeoJSON -t_srs EPSG:4326 wards.geojson <file>.shp`).
2. Put them in `.storage/grid3/` (or any folder passed with `--dir`) with these
   names — each is optional:
   `states.geojson`, `lgas.geojson`, `wards.geojson`, `health-facilities.geojson`.
3. **Check the attribute names** — they change between GRID3 releases:

   ```bash
   pnpm load:grid3 --inspect
   ```

   The loader auto-detects common names (`statename`, `lganame`, `wardname`,
   `wardcode`, `primary_name`, `type`, `category`, `ownership`, …). For any
   role it cannot detect it stops and lists the available attributes; pass
   `--field-<role>=<attribute>` (roles: `state`, `lga`, `ward`, `ward-code`,
   `fac-name`, `fac-type`, `fac-level`, `fac-ownership`, `version`).

### 2.2 Load

```bash
pnpm load:grid3 --dry-run --version "GRID3 NGA wards v<x> (<date>)"   # match report only
pnpm load:grid3 --version "GRID3 NGA wards v<x> (<date>)" --replace-synthetic --publish
```

- States/LGAs: names are matched to the reference list (aliases included;
  state is taken from the attribute or, if absent, spatially). Boundaries,
  simplified shapes, centres, areas and `boundary_version` are updated — so
  the version is recorded **per state / LGA / ward**, as the spec requires
  (GRID3 ward lists are newer for some states than others; pass a per-feature
  `--field-version` if the file carries one).
- Wards: inserted under their LGA. `--replace-synthetic` deletes the synthetic
  `<lga>-Wnn` wards of every LGA that received real wards (and their synthetic
  values).
- Facilities: loaded into a new dataset in series `grid3-health-facilities`
  (source `grid3`), attached to ward/LGA/state by containment; older GRID3
  facility loads are replaced; `--replace-synthetic` removes the synthetic
  facilities. Care level and ownership are mapped from the type/category and
  ownership text.
- Each run writes an `import_runs` row (`kind = 'grid3'`).

After loading real facilities, recompute `facilities_per_100k` and
`people_per_facility` (they are derived values; the synthetic ones belong to
the `synthetic-facilities` dataset and disappear when synthetic data is
removed — see §5).

---

## 3. Real gridded population (`pnpm load:population`)

Data pipeline §2: read the GRID3 gridded population raster, sum it to ~1 km
cells, load `population_cells`, and sum to ward / LGA / state / nation.

1. Download the Nigeria gridded population estimates (GRID3 / WorldPop
   bottom-up model, ~100 m GeoTIFF; optional under-5 and women 15–49 rasters)
   from the GRID3 data hub or the WorldPop Open Population Repository
   (<https://wopr.worldpop.org/>). Note the version and licence.
2. Convert the raster to XYZ text with GDAL (no raster reader is bundled):

   ```bash
   gdal2xyz.py -skipnodata -csv NGA_population_gridded.tif pop.xyz
   # optional: pre-aggregate to ~1 km first to shrink the file
   gdalwarp -tr 0.0083333333 0.0083333333 -r sum NGA_population_gridded.tif pop_1km.tif
   ```

3. Load (dataset stays a **draft** unless `--publish`):

   ```bash
   pnpm load:population --xyz pop.xyz --u5 u5.xyz --w1549 w1549.xyz \
     --year 2020 --version "GRID3 NGA population v2.0" --replace-synthetic
   ```

   The script sums values into 30-arc-second (~0.9 km) cells (`--cell` to
   change), creates a draft dataset in series `grid3-population`, inserts the
   cells, and writes `pop_total` (and `pop_u5` / `pop_w1549`) for every
   state, LGA and ward (cells contained in the boundary) and the nation. A
   data editor then reviews and publishes it in the staff tools. It refuses to
   run next to synthetic cells unless `--replace-synthetic` is passed, because
   area analysis sums all cells.

---

## 4. Survey and national series (connectors) and outbreak uploads

- **DHS Program API** (state + national survey indicators), **WHO GHO** and
  **World Bank** (national series) are loaded by the connector jobs in the
  staff tools / worker (`ADAPTER_CONNECTOR_*=real`). Each run lands as a
  draft dataset with a diff against the published version. If the DHS API is
  unreachable, the Humanitarian Data Exchange carries a copy of Nigeria's
  subnational DHS indicators that can be loaded through the upload wizard.
- **NBS / NPC / MICS files** go through the upload wizard (CSV/Excel → map
  columns → place-name review → validation → draft → publish).
- **NCDC outbreak figures** are entered from the PDF situation reports using
  the outbreak upload template (`disease,state,year,week,suspected,confirmed,deaths`).
  Nothing is scraped.

---

## 5. Going live: removing the synthetic data

When real data covers what you need, remove the demo data so the banner
disappears: roll back / delete the five `synthetic-*` datasets
(`synthetic-population`, `synthetic-surveys`, `synthetic-facilities`,
`synthetic-population-grid`, `synthetic-outbreaks`). Deleting a dataset
cascades to its `indicator_values` and `outbreak_reports`; delete its
`health_facilities` and `population_cells` first (they reference the dataset
without cascade). Do not re-run `pnpm seed` afterwards — it recreates them.

---

## 6. Sources and licences (seeded in `sources`)

| key | Publisher | Licence | Redistribution (downloads/API) |
| --- | --- | --- | --- |
| `grid3` | GRID3 | CC BY 4.0 | allowed |
| `geoboundaries` | geoBoundaries (William & Mary geoLab), data from GRID3 | CC BY 4.0 | allowed |
| `dhs` | The DHS Program (ICF / USAID) | DHS terms of use | **not allowed** |
| `who-gho` | World Health Organization | CC BY-NC-SA 3.0 IGO | **not allowed** (non-commercial) |
| `worldbank` | The World Bank | CC BY 4.0 | allowed |
| `nbs` | National Bureau of Statistics | NBS terms (not expressly licensed) | not allowed until confirmed |
| `npc` | National Population Commission | NPC terms (not expressly licensed) | not allowed until confirmed |
| `ncdc` | Nigeria Centre for Disease Control and Prevention | NCDC terms (not expressly licensed) | not allowed until confirmed |
| `synthetic` | PopLens demo data | CC0 (generated) | allowed |

---

## 7. Checking a load

```sql
SELECT level, count(*), count(boundary) AS with_shape, min(boundary_version)
FROM geo_units GROUP BY level ORDER BY level;

SELECT series_key, version, status, is_synthetic FROM datasets ORDER BY id;

SELECT kind, status, started_at, stats->'geography'->>'path' AS geo_path
FROM import_runs ORDER BY id DESC LIMIT 5;
```
