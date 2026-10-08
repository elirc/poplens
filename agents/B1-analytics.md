# Agent B1 — Compare, rankings, trends, relationships, outbreaks

Read `agents/COMMON.md` and `docs/SPEC.md` (Public features → Compare,
Rankings, Trends, Relationships, Outbreaks) first. Wave-1 code (explorer,
profiles, seed) exists — reuse its patterns; the dev DB is seeded.

## Owned files (exclusive)

- `src/app/(public)/compare/**`
- `src/app/(public)/rankings/**`
- `src/app/(public)/trends/**`
- `src/app/(public)/relationships/**`
- `src/app/(public)/outbreaks/**`
- `src/components/analytics/**` (shared pickers: multi-place picker,
  indicator picker — build ONCE here and reuse across your pages)
- `src/server/analytics/**` (correlation, outbreak series queries; unit
  tests for correlation/regression math)
- db test (write only): `tests/db/analytics.db.test.ts` if you add queries.

## Contracts (read-only)

Values ONLY via `src/server/indicators/queries.ts`; ranks via
`src/server/indicators/ranks.ts`; geo via `src/server/geo/queries.ts`;
outbreak_reports may be queried via your own `src/server/analytics/outbreaks.ts`
(simple selects joined to published datasets — copy the published-join rule:
only rows whose dataset status='published'). Charts in ChartFrame with table
views and SourceLine. Okabe-Ito categorical palette (COMMON.md). URL params
hold all state so views are shareable.

## Pages (all revalidate 300 or dynamic with cached fetches; phone-first)

### Compare (`/compare?places=NG-KN,NG-LA&indicators=u5mr,anc4`)
Up to FOUR places side by side. Sticky place header chips (add/remove via
place picker). One chart per selected indicator: grouped bars of the latest
common year (or latest each, labelled), with CI whiskers where bounds exist,
plus the national reference line. Below each chart its table. Enforce the
max-4 rule in UI and in param parsing.

### Rankings (`/rankings?indicator=u5mr&level=state&year=2018`)
All states (or LGAs — level toggle; wards excluded) ordered by an indicator:
sortable TanStack table (rank, place, value+CI, year, source) AND a
horizontal bar chart (top N with "show all" expand). Rank direction from
higherIsBetter (ranks via computeRanks). Year picker from getAvailableYears.
Link each place to its profile. "No data" places listed separately at the
bottom, never ranked.

### Trends (`/trends?indicator=u5mr&places=NG,NG-KN`)
Indicator over time, one line per place (max 6). Survey years marked with
dots + period labels; the line BREAKS where sourceId changes with a visible
marker and a footnote "sources differ — segments are not directly
comparable" (spec rule). Y-axis starts at 0 for counts/percent.

### Relationships (`/relationships?x=female_literacy&y=u5mr&year=2018`)
Scatter across states for two indicators (latest common year or picked),
point labels on hover (state name + both values), least-squares trend line,
Pearson r displayed with plain note: "Correlation is not causation — a
relationship here may reflect other factors." Implement pearson + linear fit
in `src/server/analytics/stats.ts` with unit tests (include degenerate
cases: n<3, zero variance → no line, show note). Only states with BOTH
values plotted; count shown.

### Outbreaks (`/outbreaks?disease=cholera&year=2024&week=…`)
Weekly cases by disease and state: a state map coloured by cases for the
selected week (reuse A3's choropleth components from `src/components/map/`
— import, don't copy), a week scrubber, and a national epi-curve chart
(stacked suspected/confirmed per week) + per-state small table. Disease
tabs. Data via your outbreaks queries. Case counts are counts, not rates —
mention per-100k nowhere (don't derive statistics).

## Done when

Typecheck + lint clean; stats unit tests green (run them); all five pages
complete, phone-first, shareable URLs; no dev-server runs.
