# Agent B3 — Insight cards, stories, embeds, downloads

Read `agents/COMMON.md` and `docs/SPEC.md` (Public features → Insight cards,
Stories, Embeds; Paid features → Downloads; Staff tools → Content editor)
first. Wave-1 code exists; dev DB is seeded (2 stories, 6 cards published).

## Owned files (exclusive)

- `src/app/(public)/stories/**` (index + `[slug]`)
- `src/app/(public)/cards/**` (gallery + `[slug]` share page)
- `src/app/api/og/**` (next/og image routes for cards: square 1080×1080 and
  wide 1200×630 variants)
- `src/app/embed/**` (embeddable chart/map pages — the layout headers for
  frame-ancestors are already configured in next.config.ts)
- `src/server/content/**` (story rendering incl. shortcode parser — unit
  tests; card data assembly from live values)
- `src/server/downloads/**` (CSV/Excel builders, licence gating, citation;
  unit tests for licence gating — REQUIRED by spec's definition of done)
- `src/app/api/download/**` (download route handlers)
- `src/app/(staff)/editor/content/**` (content-editor UI: story editor with
  chart-embed insertion + preview; insight-card generator with kind/
  indicator/places pickers, editable caption, live preview, publish)
- `src/components/content/**`, `src/components/embed/**`
- db tests (write only): `tests/db/downloads.db.test.ts` (licence gating:
  dataset from a source with allowsRedistribution=false must refuse).

## Contracts (read-only)

- Card spec shape documented in `src/db/schema/content.ts` (kinds: top5,
  vs_national, single_stat, trend). Values via
  `src/server/indicators/queries.ts` ONLY; ranks via ranks.ts.
- Story shortcodes: `{{chart type="trend|bar|top5" indicator="<code>"
  places="NG,NG-KN" year="2018"}}` — parse server-side, render with the same
  Recharts components in ChartFrame; unknown shortcode → visible error box,
  not a crash.
- Content gating: `requireRole("content_editor")` for the editor UI; publish
  sets status/publishedAt and `writeAudit('content.publish_story'|'…card')`.
- Downloads gating order: (1) licence — the dataset('s source)
  allowsRedistribution, else 403 with a clear message naming the licence;
  (2) plan — `getUserPlan` + downloadsPerDay via `consumeDailyQuota(userId,
  'download', …)`; free plan downloadsPerDay=0 → upsell message; (3) log via
  `download_log` insert (REQUIRED: log every download).
- CSV: hand-rolled or papaparse unparse; Excel via exceljs. Include a
  metadata sheet/header rows: citation (source citationTemplate + accessed
  date via formatLagosDate + APP_URL link), licence, synthetic warning when
  isSynthetic.

## Features

### Cards
- `/cards` gallery of published cards (image via OG route, caption, share
  links: WhatsApp, X, copy-link — plain anchor links, no SDKs).
- `/cards/[slug]`: share page with both formats, download-image buttons,
  caption, SourceLine, link into the relevant explorer/profile. OG meta tags
  point at the wide image.
- OG routes render from LIVE data via the card spec (next/og / ImageResponse,
  edge-safe imports only — if `@/db` can't load in the OG runtime, fetch via
  an internal JSON route you own instead; keep Node runtime
  `export const runtime = "nodejs"` which is fine for next/og in Next 16).
  Design: bold value, place, indicator name, year, source line, PopLens
  wordmark, demo-data ribbon when synthetic. Colour-blind-safe.

### Stories
- `/stories` index (published only), `/stories/[slug]` rendering markdown
  (no raw HTML pass-through — sanitize by rendering a restricted markdown
  subset yourself or escaping) + live shortcode charts; author, date,
  SourceLine per chart.

### Embeds
- `/embed/chart?...` (trend/bar/top5 via same params as shortcodes) and
  `/embed/map?i=&y=&l=` (compact choropleth reusing `src/components/map/`).
  Minimal chrome: value, chart, source line + "PopLens" backlink. An
  "Embed" button component (`src/components/content/embed-button.tsx`)
  producing the iframe snippet — drop it on story charts and card pages.
  Keep each embed page < ~200 KB JS where possible.

### Downloads
- Reusable `<DownloadButtons tableId …/>` for CSV/XLSX on: rankings-style
  tables you can address generically via a typed `downloadSpec` param
  (indicator+level+year), dataset exports (`/api/download/dataset/[id]`),
  and place profile indicator tables. Buttons appear for signed-in users;
  the server re-checks everything.

## Done when

Typecheck + lint clean; shortcode parser + licence-gating unit tests green;
db download test written; staff content UI complete; OG images render from
live data (verify by reading code paths; orchestrator smoke-tests).
