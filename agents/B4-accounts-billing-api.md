# Agent B4 — Accounts, billing, custom reports, public API, admin

Read `agents/COMMON.md` and `docs/SPEC.md` (Roles, Paid features, Staff
tools → Platform admin, Engineering rules on keys/limits/webhooks) first.
Wave-1 code exists; dev DB is seeded (plans, demo users).

## Owned files (exclusive)

- `src/app/(auth)/**` (sign-in, sign-up: email+password AND phone OTP flows,
  using `authClient` from `src/lib/auth-client.ts`; react-hook-form + Zod)
- `src/app/(account)/account/**` (profile, saved views list/delete, API keys
  management, billing status, custom reports list)
- `src/app/(public)/pricing/page.tsx`
- `src/app/billing/**` (checkout start action, mock-checkout page, callback)
- `src/app/api/webhooks/paystack/route.ts`
- `src/server/billing/**` (subscription logic; unit tests for webhook
  signature verify via mock adapter)
- `src/server/api-keys/**` (create/hash/verify, per-plan daily quota via
  api_usage + burst via rate-limit lib; unit + db tests — API rate limits
  are REQUIRED spec test coverage)
- `src/server/reports/**` (custom report build: data assembly + React-PDF
  document with d3-geo SVG mini-maps; triggered via pg-boss)
- `src/worker/jobs/reports.ts` (fill registry; keep export name)
- `src/app/api/v1/**` (public API: places, indicators, values, facilities,
  outbreaks; key auth; per-plan limits; consistent JSON envelope)
- `openapi/poplens-v1.yaml` + `src/app/docs/api/page.tsx` (docs page
  rendered FROM the OpenAPI file — parse the yaml server-side and render
  endpoints/params/schemas; a static import of the yaml as text is fine)
- `src/app/(staff)/admin/**` (platform admin: users list + role change,
  organisations, plans editor, API usage, download log, audit log viewer —
  all `requireRole("admin")`)
- `src/components/account/**`, `src/components/admin/**`
- db tests (write only): `tests/db/api-keys.db.test.ts`,
  `tests/db/billing.db.test.ts`
- `src/server/saved-views/**` (save/list/delete actions used by account
  page; expose a small `SaveViewButton` client component in
  `src/components/account/` that other pages already link to by URL —
  posting current URL params + kind)

## Contracts (read-only)

- Auth: `src/lib/auth.ts` (server), `src/lib/auth-client.ts` (client),
  `requireUser`/`requireRole`/`getCurrentUser`. Phone OTP in mock mode:
  the SMS mock writes the code to `.storage/mock-outbox/sms-<digits>.json`.
- Plans/limits: `src/lib/limits.ts` (getUserPlan, consumeDailyQuota,
  DEFAULT_PLAN_LIMITS); plans/subscriptions tables are seeded.
- Payments adapter: `getPayments()` — mock driver's checkoutUrl points to
  `/billing/mock-checkout` (a page YOU build: shows amount, a "Pay" button
  that calls your server action completing the flow exactly as the real
  callback would: verifyTransaction + upsert subscription + audit), and its
  webhook accepts signature header 'mock-signature'.
- Webhook route MUST verify signatures via adapter.verifyWebhookSignature
  on the RAW body before parsing (spec). Handle charge.success,
  subscription.create, subscription.disable; idempotent by reference.
- API keys: format `pl_live_<32 hex>`; store SHA-256 hash; show plaintext
  once. Verify by hashing the presented key. Key auth header:
  `Authorization: Bearer <key>` (also accept `x-api-key`).
- Per-plan daily quota: resolve key → owner (user or org) → getUserPlan →
  limits.apiRequestsPerDay; count in api_usage (atomic upsert increment,
  pattern as in limits.consumeDailyQuota); plus burst limit 60/min via
  `rateLimit()` keyed by key id. 401 bad key, 403 revoked/no API access
  (free plan), 429 over quota with Retry-After.
- Reports: params {placeCodes, indicatorCodes, year?}; Pro/org only
  (limits.customReports). Data via indicator queries; maps: d3-geo SVG from
  getBoundaryGeoJSON (geoMercator fit to viewport); charts in PDF as simple
  SVG bars/lines you draw (React-PDF Svg components). Store via
  getStorage() under reports/<id>.pdf; download route checks ownership.

## Public API v1 (all JSON, versioned base /api/v1)

- `GET /api/v1/places?level=&parent=&q=` — list (id, code, name, level,
  parent); `GET /api/v1/places/{code}`.
- `GET /api/v1/indicators` / `GET /api/v1/indicators/{code}`.
- `GET /api/v1/values?indicator=&level=&year=&place=` — published values
  with source + CI + estimate flags (via shared queries; never raw).
- `GET /api/v1/facilities?lga=&state=&care_level=&ownership=&page=`.
- `GET /api/v1/outbreaks?disease=&state=&year=`.
- Envelope: `{ data, meta: { count, page?, source? } }`; errors
  `{ error: { code, message } }`. LICENCE GATE: values/facilities responses
  exclude datasets whose source disallows redistribution (filter in SQL) —
  note this in the docs page. Every endpoint: key auth + quotas above.
  OpenAPI file must match the implementation (hand-maintained is fine).

## Admin

Users table (search, change role with audit), orgs + members, plans editor
(limits jsonb form with Zod), API usage per key/day table, download log,
audit log (filter by action/actor, newest first). Server-side pagination
everywhere.

## Done when

Typecheck + lint clean; unit tests green (billing webhook verify, api-key
hash/verify, report data assembly pure parts); db tests written; sign-in,
OTP, checkout (mock), API, reports, admin complete; OpenAPI matches routes.
