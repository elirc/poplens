import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { truncateAll } from "../db-helpers";
import {
  getOutbreakWeekly,
  listOutbreakDiseases,
  listOutbreakYears,
} from "@/server/analytics/outbreaks";
import {
  loadCompare,
  loadOutbreaks,
  loadRankings,
  loadRelationships,
  loadTrends,
} from "@/server/analytics/loaders";

/**
 * B1 analytics queries against the test database (run by the orchestrator:
 * pnpm test:db). Self-contained fixtures; values are arbitrary test numbers.
 * Core rule under test: draft datasets never reach the analytics pages, and
 * missing data is absent (never zero).
 */

let nation: number;
let kano: number;
let lagos: number;
let oyo: number;
let gwale: number;
let u5: number;
let lit: number;
let pub: number;
let pubNewer: number;
let draft: number;
let otherSource: number;

beforeAll(async () => {
  await truncateAll();
  const [ng] = await db
    .insert(schema.geoUnits)
    .values({ level: "nation", name: "Nigeria", code: "NG" })
    .returning({ id: schema.geoUnits.id });
  nation = ng!.id;
  const states = await db
    .insert(schema.geoUnits)
    .values([
      { level: "state", name: "Kano", code: "NG-KN", parentId: nation },
      { level: "state", name: "Lagos", code: "NG-LA", parentId: nation },
      { level: "state", name: "Oyo", code: "NG-OY", parentId: nation },
    ])
    .returning({ id: schema.geoUnits.id });
  [kano, lagos, oyo] = states.map((s) => s.id) as [number, number, number];
  await db.execute(sql`UPDATE geo_units SET state_id = id WHERE level = 'state'`);
  const [g] = await db
    .insert(schema.geoUnits)
    .values({ level: "lga", name: "Gwale", code: "NG-KN-GWALE", parentId: kano, stateId: kano })
    .returning({ id: schema.geoUnits.id });
  gwale = g!.id;

  const [s1, s2] = await db
    .insert(schema.sources)
    .values([
      { key: "dhs", publisher: "DHS Program", title: "DHS", licence: "DHS terms", allowsRedistribution: false },
      { key: "nbs", publisher: "NBS", title: "NBS", licence: "Open", allowsRedistribution: true },
    ])
    .returning({ id: schema.sources.id });
  const ds = await db
    .insert(schema.datasets)
    .values([
      { sourceId: s1!.id, seriesKey: "a", title: "Published", status: "published", publishedAt: new Date("2025-01-01") },
      { sourceId: s1!.id, seriesKey: "b", title: "Published newer", status: "published", publishedAt: new Date("2025-06-01") },
      { sourceId: s1!.id, seriesKey: "c", title: "Draft", status: "draft" },
      { sourceId: s2!.id, seriesKey: "d", title: "Other source", status: "published", publishedAt: new Date("2025-02-01"), isSynthetic: true },
    ])
    .returning({ id: schema.datasets.id });
  [pub, pubNewer, draft, otherSource] = ds.map((d) => d.id) as [number, number, number, number];

  const inds = await db
    .insert(schema.indicators)
    .values([
      { code: "u5mr", name: "Under-5 mortality", category: "health_outcomes", definition: "d", unit: "per 1,000", valueType: "rate", higherIsBetter: false, decimals: 0 },
      { code: "female_literacy", name: "Female literacy", category: "living_conditions", definition: "d", unit: "%", valueType: "percent", higherIsBetter: true, decimals: 1 },
    ])
    .returning({ id: schema.indicators.id });
  [u5, lit] = inds.map((i) => i.id) as [number, number];

  await db.insert(schema.indicatorValues).values([
    // u5mr 2013 + 2018 for all three states and the nation
    { indicatorId: u5, geoUnitId: kano, year: 2013, value: 190, datasetId: pub },
    { indicatorId: u5, geoUnitId: lagos, year: 2013, value: 80, datasetId: pub },
    { indicatorId: u5, geoUnitId: kano, year: 2018, value: 180, lower: 160, upper: 200, datasetId: pub },
    { indicatorId: u5, geoUnitId: lagos, year: 2018, value: 70, datasetId: pub },
    { indicatorId: u5, geoUnitId: oyo, year: 2018, value: 100, datasetId: pub },
    { indicatorId: u5, geoUnitId: nation, year: 2018, value: 130, datasetId: pub },
    // a newer published dataset overrides Lagos 2018
    { indicatorId: u5, geoUnitId: lagos, year: 2018, value: 65, datasetId: pubNewer },
    // draft values must be invisible everywhere
    { indicatorId: u5, geoUnitId: oyo, year: 2023, value: 1, datasetId: draft },
    { indicatorId: u5, geoUnitId: kano, year: 2018, value: 999, datasetId: draft },
    // a different source in 2023 for Kano → trend must keep it apart
    { indicatorId: u5, geoUnitId: kano, year: 2023, value: 150, datasetId: otherSource, isEstimate: true },
    // LGA value only in 2023
    { indicatorId: u5, geoUnitId: gwale, year: 2023, value: 140, datasetId: otherSource },
    // female literacy 2018: Oyo missing
    { indicatorId: lit, geoUnitId: kano, year: 2018, value: 20, datasetId: pub },
    { indicatorId: lit, geoUnitId: lagos, year: 2018, value: 90, datasetId: pub },
    { indicatorId: lit, geoUnitId: oyo, year: 2018, value: 55, datasetId: draft },
  ]);

  await db.insert(schema.outbreakReports).values([
    { disease: "cholera", stateId: kano, year: 2024, week: 1, suspected: 10, confirmed: 2, deaths: 1, datasetId: pub },
    { disease: "cholera", stateId: kano, year: 2024, week: 1, suspected: 12, confirmed: 3, deaths: 1, datasetId: pubNewer },
    { disease: "cholera", stateId: lagos, year: 2024, week: 2, suspected: 5, confirmed: null, deaths: 0, datasetId: pub },
    { disease: "cholera", stateId: oyo, year: 2024, week: 3, suspected: 500, confirmed: 400, deaths: 9, datasetId: draft },
    { disease: "measles", stateId: kano, year: 2025, week: 1, suspected: 50, confirmed: 5, deaths: 0, datasetId: draft },
  ]);
});

afterAll(async () => {
  await truncateAll();
});

describe("outbreak queries", () => {
  it("lists only diseases/years with published reports", async () => {
    expect(await listOutbreakDiseases()).toEqual(["cholera"]);
    expect(await listOutbreakYears("cholera")).toEqual([2024]);
    expect(await listOutbreakYears("measles")).toEqual([]);
  });

  it("returns one row per state-week, the latest published dataset winning, drafts hidden", async () => {
    const w = await getOutbreakWeekly("cholera", 2024);
    expect(w.rows).toHaveLength(2);
    const k = w.rows.find((r) => r.stateId === kano)!;
    expect(k).toMatchObject({ week: 1, suspected: 12, confirmed: 3, deaths: 1, code: "NG-KN" });
    const l = w.rows.find((r) => r.stateId === lagos)!;
    expect(l.confirmed).toBeNull();
    expect(w.rows.some((r) => r.stateId === oyo)).toBe(false);
  });

  it("loadOutbreaks reports the last week and empty data for draft-only diseases", async () => {
    const c = await loadOutbreaks("cholera", null);
    expect(c.year).toBe(2024);
    expect(c.lastWeek).toBe(2);
    expect(c.diseasesWithData).toEqual(["cholera"]);
    const m = await loadOutbreaks("measles", 2025);
    expect(m.year).toBeNull();
    expect(m.rows).toEqual([]);
    expect(m.lastWeek).toBeNull();
  });
});

describe("loadRankings", () => {
  it("ranks lower-is-better with the newest published value and no draft leakage", async () => {
    const r = (await loadRankings("u5mr", "state", 2018))!;
    expect(r.year).toBe(2018);
    expect(r.rows.map((x) => [x.code, x.rank, x.cell.value])).toEqual([
      ["NG-LA", 1, 65],
      ["NG-OY", 2, 100],
      ["NG-KN", 3, 180],
    ]);
    expect(r.rows[2]!.cell.lower).toBe(160);
    expect(r.noData).toEqual([]);
  });

  it("falls back to the latest year and lists places without data separately", async () => {
    const r = (await loadRankings("u5mr", "state", 1999))!;
    expect(r.yearFallback).toBe(true);
    expect(r.year).toBe(2023);
    expect(r.rows.map((x) => x.code)).toEqual(["NG-KN"]);
    expect(r.noData.map((p) => p.code)).toEqual(["NG-LA", "NG-OY"]);
  });

  it("supports LGAs with their parent state", async () => {
    const r = (await loadRankings("u5mr", "lga", null))!;
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ code: "NG-KN-GWALE", parent: "Kano" });
  });

  it("is null for an unknown indicator", async () => {
    expect(await loadRankings("nope", "state", null)).toBeNull();
  });
});

describe("loadCompare", () => {
  it("uses the latest common year with the national reference", async () => {
    const c = await loadCompare(["NG-KN", "NG-LA", "NG-XX"], ["u5mr", "missing"]);
    expect(c.unknownPlaces).toEqual(["NG-XX"]);
    expect(c.unknownIndicators).toEqual(["missing"]);
    const chart = c.charts[0]!;
    expect(chart.mode).toBe("common");
    expect(chart.year).toBe(2018);
    expect(chart.bars.map((b) => b.cell?.value)).toEqual([180, 65]);
    expect(chart.national?.value).toBe(130);
  });

  it("labels latest-each when places share no year", async () => {
    const c = await loadCompare(["NG-LA", "NG-KN-GWALE"], ["u5mr"]);
    const chart = c.charts[0]!;
    expect(chart.mode).toBe("latest-each");
    expect(chart.bars.map((b) => b.cell?.year)).toEqual([2018, 2023]);
    expect(c.places[1]!.context).toBe("LGA, Kano");
  });

  it("shows No data (null cell) rather than zero", async () => {
    const c = await loadCompare(["NG-OY"], ["female_literacy"]);
    expect(c.charts[0]!.mode).toBe("none");
    expect(c.charts[0]!.bars[0]!.cell).toBeNull();
  });
});

describe("loadTrends", () => {
  it("keeps sources apart and flags synthetic data", async () => {
    const t = (await loadTrends("u5mr", ["NG-KN"]))!;
    const pts = t.series[0]!.points;
    expect(pts.map((p) => [p.year, p.value])).toEqual([
      [2013, 190],
      [2018, 180],
      [2023, 150],
    ]);
    expect(new Set(pts.map((p) => p.sourceId)).size).toBe(2);
    expect(pts[2]!.source).toMatch(/SYNTHETIC/);
  });
});

describe("loadRelationships", () => {
  it("pairs only states with both published values and computes stats", async () => {
    const r = (await loadRelationships("female_literacy", "u5mr", null))!;
    expect(r.commonYears).toEqual([2018]);
    expect(r.year).toBe(2018);
    expect(r.points.map((p) => p.code)).toEqual(["NG-KN", "NG-LA"]);
    expect(r.missing).toEqual([{ code: "NG-OY", name: "Oyo", lacks: "x" }]);
    // Only 2 points → no r, no line, explained.
    expect(r.stats.r).toBeNull();
    expect(r.stats.skipped).toBe("too_few_points");
    expect(r.stats.skipText).toMatch(/Only 2 places/);
  });
});
