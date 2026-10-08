# Agent A2 — Data pipeline: matching, connectors, upload wizard, publish workflow

Read `agents/COMMON.md` and `docs/SPEC.md` (Data pipeline §3–5, Engineering
rules, Staff tools → Data editor) first.

## Mission

Everything that moves data into the portal: the place-name matching engine,
the connector run pipeline (mock + REAL drivers), the staff upload wizard
(CSV/Excel → mapped → validated → draft), draft review/publish/rollback UI,
sources & licence management, alias review, quality flags, and the public
data-updates page.

## Owned files (exclusive)

- `src/server/geo/matching.ts` (+ `matching.test.ts`)
- `src/server/pipeline/**` (connector run, staging, diff/changeSummary,
  upload parsing/validation/import; include unit tests)
- `src/server/uploads/**` if you prefer a separate folder for upload logic
- `src/adapters/connectors/dhs/real.ts`, `who/real.ts`, `worldbank/real.ts`
  (replace the throwing stubs) and you MAY extend the three `mock.ts` files
  and `src/adapters/connectors/synthetic.ts` if needed (keep their exports)
- `src/worker/jobs/connectors.ts` (fill the registry; keep the export name)
- `src/app/(staff)/editor/**` EXCEPT `editor/content/**` (content editor UI
  belongs to another agent): dashboard, sources, connector runs, upload
  wizard (multi-step), drafts list + draft detail (diff view), publish,
  rollback, aliases, quality flags
- `src/app/(public)/updates/page.tsx` (public data updates page)
- db tests (write, DON'T run): `tests/db/pipeline.db.test.ts` and
  `tests/db/publish-visibility.db.test.ts`

## Contracts you must use (read-only)

- `StagedValue` / `ConnectorRunResult` in `src/adapters/types.ts`; adapter
  selection via `getConnector()` in `src/adapters/index.ts`.
- Dataset lifecycle via `src/server/datasets/versioning.ts`
  (`nextVersionForSeries`, `publishDataset`, `rollbackDataset`,
  `listPublishedChanges`) — do not reimplement.
- Staff gating: `requireRole("data_editor")` in every action/page.
- Files via `getStorage()`; parse CSV with papaparse, Excel with exceljs.
- Audit every state change (`writeAudit`): dataset.create_draft,
  dataset.publish, dataset.rollback, alias.confirm, source.update, …

## Matching engine (spec exactly)

Order: official code → exact name (normalized) → alias → fuzzy (pg_trgm
similarity, threshold ~0.45, scoped to the expected level and, when known,
the parent state). Return per row: { status: 'matched'|'review'|'unknown',
geoUnitId?, candidates: [{geoUnitId, name, score}] }. Uncertain rows go to a
review list in the wizard; a confirmed match INSERTS a geo_alias
(origin 'upload-review'). Normalization: lowercase, trim, collapse
whitespace, strip punctuation, drop suffixes like "state", "lga".

## Upload wizard flow (staff UI)

upload file → preview rows → map columns (place, period/year, indicator,
value, optional lower/upper/sex/age/residence) with indicator picked from
catalogue → place-match review screen → validation report (range sanity by
valueType [percent 0–100 etc.], duplicate (place,year,breakdown) rows,
unknown places, non-numeric values; errors block, warnings listed) → creates
DRAFT dataset (+ stored original file via storage adapter, import_runs row,
changeSummary diff vs currently-published version of the same seriesKey:
counts added/changed/removed + sample changes).

Also ship a downloadable CSV upload template (route or static file),
including the NCDC outbreak template (disease,state,year,week,suspected,
confirmed,deaths) — outbreak uploads land in `outbreak_reports` (same draft
dataset mechanics).

## Connector pipeline

`runConnector(kind, actorId|null)`: import_runs row → adapter.run() →
resolve places via matching engine (unresolved → run log warnings; DHS state
names like "Nasarawa"/"FCT Abuja" must resolve via aliases) → create draft
dataset (seriesKey from result, next version, changeSummary diff) → bulk
insert indicator_values (batch inserts, ~1k rows per statement) → finish run.
Expose as both a server action (staff "Run now" button) and pg-boss jobs
(weekly cron) in `src/worker/jobs/connectors.ts`.

## REAL connector drivers

Per spec you MUST check current API docs before coding (use web fetch/search):
- DHS: https://api.dhsprogram.com/#/index.html — indicator data endpoint,
  countryIds=NG, breakdown=subnational for state rows; map DHS indicator ids
  to our catalogue codes (document the mapping table in the driver).
  Confirm reachability at build time; note result in your report + README
  section `docs/DATA-LOADING.md` owned by A1 — give A1's file a PR-style
  note in your report instead of editing it.
- WHO GHO OData: https://www.who.int/data/gho/info/gho-odata-api
  (ghoapi.azureedge.net/api/<IndicatorCode>?$filter=SpatialDim eq 'NGA').
- World Bank: api.worldbank.org/v2/country/NGA/indicator/<code>?format=json.
Drivers must be resilient (paging, retries ×2, timeouts) and NEVER run in
mock mode. Mapping tables live beside each driver.

## Public updates page

`/updates`: list from `listPublishedChanges` — what changed, when, source,
version, synthetic badge, change summary counts. `revalidate = 300`.

## db tests to WRITE (not run)

1. pipeline.db.test.ts: seed minimal geo + catalogue fixtures (do not depend
   on A1's seed), run a mock connector import → draft; validate changeSummary;
   upload-validation failures (bad range, duplicate, unknown place).
2. publish-visibility.db.test.ts (spec Definition-of-done test): draft values
   invisible through `getPublishedValue`/`getValuesForLevel`; publish makes
   them visible; publishing v2 supersedes v1; rollback of v2 restores v1
   values exactly. Use `truncateAll()` from `tests/db-helpers.ts` in
   beforeEach.

## Done when

Typecheck + lint clean; matching + validation unit tests green (run them);
staff can (in code paths, verified by your reading + unit coverage): upload →
review → publish → rollback; connector "Run now" works in mock mode; db tests
written; real drivers implemented against checked docs with mapping tables.

## Build-time reachability check (verified by orchestrator, 2026-10-08)

All three APIs were probed successfully from this machine today:
- DHS `GET https://api.dhsprogram.com/rest/dhs/indicators?countryIds=NG&perPage=2&f=json` → 200, JSON with TotalPages=2070.
- WHO GHO `GET https://ghoapi.azureedge.net/api/WHOSIS_000001?$filter=SpatialDim eq 'NGA'&$top=1` → 200, OData JSON.
- World Bank `GET https://api.worldbank.org/v2/country/NGA/indicator/SP.POP.GROW?format=json&per_page=2` → 200 (note: data endpoint uses `NGA`, response countryiso3code NGA).
Record this (and anything further you learn) in your report so the README's
source table can state it. DHS data endpoint for values is
`/rest/dhs/data?countryIds=NG&indicatorIds=…&breakdown=subnational` — verify
exact parameter names against the API docs before coding.
