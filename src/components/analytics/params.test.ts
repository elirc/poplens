import { describe, expect, it } from "vitest";
import {
  MAX_COMPARE_PLACES,
  MAX_TREND_PLACES,
  compareHref,
  outbreaksHref,
  parseCodeList,
  parseCompare,
  parseOutbreaks,
  parseRankings,
  parseRelationships,
  parseTrends,
  parseWeek,
  parseYear,
  rankingsHref,
  relationshipsHref,
  trendsHref,
} from "./params";

describe("parseCodeList", () => {
  it("splits, trims, de-duplicates and drops invalid codes", () => {
    expect(parseCodeList(" NG-KN, NG-LA ,NG-KN,bad code,<x>", 10)).toEqual(["NG-KN", "NG-LA"]);
  });
  it("caps at max", () => {
    expect(parseCodeList("a,b,c,d,e,f", 4)).toEqual(["a", "b", "c", "d"]);
  });
  it("is empty for null/empty", () => {
    expect(parseCodeList(null, 4)).toEqual([]);
    expect(parseCodeList("", 4)).toEqual([]);
  });
});

describe("parseYear / parseWeek", () => {
  it("accepts plausible values only", () => {
    expect(parseYear("2018")).toBe(2018);
    expect(parseYear("18")).toBeNull();
    expect(parseYear("3000")).toBeNull();
    expect(parseWeek("1")).toBe(1);
    expect(parseWeek("53")).toBe(53);
    expect(parseWeek("0")).toBeNull();
    expect(parseWeek("54")).toBeNull();
    expect(parseWeek("x")).toBeNull();
  });
});

describe("compare", () => {
  it("enforces the four-place maximum in parsing", () => {
    const s = parseCompare({ places: "NG-KN,NG-LA,NG-KD,NG-OY,NG-RI", indicators: "u5mr" });
    expect(s.places).toHaveLength(MAX_COMPARE_PLACES);
    expect(s.places).toEqual(["NG-KN", "NG-LA", "NG-KD", "NG-OY"]);
  });
  it("distinguishes absent params (null → defaults) from empty ones", () => {
    expect(parseCompare({})).toEqual({ places: null, indicators: null });
    expect(parseCompare({ places: "" }).places).toEqual([]);
  });
  it("accepts repeated params and URLSearchParams", () => {
    expect(parseCompare({ places: ["NG-KN", "NG-LA"] }).places).toEqual(["NG-KN", "NG-LA"]);
    expect(parseCompare(new URLSearchParams("places=NG,NG-KN&indicators=anc4")).indicators).toEqual([
      "anc4",
    ]);
  });
  it("builds readable, capped hrefs that round-trip", () => {
    const href = compareHref({ places: ["NG-KN", "NG-LA", "a", "b", "c"], indicators: ["u5mr", "anc4"] });
    expect(href).toBe("/compare?places=NG-KN,NG-LA,a,b&indicators=u5mr,anc4");
    const q = new URLSearchParams(href.split("?")[1]);
    expect(parseCompare(q).places).toEqual(["NG-KN", "NG-LA", "a", "b"]);
  });
});

describe("rankings", () => {
  it("parses with defaults and rejects wards", () => {
    expect(parseRankings({})).toEqual({ indicator: null, level: "state", year: null });
    expect(parseRankings({ indicator: "u5mr", level: "ward", year: "2018" })).toEqual({
      indicator: "u5mr",
      level: "state",
      year: 2018,
    });
    expect(parseRankings({ level: "lga" }).level).toBe("lga");
  });
  it("omits defaults in hrefs", () => {
    expect(rankingsHref({ indicator: "u5mr", level: "state" })).toBe("/rankings?indicator=u5mr");
    expect(rankingsHref({ indicator: "u5mr", level: "lga", year: 2023 })).toBe(
      "/rankings?indicator=u5mr&level=lga&year=2023",
    );
  });
});

describe("trends", () => {
  it("caps places at six", () => {
    const s = parseTrends({ indicator: "u5mr", places: "a,b,c,d,e,f,g,h" });
    expect(s.places).toHaveLength(MAX_TREND_PLACES);
    expect(trendsHref({ indicator: "u5mr", places: ["NG", "NG-KN"] })).toBe(
      "/trends?indicator=u5mr&places=NG,NG-KN",
    );
  });
});

describe("relationships", () => {
  it("parses x, y and year", () => {
    expect(parseRelationships({ x: "female_literacy", y: "u5mr", year: "2018" })).toEqual({
      x: "female_literacy",
      y: "u5mr",
      year: 2018,
    });
    expect(relationshipsHref({ x: "a", y: "b" })).toBe("/relationships?x=a&y=b");
  });
});

describe("outbreaks", () => {
  it("defaults the disease and validates week", () => {
    expect(parseOutbreaks({ disease: "plague", week: "99" })).toEqual({
      disease: "cholera",
      year: null,
      week: null,
    });
    expect(parseOutbreaks({ disease: "lassa_fever", year: "2024", week: "12" })).toEqual({
      disease: "lassa_fever",
      year: 2024,
      week: 12,
    });
    expect(outbreaksHref({ disease: "measles", year: 2024, week: 3 })).toBe(
      "/outbreaks?disease=measles&year=2024&week=3",
    );
  });
});
