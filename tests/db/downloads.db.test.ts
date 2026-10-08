import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { DEFAULT_PLAN_LIMITS } from "@/lib/limits";
import { performDownload } from "@/server/downloads/service";
import { truncateAll } from "../db-helpers";

/**
 * Spec: "Downloads and API access are offered only for datasets whose
 * licence allows redistribution", "Log every download", plan limits enforced
 * on the server. Exercises the real service (licence → account → plan/quota →
 * download_log) against the test database. Fixture values are arbitrary
 * test numbers, not statistics.
 */

let openDatasetId: number;
let restrictedDatasetId: number;
let draftDatasetId: number;
const PRO = { id: "user-pro" };
const FREE = { id: "user-free" };

beforeEach(async () => {
  await truncateAll();

  await db.insert(schema.plans).values([
    { code: "free", name: "Free", limits: DEFAULT_PLAN_LIMITS.free },
    { code: "pro", name: "Pro", priceKoboMonthly: 500_000, limits: DEFAULT_PLAN_LIMITS.pro },
  ]);
  await db.insert(schema.user).values([
    { id: PRO.id, name: "Pro User", email: "pro@test.local" },
    { id: FREE.id, name: "Free User", email: "free@test.local" },
  ]);
  await db.insert(schema.subscriptions).values({ userId: PRO.id, planCode: "pro", status: "active" });

  const [ng, a, b] = await db
    .insert(schema.geoUnits)
    .values([
      { level: "nation", name: "Nigeria", code: "NG" },
      { level: "state", name: "State A", code: "TST-A" },
      { level: "state", name: "State B", code: "TST-B" },
    ])
    .returning({ id: schema.geoUnits.id });

  const [openInd, restrictedInd] = await db
    .insert(schema.indicators)
    .values([
      {
        code: "test_open",
        name: "Open indicator",
        category: "health_services",
        definition: "test",
        unit: "%",
        valueType: "percent",
        decimals: 1,
        aggregation: "none",
      },
      {
        code: "test_restricted",
        name: "Restricted indicator",
        category: "health_outcomes",
        definition: "test",
        unit: "per 1,000",
        valueType: "rate",
        decimals: 0,
        aggregation: "none",
      },
    ])
    .returning({ id: schema.indicators.id });

  const [openSrc, restrictedSrc] = await db
    .insert(schema.sources)
    .values([
      {
        key: "test-open",
        publisher: "Open Publisher",
        title: "Open source",
        url: "https://open.example",
        licence: "CC BY 4.0",
        allowsRedistribution: true,
        citationTemplate: "Open Publisher. {title}, {year}. {url}. Accessed {accessed} via PopLens.",
      },
      {
        key: "test-restricted",
        publisher: "Restricted Publisher",
        title: "Restricted source",
        licence: "Restricted terms (no redistribution)",
        allowsRedistribution: false,
      },
    ])
    .returning({ id: schema.sources.id });

  const [openDs, restrictedDs, draftDs] = await db
    .insert(schema.datasets)
    .values([
      { sourceId: openSrc!.id, seriesKey: "t-open", title: "Open dataset", yearsCovered: "2020", status: "published", publishedAt: new Date() },
      { sourceId: restrictedSrc!.id, seriesKey: "t-restricted", title: "Restricted dataset", yearsCovered: "2020", status: "published", publishedAt: new Date() },
      { sourceId: openSrc!.id, seriesKey: "t-draft", title: "Draft dataset", yearsCovered: "2021", status: "draft" },
    ])
    .returning({ id: schema.datasets.id });
  openDatasetId = openDs!.id;
  restrictedDatasetId = restrictedDs!.id;
  draftDatasetId = draftDs!.id;

  await db.insert(schema.indicatorValues).values([
    { indicatorId: openInd!.id, geoUnitId: a!.id, year: 2020, value: 41.5, datasetId: openDatasetId },
    { indicatorId: openInd!.id, geoUnitId: b!.id, year: 2020, value: 12.25, datasetId: openDatasetId },
    { indicatorId: openInd!.id, geoUnitId: ng!.id, year: 2020, value: 30, datasetId: openDatasetId },
    { indicatorId: restrictedInd!.id, geoUnitId: a!.id, year: 2020, value: 101, datasetId: restrictedDatasetId },
    { indicatorId: restrictedInd!.id, geoUnitId: b!.id, year: 2020, value: 88, datasetId: restrictedDatasetId },
    { indicatorId: openInd!.id, geoUnitId: a!.id, year: 2021, value: 99, datasetId: draftDatasetId },
  ]);
});

afterAll(async () => {
  await truncateAll();
});

async function logCount(): Promise<number> {
  return (await db.select().from(schema.downloadLog)).length;
}

async function usageCount(userId: string): Promise<number> {
  const rows = await db.select().from(schema.usageCounters).where(eq(schema.usageCounters.userId, userId));
  return rows.reduce((n, r) => n + r.count, 0);
}

describe("licence gating", () => {
  it("refuses a dataset whose source does not allow redistribution — even for Pro", async () => {
    const r = await performDownload({ user: PRO, spec: { kind: "dataset", datasetId: restrictedDatasetId }, format: "csv" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(403);
    expect(r.code).toBe("licence");
    expect(r.message).toContain("Restricted terms (no redistribution)");
    expect(await logCount()).toBe(0);
    expect(await usageCount(PRO.id)).toBe(0);
  });

  it("refuses a rankings table built from a restricted source", async () => {
    const r = await performDownload({
      user: PRO,
      spec: { kind: "level", indicator: "test_restricted", level: "state", year: 2020 },
      format: "xlsx",
    });
    expect(r).toMatchObject({ ok: false, status: 403, code: "licence" });
    expect(await logCount()).toBe(0);
  });

  it("refuses a place table that mixes open and restricted sources", async () => {
    const r = await performDownload({ user: PRO, spec: { kind: "place", place: "TST-A" }, format: "csv" });
    expect(r).toMatchObject({ ok: false, status: 403, code: "licence" });
    if (!r.ok) expect(r.message).toContain("Restricted Publisher");
  });
});

describe("plan gating and logging", () => {
  it("Pro user downloads an open dataset as CSV with citation; the download is logged", async () => {
    const r = await performDownload({ user: PRO, spec: { kind: "dataset", datasetId: openDatasetId }, format: "csv" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const text = r.body as string;
    expect(text).toContain("Citation: Open Publisher. Open dataset, 2020. https://open.example.");
    expect(text).toContain("Licence: Open Publisher: CC BY 4.0");
    expect(text).toContain("TST-A,State A,test_open");
    expect(text).not.toMatch(/,2021,/); // the draft dataset's value never leaks
    expect(r.rows).toBe(3);
    const logs = await db.select().from(schema.downloadLog);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ userId: PRO.id, datasetId: openDatasetId, format: "csv" });
  });

  it("Pro user downloads a rankings table as Excel", async () => {
    const r = await performDownload({
      user: PRO,
      spec: { kind: "level", indicator: "test_open", level: "state", year: 2020 },
      format: "xlsx",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const bytes = r.body as Uint8Array;
    expect(String.fromCharCode(bytes[0]!, bytes[1]!)).toBe("PK"); // zip container
    expect(await logCount()).toBe(1);
  });

  it("free plan gets the upsell and nothing is logged", async () => {
    const r = await performDownload({ user: FREE, spec: { kind: "dataset", datasetId: openDatasetId }, format: "csv" });
    expect(r).toMatchObject({ ok: false, status: 402, code: "plan" });
    expect(await logCount()).toBe(0);
  });

  it("anonymous visitors must sign in", async () => {
    const r = await performDownload({ user: null, spec: { kind: "dataset", datasetId: openDatasetId }, format: "csv" });
    expect(r).toMatchObject({ ok: false, status: 401, code: "auth" });
    const t = await performDownload({ user: null, spec: { kind: "place", place: "TST-B" }, format: "csv" });
    expect(t).toMatchObject({ ok: false, status: 401 });
    expect(await logCount()).toBe(0);
  });

  it("draft datasets cannot be downloaded", async () => {
    const r = await performDownload({ user: PRO, spec: { kind: "dataset", datasetId: draftDatasetId }, format: "csv" });
    expect(r).toMatchObject({ ok: false, status: 404 });
  });

  it("a capped plan consumes its daily quota and then refuses", async () => {
    await db.insert(schema.plans).values({
      code: "capped",
      name: "Capped",
      limits: { ...DEFAULT_PLAN_LIMITS.pro, downloadsPerDay: 1 },
    });
    await db.update(schema.subscriptions).set({ planCode: "capped" }).where(eq(schema.subscriptions.userId, PRO.id));
    const spec = { kind: "places" as const, indicator: "test_open", places: ["TST-A", "TST-B"], year: 2020 };
    const first = await performDownload({ user: PRO, spec, format: "csv" });
    expect(first.ok).toBe(true);
    const second = await performDownload({ user: PRO, spec, format: "csv" });
    expect(second).toMatchObject({ ok: false, status: 429, code: "quota" });
    expect(await logCount()).toBe(1);
    expect(await usageCount(PRO.id)).toBe(1);
  });
});
