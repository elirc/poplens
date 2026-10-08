import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { DEFAULT_PLAN_LIMITS, lagosDay, type PlanLimits } from "@/lib/limits";
import { _resetRateLimiter } from "@/lib/rate-limit";
import { authenticateApiRequest } from "@/server/api-keys/authenticate";
import { hashApiKey } from "@/server/api-keys/keys";
import {
  consumeApiQuota,
  createApiKey,
  findApiKeyByPlaintext,
  listApiKeysForUser,
  revokeApiKey,
} from "@/server/api-keys/store";
import { GET as placesGET } from "@/app/api/v1/places/route";
import { GET as valuesGET } from "@/app/api/v1/values/route";
import { truncateAll } from "../db-helpers";

/**
 * Spec-required coverage: API keys stored hashed, per-plan rate limits
 * (daily quota in api_usage + 60/min burst), 401/403/429 semantics, and the
 * licence gate on API values. Fixture numbers are arbitrary test values.
 */

const USER = "u-api";
const OTHER = "u-other";

async function addUser(id: string) {
  await db.insert(schema.user).values({ id, name: id, email: `${id}@test.local` });
}

async function addPlan(code: string, limits: PlanLimits) {
  await db.insert(schema.plans).values({ code, name: code, priceKoboMonthly: 100, limits });
}

async function subscribe(userId: string, planCode: string) {
  await db.insert(schema.subscriptions).values({ userId, planCode, status: "active" });
}

function req(path: string, key?: string, header: "bearer" | "x-api-key" = "bearer") {
  const headers = new Headers();
  if (key) {
    if (header === "bearer") headers.set("Authorization", `Bearer ${key}`);
    else headers.set("x-api-key", key);
  }
  return new Request(`http://localhost/api/v1${path}`, { headers });
}

const noParams = { params: Promise.resolve({}) } as { params: Promise<Record<string, never>> };

beforeEach(async () => {
  await truncateAll();
  _resetRateLimiter();
  await addPlan("free", DEFAULT_PLAN_LIMITS.free);
  await addPlan("pro", DEFAULT_PLAN_LIMITS.pro);
  await addPlan("tiny", { ...DEFAULT_PLAN_LIMITS.pro, apiRequestsPerDay: 3 });
  await addUser(USER);
  await addUser(OTHER);
});

afterAll(async () => {
  _resetRateLimiter();
  await truncateAll();
});

describe("key storage", () => {
  it("stores only the SHA-256 hash and finds the key by hashing the plaintext", async () => {
    const { key, plaintext } = await createApiKey(USER, "test");
    const [row] = await db.select().from(schema.apiKeys).where(eq(schema.apiKeys.id, key.id));
    expect(row.keyHash).toBe(hashApiKey(plaintext));
    expect(row.keyHash).not.toContain(plaintext.slice(8));
    expect(row.prefix).toBe(plaintext.slice(0, 12));
    expect((await findApiKeyByPlaintext(plaintext))?.id).toBe(key.id);
    expect(await findApiKeyByPlaintext(plaintext.replace(/.$/, (c) => (c === "0" ? "1" : "0")))).toBeNull();
  });

  it("revokes only the owner's key", async () => {
    const { key } = await createApiKey(USER, "k");
    expect(await revokeApiKey(OTHER, key.id)).toBe(false);
    expect(await revokeApiKey(USER, key.id)).toBe(true);
    expect(await revokeApiKey(USER, key.id)).toBe(false);
    const list = await listApiKeysForUser(USER);
    expect(list[0].revokedAt).not.toBeNull();
  });
});

describe("daily quota (api_usage)", () => {
  it("is atomic under concurrency: exactly `limit` requests succeed", async () => {
    const { key } = await createApiKey(USER, "k");
    const results = await Promise.all(Array.from({ length: 12 }, () => consumeApiQuota(key.id, 5)));
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
    const [usage] = await db.select().from(schema.apiUsage).where(eq(schema.apiUsage.apiKeyId, key.id));
    expect(usage.count).toBe(5);
    expect(usage.day).toBe(lagosDay());
  });

  it("counts per day and per key", async () => {
    const { key } = await createApiKey(USER, "k");
    const { key: key2 } = await createApiKey(USER, "k2");
    expect((await consumeApiQuota(key.id, 1, "2026-01-01")).allowed).toBe(true);
    expect((await consumeApiQuota(key.id, 1, "2026-01-01")).allowed).toBe(false);
    expect((await consumeApiQuota(key.id, 1, "2026-01-02")).allowed).toBe(true);
    expect((await consumeApiQuota(key2.id, 1, "2026-01-01")).allowed).toBe(true);
  });

  it("unlimited (null) always allows but still counts", async () => {
    const { key } = await createApiKey(USER, "k");
    for (let i = 0; i < 3; i++) expect((await consumeApiQuota(key.id, null)).allowed).toBe(true);
    const [usage] = await db.select().from(schema.apiUsage).where(eq(schema.apiUsage.apiKeyId, key.id));
    expect(usage.count).toBe(3);
  });
});

describe("authenticateApiRequest", () => {
  it("401 without a key or with an unknown key", async () => {
    expect(await authenticateApiRequest(req("/places"))).toMatchObject({ ok: false, status: 401 });
    expect(await authenticateApiRequest(req("/places", "pl_live_" + "0".repeat(32)))).toMatchObject({
      ok: false,
      status: 401,
    });
  });

  it("403 for a free-plan key (no API access) and does not count usage", async () => {
    const { plaintext, key } = await createApiKey(USER, "k");
    expect(await authenticateApiRequest(req("/places", plaintext))).toMatchObject({
      ok: false,
      status: 403,
      code: "plan_has_no_api_access",
    });
    expect(await db.select().from(schema.apiUsage).where(eq(schema.apiUsage.apiKeyId, key.id))).toHaveLength(0);
  });

  it("accepts a Pro key via Bearer and x-api-key, with quota headers", async () => {
    await subscribe(USER, "pro");
    const { plaintext } = await createApiKey(USER, "k");
    const a = await authenticateApiRequest(req("/places", plaintext));
    expect(a.ok).toBe(true);
    if (a.ok) {
      expect(a.planCode).toBe("pro");
      expect(a.headers["X-RateLimit-Limit"]).toBe("10000");
      expect(a.headers["X-RateLimit-Remaining"]).toBe("9999");
    }
    expect((await authenticateApiRequest(req("/places", plaintext, "x-api-key"))).ok).toBe(true);
  });

  it("403 once the key is revoked", async () => {
    await subscribe(USER, "pro");
    const { plaintext, key } = await createApiKey(USER, "k");
    await revokeApiKey(USER, key.id);
    expect(await authenticateApiRequest(req("/places", plaintext))).toMatchObject({
      ok: false,
      status: 403,
      code: "api_key_revoked",
    });
  });

  it("429 with Retry-After once the plan's daily quota is used", async () => {
    await subscribe(USER, "tiny");
    const { plaintext } = await createApiKey(USER, "k");
    for (let i = 0; i < 3; i++) expect((await authenticateApiRequest(req("/places", plaintext))).ok).toBe(true);
    const over = await authenticateApiRequest(req("/places", plaintext));
    expect(over).toMatchObject({ ok: false, status: 429, code: "daily_quota_exceeded" });
    if (!over.ok) expect(Number(over.headers["Retry-After"])).toBeGreaterThan(0);
  });

  it("429 burst limit after 60 requests in a minute, without burning daily quota", async () => {
    await subscribe(USER, "pro");
    const { plaintext, key } = await createApiKey(USER, "k");
    for (let i = 0; i < 60; i++) expect((await authenticateApiRequest(req("/places", plaintext))).ok).toBe(true);
    const over = await authenticateApiRequest(req("/places", plaintext));
    expect(over).toMatchObject({ ok: false, status: 429, code: "burst_limit_exceeded" });
    const [usage] = await db.select().from(schema.apiUsage).where(eq(schema.apiUsage.apiKeyId, key.id));
    expect(usage.count).toBe(60);
  });

  it("organisation members get the organisation's plan", async () => {
    await db.insert(schema.organization).values({ id: "org1", name: "Org", slug: "org" });
    await db.insert(schema.member).values({ id: "m1", organizationId: "org1", userId: USER, role: "member" });
    await db.insert(schema.subscriptions).values({ organizationId: "org1", planCode: "pro", status: "active" });
    const { plaintext } = await createApiKey(USER, "k");
    expect(await authenticateApiRequest(req("/places", plaintext))).toMatchObject({ ok: true, planCode: "pro" });
  });
});

describe("v1 routes", () => {
  it("returns the envelope for /places and errors for bad keys", async () => {
    await subscribe(USER, "pro");
    await db.insert(schema.geoUnits).values([
      { level: "nation", name: "Testland", code: "TST" },
      { level: "state", name: "Alpha", code: "TST-A" },
    ]);
    const { plaintext } = await createApiKey(USER, "k");
    const ok = await placesGET(req("/places?level=state", plaintext), noParams);
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.meta).toMatchObject({ count: 1, total: 1, page: 1 });
    expect(body.data[0]).toMatchObject({ code: "TST-A", level: "state" });

    const bad = await placesGET(req("/places"), noParams);
    expect(bad.status).toBe(401);
    expect(await bad.json()).toMatchObject({ error: { code: "invalid_api_key" } });

    const invalid = await placesGET(req("/places?level=planet", plaintext), noParams);
    expect(invalid.status).toBe(400);
  });

  it("licence gate: /values excludes sources that disallow redistribution", async () => {
    await subscribe(USER, "pro");
    const [a, b] = await db
      .insert(schema.geoUnits)
      .values([
        { level: "state", name: "Alpha", code: "TST-A" },
        { level: "state", name: "Beta", code: "TST-B" },
      ])
      .returning({ id: schema.geoUnits.id });
    const [ind] = await db
      .insert(schema.indicators)
      .values({
        code: "test_pct",
        name: "Test",
        category: "health_services",
        definition: "t",
        unit: "%",
        valueType: "percent",
      })
      .returning({ id: schema.indicators.id });
    const [open, closed] = await db
      .insert(schema.sources)
      .values([
        { key: "open", publisher: "Open", title: "Open", licence: "CC BY", allowsRedistribution: true },
        { key: "closed", publisher: "Closed", title: "Closed", licence: "Terms", allowsRedistribution: false },
      ])
      .returning({ id: schema.sources.id });
    const now = new Date();
    const [dOpen, dClosed] = await db
      .insert(schema.datasets)
      .values([
        { sourceId: open.id, seriesKey: "o", title: "Open data", status: "published", publishedAt: now },
        { sourceId: closed.id, seriesKey: "c", title: "Closed data", status: "published", publishedAt: now },
      ])
      .returning({ id: schema.datasets.id });
    await db.insert(schema.indicatorValues).values([
      { indicatorId: ind.id, geoUnitId: a.id, year: 2020, value: 11, datasetId: dOpen.id },
      { indicatorId: ind.id, geoUnitId: b.id, year: 2020, value: 22, datasetId: dClosed.id },
    ]);
    const { plaintext } = await createApiKey(USER, "k");
    const res = await valuesGET(req("/values?indicator=test_pct&level=state&year=2020", plaintext), noParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ place: { code: "TST-A" }, value: 11, source: { key: "open" } });
    expect(body.meta.excludedByLicence).toBe(1);
  });
});
