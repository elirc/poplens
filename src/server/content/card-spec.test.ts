import { describe, expect, it } from "vitest";
import { CARD_SEEDS } from "@/server/seed/content";
import { defaultCardTitle, parseCardSpec } from "./card-spec";

describe("parseCardSpec", () => {
  it("accepts every seeded card spec unchanged", () => {
    for (const c of CARD_SEEDS) {
      const r = parseCardSpec(c.spec);
      expect(r.ok, c.slug).toBe(true);
      if (r.ok) expect(r.value).toEqual(c.spec);
    }
  });

  it("normalises place codes and coerces string years", () => {
    expect(parseCardSpec({ kind: "single_stat", indicatorCode: "pop_total", placeCodes: ["ng-kn"], year: "2023" })).toEqual({
      ok: true,
      value: { kind: "single_stat", indicatorCode: "pop_total", placeCodes: ["NG-KN"], year: 2023 },
    });
  });

  it.each([
    [{ kind: "pie", indicatorCode: "u5mr" }, /kind/],
    [{ kind: "top5", indicatorCode: "u5mr", placeCodes: ["NG-KN"] }, /no place/],
    [{ kind: "vs_national", indicatorCode: "u5mr" }, /Pick the place/],
    [{ kind: "vs_national", indicatorCode: "u5mr", placeCodes: ["NG"] }, /not Nigeria/],
    [{ kind: "single_stat", indicatorCode: "u5mr", level: "lga" }, /only applies to top-5/],
    [{ kind: "single_stat", indicatorCode: "u5mr; drop" }, /Invalid indicator/],
    [{ kind: "trend", indicatorCode: "u5mr", placeCodes: ["NG", "NG-KN"] }, /one place/],
    [null, /Expected object/],
  ])("rejects %o", (input, msg) => {
    const r = parseCardSpec(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(msg);
  });
});

describe("defaultCardTitle", () => {
  it("builds readable titles per kind", () => {
    expect(defaultCardTitle({ kind: "top5", indicatorCode: "u5mr" }, { indicator: "Under-5 mortality rate", year: 2018 })).toBe(
      "Highest under-5 mortality rate (2018)",
    );
    expect(
      defaultCardTitle({ kind: "vs_national", indicatorCode: "anc4" }, { indicator: "HIV prevalence", place: "Kano", year: 2018 }),
    ).toBe("Kano vs Nigeria: HIV prevalence (2018)");
    expect(defaultCardTitle({ kind: "trend", indicatorCode: "x" }, { indicator: "Stunting", place: "Lagos" })).toBe(
      "Stunting in Lagos over time",
    );
  });
});
