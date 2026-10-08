# Agent A4 — Home, place profiles, indicator pages, search, sitemap

Read `agents/COMMON.md` and `docs/SPEC.md` (Public features → Home, Place
profile, Indicator pages, search, server-rendered pages + sitemap) first.

## Mission

The core browse surface: the home page, a profile for every place (state,
LGA, ward), a page for every indicator, the combined place+indicator search,
and the sitemap. Server-rendered, fast on slow phones, every value sourced.

## Owned files (exclusive)

- `src/app/(public)/page-home/**` — no: replace `src/app/page.tsx` directly
  (it is yours), plus `src/components/home/**`
- `src/app/(public)/places/[code]/**` (profile page + sections/components)
- `src/app/(public)/indicators/page.tsx` (catalogue index) and
  `src/app/(public)/indicators/[code]/**` (indicator page)
- `src/app/(public)/about-data/page.tsx` (sources & licences overview)
- `src/server/search/**` (search queries + unit tests)
- `src/app/api/search/route.ts` (search endpoint for the client combobox)
- `src/components/search/**` (search box used on home + header-ready)
- `src/components/profile/**`, `src/components/indicators/**`
- `src/app/sitemap.ts`
- db test (write only): `tests/db/profile-queries.db.test.ts` if you add
  queries of your own in src/server/search.

## Contracts (read-only)

- Values: ONLY via `src/server/indicators/queries.ts` (getPublishedValue,
  getValuesForLevel, getTrendSeries, getAvailableYears, getCoverage,
  getSourcesForPlace, getIndicatorByCode, listIndicators).
- Ranks: `computeRanks`/`rankOf`/`ordinal` from
  `src/server/indicators/ranks.ts`; KEY_INDICATORS from
  `src/server/indicators/catalogue-data.ts`.
- Geo: `src/server/geo/queries.ts` (byCode, listGeoUnits, listChildren,
  getAncestors, getBoundaryGeoJSON, getCentre).
- UI: StatTile, SourceLine, ChartFrame (REQUIRED for every chart), shell.
- Facilities/outbreak data for profile sections: read via your own small
  queries in `src/components/profile/` server components is allowed for
  `health_facilities` and `outbreak_reports` tables (keep them in one file
  `src/components/profile/profile-data.ts`), since the owning agents build
  different pages. Keep these read-only queries simple.

## Pages

### Home (`/`, revalidate 300)
Headline national figures (KEY_INDICATORS via getPublishedValue for the
nation unit, StatTiles linking to indicator pages), featured insight cards
(up to 6 published `insight_cards` — render title+caption linking to
`/cards/<slug>`; the card image routes are another agent's, link to
`/cards/<slug>` only), latest stories (3, title+summary → `/stories/<slug>`),
and ONE search box (places + indicators combined). Keep hero light — no
heavy map on the home page (slow phones).

### Place profile (`/places/[code]`, revalidate 300)
- Breadcrumbs (ancestors), name + level badge, boundary version footnote.
- Key facts row: population, density, area, number of child units,
  facilities count.
- Age & sex chart where data exists (pop_total ageGroup breakdown rows via
  getTrendSeries-like query — use getPublishedValue? No: query breakdown
  rows through a function you add in `src/server/search/profile-extra.ts`
  if indicator queries don't cover it; keep the published-join rule by
  copying the join pattern, with a code comment). Pyramid = two horizontal
  bar series (male left / female right), ChartFrame + table view, "No data"
  state when absent.
- Indicator tiles grouped by category: latest value + national figure +
  rank among siblings (computeRanks over getValuesForLevel of its level,
  same year) via StatTile's `national`/`rank` props.
- Trends section: small multiples (up to 6 KEY_INDICATORS) using
  getTrendSeries(place + nation), survey years as dots, source-change
  markers (break line on sourceId change).
- Facilities: count by careLevel + a simple list (top 15 by level) and a
  static-ish mini map IF cheap — otherwise link to `/facilities?lga=<code>`
  (B2's page; link is fine).
- Outbreak history (states and their LGAs' parent state): weekly confirmed
  cases per disease for the last seeded year, small bars, ChartFrame.
- Sources used: getSourcesForPlace list.
- generateStaticParams: none (too many) — dynamic + revalidate; set
  `dynamicParams = true`.

### Indicator pages (`/indicators`, `/indicators/[code]`, revalidate 600)
Index: grouped catalogue with category sections and search filter (client).
Detail: definition, unit/type/direction, method notes & caveats, coverage
table (getCoverage), available years, national trend chart (ChartFrame),
latest state map LINK to `/explore?...` (deep-link via A3's URL params:
`indicator=<code>&year=<y>&level=state` — coordinate format:
`/explore?i=<code>&y=<year>&l=state`; A3 defines exact keys in
`src/lib/map-state.ts` — read that file), top/bottom 5 states for the latest
year (computeRanks), and the sources/datasets feeding it.

### about-data
Table of `sources` (publisher, licence, redistribution allowed, link) +
plain-language notes from the spec's Assumptions (estimates, census 2006,
finest-level rule).

### Search
Server: `searchAll(q)` in `src/server/search/` — places by name/alias
(pg_trgm similarity + prefix boost, limit 8, show level + parent context)
and indicators by name/code (ILIKE + similarity, limit 5). Route handler
`GET /api/search?q=` (rate-limit with limitOr429, cache 60s). Client:
accessible combobox (keyboard navigable, debounced 200ms) → navigates to
/places/<code> or /indicators/<code>. Unit-test the ranking/normalization
pure parts.

### Sitemap
`src/app/sitemap.ts`: home, static pages, every indicator, every place
(states+LGAs always; wards capped to first 2,000 by code for sitemap size),
using env.APP_URL.

## Done when

Typecheck + lint clean; search unit tests green; every page renders real
seeded data pathways (verified by reading queries — orchestrator will run
the server); "No data" semantics everywhere; no direct indicator_values
queries outside the allowed files.
