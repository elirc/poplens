import { beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { truncateAll } from "../db-helpers";
import { searchAll } from "@/server/search/search";
import { getAgeSexBreakdown, getDatasetsForIndicator } from "@/server/search/profile-extra";
import { getOutbreakHistory, getFacilitySummary } from "@/components/profile/profile-data";
import { getGeoUnitByCode } from "@/server/geo/queries";

/**
 * A4 queries against the test database: search ranking via pg_trgm + aliases,
 * and the published-join rule in the profile-extra / profile-data queries
 * (draft values must stay invisible).
 */

let nationId: number;
let stateId: number;
let lgaId: number;
let popId: number;
let u5Id: number;
let publishedDs: number;
let draftDs: number;

beforeAll(async () => {
  await truncateAll();

  const [nation] = await db
    .insert(schema.geoUnits)
    .values({ level: "nation", name: "Nigeria", code: "NG" })
    .returning({ id: schema.geoUnits.id });
  nationId = nation!.id;
  const [state] = await db
    .insert(schema.geoUnits)
    .values({ level: "state", name: "Federal Capital Territory", code: "NG-FC", parentId: nationId })
    .returning({ id: schema.geoUnits.id });
  stateId = state!.id;
  const [kano] = await db
    .insert(schema.geoUnits)
    .values({ level: "state", name: "Kano", code: "NG-KN", parentId: nationId })
    .returning({ id: schema.geoUnits.id });
  const [lga] = await db
    .insert(schema.geoUnits)
    .values({ level: "lga", name: "Kano Municipal", code: "NG-KN-KMC", parentId: kano!.id, stateId: kano!.id })
    .returning({ id: schema.geoUnits.id });
  lgaId = lga!.id;
  await db.insert(schema.geoUnits).values({
    level: "ward",
    name: "Kano Municipal Ward 1",
    code: "NG-KN-KMC-W01",
    parentId: lgaId,
    stateId: kano!.id,
  });
  await db.insert(schema.geoAliases).values({
    geoUnitId: stateId,
    alias: "Abuja",
    normalized: "abuja",
    origin: "seed",
  });

  const [src] = await db
    .insert(schema.sources)
    .values({ key: "synthetic", publisher: "PopLens demo", title: "Synthetic", licence: "CC0", allowsRedistribution: true })
    .returning({ id: schema.sources.id });
  const [pub] = await db
    .insert(schema.datasets)
    .values({ sourceId: src!.id, seriesKey: "demo", title: "Demo published", status: "published", publishedAt: new Date(), isSynthetic: true })
    .returning({ id: schema.datasets.id });
  publishedDs = pub!.id;
  const [draft] = await db
    .insert(schema.datasets)
    .values({ sourceId: src!.id, seriesKey: "demo-draft", title: "Demo draft", status: "draft" })
    .returning({ id: schema.datasets.id });
  draftDs = draft!.id;

  const [pop] = await db
    .insert(schema.indicators)
    .values({ code: "pop_total", name: "Total population", category: "population", definition: "d", unit: "people", valueType: "count", decimals: 0 })
    .returning({ id: schema.indicators.id });
  popId = pop!.id;
  const [u5] = await db
    .insert(schema.indicators)
    .values({ code: "u5mr", name: "Under-5 mortality rate", category: "health_outcomes", definition: "d", unit: "per 1,000 live births", valueType: "rate", higherIsBetter: false })
    .returning({ id: schema.indicators.id });
  u5Id = u5!.id;

  await db.insert(schema.indicatorValues).values([
    { indicatorId: popId, geoUnitId: stateId, year: 2023, value: 100, sex: "male", ageGroup: "0-4", datasetId: publishedDs, isEstimate: true },
    { indicatorId: popId, geoUnitId: stateId, year: 2023, value: 95, sex: "female", ageGroup: "0-4", datasetId: publishedDs, isEstimate: true },
    // Draft-only breakdown for a later year must not leak into the pyramid.
    { indicatorId: popId, geoUnitId: stateId, year: 2024, value: 999, sex: "male", ageGroup: "0-4", datasetId: draftDs },
    { indicatorId: u5Id, geoUnitId: stateId, year: 2018, value: 80, datasetId: publishedDs },
    { indicatorId: u5Id, geoUnitId: nationId, year: 2018, value: 120, datasetId: draftDs },
  ]);

  await db.insert(schema.outbreakReports).values([
    { disease: "cholera", stateId, year: 2024, week: 3, confirmed: 4, datasetId: publishedDs },
    { disease: "cholera", stateId, year: 2024, week: 5, confirmed: null, suspected: 2, datasetId: publishedDs },
    { disease: "measles", stateId, year: 2025, week: 1, confirmed: 50, datasetId: draftDs },
  ]);
});

describe("searchAll", () => {
  it("returns nothing for queries under two characters", async () => {
    const r = await searchAll("K");
    expect(r.places).toEqual([]);
    expect(r.indicators).toEqual([]);
  });

  it("ranks the state above its same-named LGA and wards", async () => {
    const r = await searchAll("kano");
    expect(r.places[0]!.code).toBe("NG-KN");
    expect(r.places.map((p) => p.code)).toContain("NG-KN-KMC");
    const ward = r.places.find((p) => p.code === "NG-KN-KMC-W01");
    expect(ward?.context).toBe("Ward · Kano Municipal LGA, Kano");
  });

  it("finds a place through an alias", async () => {
    const r = await searchAll("Abuja");
    expect(r.places[0]!.code).toBe("NG-FC");
    expect(r.places[0]!.matchedAlias).toBe("Abuja");
  });

  it("finds indicators by code and by name", async () => {
    expect((await searchAll("u5mr")).indicators[0]!.code).toBe("u5mr");
    expect((await searchAll("mortality")).indicators.map((i) => i.code)).toContain("u5mr");
  });

  it("treats LIKE wildcards literally", async () => {
    const r = await searchAll("%%");
    expect(r.places).toEqual([]);
  });
});

describe("getAgeSexBreakdown", () => {
  it("uses only published rows (draft year 2024 is invisible)", async () => {
    const b = await getAgeSexBreakdown(stateId);
    expect(b?.year).toBe(2023);
    expect(b?.rows).toHaveLength(2);
    expect(b?.isEstimate).toBe(true);
  });
  it("returns null when nothing is published", async () => {
    expect(await getAgeSexBreakdown(lgaId)).toBeNull();
  });
});

describe("getDatasetsForIndicator", () => {
  it("lists only published datasets", async () => {
    const rows = await getDatasetsForIndicator(u5Id);
    expect(rows.map((r) => r.datasetId)).toEqual([publishedDs]);
    expect(rows[0]!.levels).toEqual(["state"]);
  });
});

describe("profile-data", () => {
  it("outbreak history uses the latest PUBLISHED year and keeps null weeks null", async () => {
    const h = await getOutbreakHistory(stateId, "FCT");
    expect(h?.year).toBe(2024);
    expect(h?.diseases.map((d) => d.disease)).toEqual(["cholera"]);
    expect(h?.diseases[0]!.weeks).toEqual([
      { week: 3, confirmed: 4 },
      { week: 5, confirmed: null },
    ]);
  });

  it("facility summary is empty, not an error, when no facilities exist", async () => {
    const unit = await getGeoUnitByCode("NG-FC");
    const f = await getFacilitySummary(unit!);
    expect(f.total).toBe(0);
    expect(f.top).toEqual([]);
  });
});
