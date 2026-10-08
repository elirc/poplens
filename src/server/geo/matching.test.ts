import { describe, expect, it } from "vitest";
import {
  FUZZY_THRESHOLD,
  memoryFuzzy,
  normalizePlaceName,
  PlaceMatcher,
  trigramSimilarity,
  type IndexAlias,
  type IndexUnit,
} from "./matching";
import { normalizeForAlias } from "@/server/search/normalize";

// Fixture geography: reference names/codes only (no statistics).
const units: IndexUnit[] = [
  { id: 1, code: "NG", name: "Nigeria", level: "nation", stateId: null },
  { id: 2, code: "NG-Z-NC", name: "North Central", level: "zone", stateId: null },
  { id: 10, code: "NG-FC", name: "Federal Capital Territory", level: "state", stateId: 10 },
  { id: 11, code: "NG-NA", name: "Nasarawa", level: "state", stateId: 11 },
  { id: 12, code: "NG-KN", name: "Kano", level: "state", stateId: 12 },
  { id: 13, code: "NG-LA", name: "Lagos", level: "state", stateId: 13 },
  { id: 14, code: "NG-OY", name: "Oyo", level: "state", stateId: 14 },
  { id: 15, code: "NG-AK", name: "Akwa Ibom", level: "state", stateId: 15 },
  { id: 100, code: "NG-KN-GWALE", name: "Gwale", level: "lga", stateId: 12 },
  { id: 101, code: "NG-KN-NASARAWA", name: "Nasarawa", level: "lga", stateId: 12 },
  { id: 102, code: "NG-LA-SURULERE", name: "Surulere", level: "lga", stateId: 13 },
  { id: 103, code: "NG-OY-SURULERE", name: "Surulere", level: "lga", stateId: 14 },
  { id: 104, code: "NG-LA-ETI-OSA", name: "Eti-Osa", level: "lga", stateId: 13 },
  { id: 105, code: "NG-FC-AMAC", name: "Abuja Municipal Area Council", level: "lga", stateId: 10 },
  { id: 106, code: "NG-KN-DALA", name: "Dala", level: "lga", stateId: 12 },
];
const aliases: IndexAlias[] = [{ geoUnitId: 104, alias: "Eti Osa East" }];

const matcher = () => new PlaceMatcher(units, aliases, memoryFuzzy(units, aliases));

describe("normalizePlaceName", () => {
  it("lowercases, trims, collapses whitespace and strips punctuation", () => {
    expect(normalizePlaceName("  Akwa-Ibom ")).toBe("akwa ibom");
    expect(normalizePlaceName("Eti   Osa")).toBe("eti osa");
    expect(normalizePlaceName("..FCT, Abuja")).toBe("fct abuja");
  });
  it("drops administrative suffixes", () => {
    expect(normalizePlaceName("Kano State")).toBe("kano");
    expect(normalizePlaceName("Gwale LGA")).toBe("gwale");
    expect(normalizePlaceName("Gwale Local Government Area")).toBe("gwale");
    expect(normalizePlaceName("Abuja Municipal Area Council")).toBe("abuja municipal");
    expect(normalizePlaceName("Kano State LGA")).toBe("kano");
  });
  it("agrees with the shared alias form (normalizeForAlias) when no suffix applies", () => {
    for (const s of ["Jama'are", "Akwa-Ibom", "F.C.T.", "Ọ̀yọ́", "Eti  Osa"]) {
      expect(normalizePlaceName(s)).toBe(normalizeForAlias(s));
    }
    expect(normalizePlaceName("Jama'are")).toBe("jama are");
  });
  it("strips accents and keeps a lone suffix word", () => {
    expect(normalizePlaceName("Ọ̀yọ́")).toBe("oyo");
    expect(normalizePlaceName("State")).toBe("state");
  });
});

describe("trigramSimilarity (pg_trgm-compatible)", () => {
  it("is 1 for identical strings and 0 for disjoint ones", () => {
    expect(trigramSimilarity("kano", "kano")).toBe(1);
    expect(trigramSimilarity("kano", "xyz")).toBe(0);
  });
  it("scores typos above the review threshold", () => {
    expect(trigramSimilarity("gwalle", "gwale")).toBeGreaterThan(FUZZY_THRESHOLD);
  });
});

describe("PlaceMatcher order: code → exact → alias → fuzzy", () => {
  it("matches by official code first (case-insensitive)", async () => {
    const r = await matcher().match({ code: "ng-kn", name: "something else", level: "state" });
    expect(r).toMatchObject({ status: "matched", geoUnitId: 12, method: "code" });
  });

  it("accepts a code typed into the name column", async () => {
    const r = await matcher().match({ name: "NG-KN-GWALE", level: "lga" });
    expect(r).toMatchObject({ status: "matched", geoUnitId: 100, method: "code" });
  });

  it("ignores a code that belongs to another level", async () => {
    const r = await matcher().match({ code: "NG-KN", name: "Gwale", level: "lga" });
    expect(r).toMatchObject({ status: "matched", geoUnitId: 100, method: "exact" });
  });

  it("matches exact normalised names", async () => {
    const r = await matcher().match({ name: "KANO STATE", level: "state" });
    expect(r).toMatchObject({ status: "matched", geoUnitId: 12, method: "exact" });
  });

  it("scopes to the expected level (Nasarawa state vs Nasarawa LGA in Kano)", async () => {
    expect(await matcher().match({ name: "Nasarawa", level: "state" })).toMatchObject({ geoUnitId: 11 });
    expect(await matcher().match({ name: "Nasarawa", level: "lga" })).toMatchObject({ geoUnitId: 101 });
  });

  it("sends names shared across states to review unless the state is known", async () => {
    const amb = await matcher().match({ name: "Surulere", level: "lga" });
    expect(amb.status).toBe("review");
    expect(amb.candidates.map((c) => c.geoUnitId).sort()).toEqual([102, 103]);
    const scoped = await matcher().match({ name: "Surulere", level: "lga", stateId: 14 });
    expect(scoped).toMatchObject({ status: "matched", geoUnitId: 103 });
  });

  it("resolves DHS-style state names through built-in aliases", async () => {
    expect(await matcher().match({ name: "FCT Abuja", level: "state" })).toMatchObject({
      status: "matched",
      geoUnitId: 10,
      method: "alias",
    });
    expect(await matcher().match({ name: "Nassarawa", level: "state" })).toMatchObject({ geoUnitId: 11 });
    expect(await matcher().match({ name: "Akwa-Ibom", level: "state" })).toMatchObject({ geoUnitId: 15 });
    expect(await matcher().match({ name: "North-Central", level: "zone" })).toMatchObject({ geoUnitId: 2 });
  });

  it("uses stored aliases", async () => {
    const r = await matcher().match({ name: "Eti-Osa East", level: "lga" });
    expect(r).toMatchObject({ status: "matched", geoUnitId: 104, method: "alias" });
  });

  it("puts fuzzy matches in review (never auto-matched), best candidate first", async () => {
    const r = await matcher().match({ name: "Gwalle", level: "lga", stateId: 12 });
    expect(r.status).toBe("review");
    expect(r.method).toBe("fuzzy");
    expect(r.geoUnitId).toBeUndefined();
    expect(r.candidates[0].geoUnitId).toBe(100);
    expect(r.candidates[0].score).toBeGreaterThanOrEqual(FUZZY_THRESHOLD);
  });

  it("scopes fuzzy candidates to the parent state", async () => {
    const r = await matcher().match({ name: "Surulere", level: "lga", stateId: 12 });
    expect(r.candidates.every((c) => [100, 101, 106].includes(c.geoUnitId))).toBe(true);
  });

  it("returns unknown for names with nothing close", async () => {
    const r = await matcher().match({ name: "Timbuktu", level: "lga" });
    expect(r.status).toBe("unknown");
    expect(r.geoUnitId).toBeUndefined();
  });

  it("returns unknown for blank input", async () => {
    expect((await matcher().match({ name: "  ", level: "state" })).status).toBe("unknown");
  });

  it("without a fuzzy provider, non-exact names are unknown", async () => {
    const m = new PlaceMatcher(units, aliases, null);
    expect((await m.match({ name: "Gwalle", level: "lga" })).status).toBe("unknown");
  });
});
