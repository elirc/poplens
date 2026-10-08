import { describe, expect, it } from "vitest";
import {
  escapeLike,
  isSearchable,
  matchBoost,
  normalizeForAlias,
  normalizeQuery,
  placeContext,
  rankIndicators,
  rankPlaces,
  type IndicatorCandidate,
  type PlaceCandidate,
} from "./normalize";

const place = (p: Partial<PlaceCandidate> & Pick<PlaceCandidate, "code" | "name" | "level">): PlaceCandidate => ({
  parentName: null,
  parentLevel: null,
  stateName: null,
  sim: 0.5,
  matchedAlias: null,
  ...p,
});

describe("normalizeQuery", () => {
  it("trims, collapses whitespace and strips control chars", () => {
    expect(normalizeQuery("  Kano \t\n  state ")).toBe("Kano state");
    expect(normalizeQuery("Ka\u0000no")).toBe("Ka no");
  });
  it("strips diacritics", () => {
    expect(normalizeQuery("Ọ̀yọ́")).toBe("Oyo");
  });
  it("handles empty / nullish input", () => {
    expect(normalizeQuery(null)).toBe("");
    expect(normalizeQuery(undefined)).toBe("");
    expect(normalizeQuery("   ")).toBe("");
  });
  it("caps length at 80 characters", () => {
    expect(normalizeQuery("a".repeat(200))).toHaveLength(80);
  });
});

describe("normalizeForAlias", () => {
  it("lower-cases and turns punctuation into spaces", () => {
    expect(normalizeForAlias("Akwa-Ibom")).toBe("akwa ibom");
    expect(normalizeForAlias("  Cross_River!! ")).toBe("cross river");
    expect(normalizeForAlias("F.C.T.")).toBe("f c t");
  });
});

describe("escapeLike", () => {
  it("escapes LIKE wildcards and the escape char", () => {
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\");
    expect(escapeLike("plain")).toBe("plain");
  });
});

describe("isSearchable", () => {
  it("requires at least two characters", () => {
    expect(isSearchable("K")).toBe(false);
    expect(isSearchable("Ka")).toBe(true);
  });
});

describe("matchBoost", () => {
  it("orders exact > prefix > word prefix > substring > none", () => {
    expect(matchBoost("Kano", "kano")).toBe(1);
    expect(matchBoost("Kano Municipal", "kano")).toBe(0.5);
    expect(matchBoost("Tarauni Kano", "kan")).toBe(0.25);
    expect(matchBoost("Dalakano", "kano")).toBe(0.1);
    expect(matchBoost("Lagos", "kano")).toBe(0);
  });
});

describe("placeContext", () => {
  it("formats ward context with LGA and state", () => {
    expect(
      placeContext({ level: "ward", parentName: "Gwale", parentLevel: "lga", stateName: "Kano" }),
    ).toBe("Ward · Gwale LGA, Kano");
  });
  it("formats LGA context with its state", () => {
    expect(
      placeContext({ level: "lga", parentName: "Kano", parentLevel: "state", stateName: "Kano" }),
    ).toBe("LGA · Kano");
  });
  it("omits the nation as a parent", () => {
    expect(
      placeContext({ level: "zone", parentName: "Nigeria", parentLevel: "nation", stateName: null }),
    ).toBe("Zone");
    expect(
      placeContext({ level: "nation", parentName: null, parentLevel: null, stateName: null }),
    ).toBeNull();
  });
});

describe("rankPlaces", () => {
  it("puts the exact-named state above prefix-matching wards with higher similarity", () => {
    const hits = rankPlaces(
      [
        place({ code: "NG-KN-KM-W01", name: "Kano Municipal Ward 1", level: "ward", sim: 0.6 }),
        place({ code: "NG-KN", name: "Kano", level: "state", sim: 0.55 }),
        place({ code: "NG-KN-KM", name: "Kano Municipal", level: "lga", sim: 0.6 }),
      ],
      "Kano",
    );
    expect(hits.map((h) => h.code)).toEqual(["NG-KN", "NG-KN-KM", "NG-KN-KM-W01"]);
  });

  it("prefers a state over an equally matching LGA and LGA over ward", () => {
    const hits = rankPlaces(
      [
        place({ code: "W", name: "Ikeja", level: "ward", sim: 1 }),
        place({ code: "L", name: "Ikeja", level: "lga", sim: 1 }),
      ],
      "ikeja",
    );
    expect(hits[0]!.code).toBe("L");
  });

  it("deduplicates by code and respects the limit", () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      place({ code: `C${i % 10}`, name: `Place ${i}`, level: "ward", sim: i / 20 }),
    );
    const hits = rankPlaces(many, "place", 8);
    expect(hits).toHaveLength(8);
    expect(new Set(hits.map((h) => h.code)).size).toBe(8);
  });

  it("surfaces the matched alias only when the official name did not match", () => {
    const [viaAlias] = rankPlaces(
      [place({ code: "NG-FC", name: "Federal Capital Territory", level: "state", matchedAlias: "Abuja" })],
      "abuja",
    );
    expect(viaAlias!.matchedAlias).toBe("Abuja");
    const [viaName] = rankPlaces(
      [place({ code: "NG-KN", name: "Kano", level: "state", matchedAlias: "Kano State" })],
      "kano",
    );
    expect(viaName!.matchedAlias).toBeNull();
  });

  it("returns an empty list for no candidates", () => {
    expect(rankPlaces([], "x")).toEqual([]);
  });
});

describe("rankIndicators", () => {
  const ind = (c: Partial<IndicatorCandidate> & Pick<IndicatorCandidate, "code" | "name">): IndicatorCandidate => ({
    category: "health_outcomes",
    unit: "%",
    sim: 0.2,
    ...c,
  });

  it("puts an exact code match first", () => {
    const hits = rankIndicators(
      [
        ind({ code: "u5mr_extra", name: "Under-5 mortality rate (alt)", sim: 0.5 }),
        ind({ code: "u5mr", name: "Under-5 mortality rate", sim: 0.3 }),
      ],
      "u5mr",
    );
    expect(hits[0]!.code).toBe("u5mr");
  });

  it("boosts name prefix matches and caps at five", () => {
    const hits = rankIndicators(
      [
        ind({ code: "a", name: "Women with anaemia", sim: 0.4 }),
        ind({ code: "b", name: "Anaemia in children", sim: 0.35 }),
        ...Array.from({ length: 6 }, (_, i) => ind({ code: `x${i}`, name: `Other ${i}`, sim: 0.1 })),
      ],
      "anaemia",
    );
    expect(hits[0]!.code).toBe("b");
    expect(hits).toHaveLength(5);
    expect(hits[0]!.kind).toBe("indicator");
  });
});
