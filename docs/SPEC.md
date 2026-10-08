# PopLens — Product Specification (verbatim from product owner)

PopLens is a working name. This is the authoritative spec. Do not deviate without recording the deviation in the README.

You are building a complete, production-quality web application called PopLens. It is a public data portal that gives location-based insight into Nigeria's population and health indicators, from the national level down to states, local government areas (LGAs) and wards. It is similar in spirit to StatiSense: clear numbers, maps, comparisons and shareable insight cards, each with its source. Build the full application described here, not a mock-up. Work through the phases in order and keep the app runnable after each one.

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

## Roles

- Visitor: explores maps, profiles, rankings and stories without an account.
- Registered user: saves views and places, and gets limited area analysis.
- Pro user and organisation member: downloads, custom reports, API keys.
- Data editor: manages sources, runs imports, reviews and publishes datasets.
- Content editor: writes stories and publishes insight cards.
- Platform admin: users, plans, usage, audit log.

## Tech stack

Use this stack. If a library has changed, use its current stable version and note the change in the README.

- TypeScript in strict mode, Node.js LTS, pnpm.
- Next.js latest stable with the App Router: server-rendered public pages with timed revalidation, Server Actions for mutations, route handlers for the API, map tiles and webhooks.
- PostgreSQL with the PostGIS and pg_trgm extensions, Drizzle ORM, drizzle-kit migrations.
- Better Auth: email and password, phone number with OTP, and the organization plugin.
- Tailwind CSS and shadcn/ui, react-hook-form with Zod, TanStack Table, Recharts.
- MapLibre GL JS through react-map-gl, with OpenStreetMap-based vector tiles for the base map (OpenFreeMap by default; the style URL is an env var). Serve state and LGA shapes as simplified GeoJSON and ward shapes as vector tiles built with PostGIS ST_AsMVT, cached.
- pg-boss for queues and scheduled jobs, run by a separate worker process in the same repo.
- next/og for insight card images. React-PDF (@react-pdf/renderer) for profile and custom reports, with maps drawn as SVG by d3-geo. ExcelJS and CSV for downloads.
- Adapters in src/adapters, each with a mock driver and a real driver chosen by env: data connectors (DHS, WHO, World Bank), email (Resend), SMS (Termii), subscription payments (Paystack), file storage (S3-compatible or local disk).
- Vitest for unit tests, Playwright for end-to-end tests, ESLint and Prettier.
- Docker Compose with web, worker and db (a PostGIS image), plus a documented .env.example.

## Engineering rules

- Never invent a statistic. Real values enter only through connectors and uploads. Seed data for demos is synthetic, and every page shows a demo-data banner while synthetic data is loaded.
- Every value on screen shows its source, year and whether it is an estimate, with a confidence interval where the source gives one.
- Missing data is shown as no data, never as zero.
- Values from different sources for the same indicator are never joined into one trend line without a visible marker.
- Keep full dataset version history. Publishing is a deliberate step, and any published version can be rolled back.
- Store API keys hashed. Enforce per-plan rate limits. Log every download.
- Check permissions on the server in every action. Validate all input with Zod. Rate-limit sign-in and public endpoints. Verify Paystack webhook signatures.
- Public pages must load fast on a slow phone: server-render, cache, simplify shapes.
- Charts and maps use colour scales that are readable by colour-blind users, and every chart has a table view.
- In mock mode no external call is made. The app must refuse to start in production with mock auth enabled.
- Before coding each connector, check the source's current documentation for endpoint and field names. Do not guess.

## Data model

Create these tables, with sensible indexes and foreign keys.

- geo_units: level (nation, zone, state, LGA, ward), name, official code, parent, boundary, simplified boundary, centre point, area, boundary version.
- geo_aliases: alternative spellings of place names, used to match uploaded files.
- sources (publisher, link, licence, whether redistribution is allowed) and datasets (source, title, version, release date, years covered, levels covered, file, status draft or published, uploader).
- indicators: code, name, category, definition, unit, value type (count, rate, percent, ratio, index), whether higher is better, decimals, how it aggregates.
- indicator_values: indicator, place, period, value, lower and upper bound, breakdown (sex, age group, urban or rural, if any), dataset, estimate flag, note.
- health_facilities: name, type, level of care, ownership, point, LGA, ward, source version.
- population_cells: about 1 km grid points with estimated population and, where available, under-5 and women aged 15 to 49.
- outbreak_reports: disease, state, week, suspected cases, confirmed cases, deaths, dataset.
- stories, insight_cards, saved_views, custom_reports.
- users, organisations, memberships, plans, subscriptions, api_keys, api_usage, download_log, import_runs, audit_log.

## Indicator catalogue

Seed the catalogue with definitions, units and categories for about 60 indicators. Seed definitions only, not real values.

- Population: total population, density, under-5 population, women aged 15 to 49, people aged 60 and over, sex ratio, growth rate, urban share, household size, total fertility rate.
- Health outcomes: under-5, infant and neonatal mortality; maternal mortality ratio; life expectancy; stunting, wasting and underweight in children; anaemia in children and women; malaria prevalence in children; HIV prevalence.
- Health services: full childhood immunisation, children with no vaccine doses, four or more antenatal visits, skilled birth attendance, facility delivery, modern contraceptive use, unmet need for family planning, mosquito net use, health insurance cover, facilities per 100,000 people, people per facility.
- Living conditions: improved water, improved sanitation, female literacy, multidimensional poverty, electricity access, school attendance.
- Outbreaks: weekly cholera, Lassa fever, meningitis and measles cases by state.

## Data pipeline

1. Geography. Load GRID3 state, LGA and ward boundaries and health facilities into PostGIS, recording the version per state. Build simplified shapes for the web.
2. Population. A documented script reads the GRID3 gridded population file, sums it to a grid of about 1 km, and loads population_cells. The same script sums population to ward, LGA and state as indicator values.
3. Connectors. Jobs for the DHS Program indicator API (state and national values for every Nigerian survey), the WHO Global Health Observatory API and the World Bank API (national series). Each run lands as a draft dataset with a comparison against the published version.
4. Upload wizard. A data editor uploads a CSV or Excel file, maps its columns to place, period, indicator and value, and reviews place-name matches. Names are matched by code, then exact name, then alias, then fuzzy match; anything uncertain goes to a review list and confirmed matches become aliases. The file is validated for range, duplicates and unknown places before it becomes a draft.
5. Publish. A data editor reviews a draft, sees what will change, and publishes. A public data updates page lists every published change.

## Public features

- Home: headline national figures, featured insight cards, latest stories, and one search box for places and indicators.
- Map explorer: pick an indicator, year and level to colour the map; legend with a choice of class breaks; hover for values; click through to a profile; toggle a health facility layer; switch to a table; step through years.
- Place profile for every state, LGA and ward: key facts, age and sex chart where data exists, indicator tiles with the national figure and rank beside them, trends, facilities map and list, outbreak history, and the sources used.
- Compare: up to four places side by side, one chart per indicator.
- Rankings: all states or LGAs ordered by an indicator, as a sortable table and bar chart.
- Trends: an indicator over time for one or more places, with survey years marked.
- Relationships: a scatter plot of two indicators across states with a trend line and correlation, and a plain note that correlation is not cause.
- Facilities: map and filters by type, level and ownership; people per facility by LGA; nearest facilities to any point.
- Area analysis: drop a pin with a radius of 1 to 50 km, or draw a shape, and get estimated population inside, facilities inside by type, people per facility, and the LGAs touched. Free accounts get three a day.
- Outbreaks: weekly cases by disease and state as a map and chart.
- Indicator pages: definition, method, source, caveats, levels and years available.
- Insight cards: share-ready images, square and wide, generated from live data, such as the top five states for an indicator or one state against the national figure. Each card carries the source and year.
- Stories: short data articles with live charts embedded.
- Embeds: any chart or map can be embedded on another website.
- Server-render a page for every place and indicator with a sitemap.

## Paid features

- Downloads: CSV and Excel for any table or dataset whose licence allows it, with a ready-made citation.
- Custom report builder: choose places and indicators, get a PDF with charts, tables, maps and sources.
- API, version 1: places, indicators, values, facilities and outbreak data, with key authentication, per-plan rate limits and a documentation page generated from an OpenAPI file.
- Billing: Paystack subscriptions with hosted checkout and a webhook. Plan limits are enforced on the server.

## Staff tools

- Data editor: sources and licences, connector runs, upload wizard, draft review and publish, rollback, alias list, quality flags on values.
- Content editor: story editor with chart embeds; insight card generator with editable caption, preview and publish.
- Platform admin: users, organisations, plans, API usage, download log, audit log.

## Build phases

1. Scaffold, Docker, geography load, aliases, sources, indicator catalogue, synthetic demo dataset.
2. Connectors, upload wizard, validation, draft and publish workflow, data updates page.
3. Map explorer, indicator pages, place profiles, search.
4. Compare, rankings, trends, relationships, facilities, outbreaks.
5. Population grid script, population_cells, area analysis.
6. Insight cards, stories, embeds, downloads with licence checks.
7. Accounts, plans and billing, custom reports, public API and docs, platform admin, performance pass, end-to-end tests, README.

## Definition of done

- docker compose up followed by the seed script gives a working portal in mock mode with all states and LGAs, a clearly labelled synthetic dataset covering the catalogue, sample facilities and population cells, two stories and six insight cards.
- If the build environment cannot download GRID3 files, generate placeholder geography, say so in the README, and include the exact steps to load the real files.
- Unit tests cover place-name matching, upload validation, ranks, class breaks, population inside a shape, licence gating of downloads, and API rate limits.
- A test proves that a draft dataset is invisible to the public until published and that rollback restores the earlier values.
- An end-to-end test covers: explore an indicator on the map, open an LGA profile, compare two states, run an area analysis, upload and publish a dataset as a data editor, publish an insight card, subscribe to Pro in mock mode, download a table, build a custom report, and call the API with a key.
- Typecheck, lint and all tests pass. The README is complete, includes the Assumptions section, and lists every data source with its licence and load steps.
