import { describe, expect, it } from "vitest";
import { INDICATOR_CATALOGUE } from "@/server/indicators/catalogue-data";
import { NIGERIA_STATES } from "@/server/geo/nigeria-states";
import { allLgas, lgasForState, normalizePlaceName, NIGERIA_LGAS_RAW } from "./nigeria-lgas";
import { buildHierarchy, MAX_WARDS_PER_LGA, MIN_WARDS_PER_LGA } from "./hierarchy";
import { buildPopulationModel } from "./population-model";
import { generateSurveyRows, LGA_INDICATORS, SURVEY_SPECS } from "./survey-model";
import { generateOutbreakRows, OUTBREAK_WEEKS } from "./outbreak-model";
import { generateFacilities } from "./facility-model";

const h = buildHierarchy();
const pop = buildPopulationModel(h);

describe("LGA reference list", () => {
  it("has 774 LGAs with unique codes and the official per-state counts", () => {
    const all = allLgas();
    expect(all).toHaveLength(774);
    expect(new Set(all.map((l) => l.code)).size).toBe(774);
    expect(Object.keys(NIGERIA_LGAS_RAW).sort()).toEqual(NIGERIA_STATES.map((s) => s.code).sort());
    expect(lgasForState("NG-KN")).toHaveLength(44);
    expect(lgasForState("NG-FC")).toHaveLength(6);
    expect(lgasForState("NG-KN").some((l) => l.code === "NG-KN-GWALE")).toBe(true);
  });

  it("normalizes like geo_aliases.normalized", () => {
    expect(normalizePlaceName("Akwa-Ibom")).toBe("akwa ibom");
    expect(normalizePlaceName("  Jama'are ")).toBe("jama are");
    expect(normalizePlaceName("Ọ̀yọ́")).toBe("oyo");
  });
});

describe("hierarchy", () => {
  it("gives every LGA 8–12 synthetic wards with stable codes", () => {
    for (const s of h)
      for (const l of s.lgas) {
        expect(l.wards.length).toBeGreaterThanOrEqual(MIN_WARDS_PER_LGA);
        expect(l.wards.length).toBeLessThanOrEqual(MAX_WARDS_PER_LGA);
        expect(l.wards[0].code).toBe(`${l.code}-W01`);
        expect(l.wards[0].name).toBe(`${l.name} Ward 1`);
      }
  });
});

describe("survey model", () => {
  const rows = generateSurveyRows(h, pop);
  const meta = new Map(INDICATOR_CATALOGUE.map((e) => [e.code, e]));
  const stateCodes = new Set(NIGERIA_STATES.map((s) => s.code));

  it("is deterministic", () => {
    expect(generateSurveyRows(h, pop)).toEqual(rows);
  });

  it("only uses catalogue codes and keeps values in range with lower ≤ value ≤ upper", () => {
    const bad: string[] = [];
    for (const r of rows) {
      const m = meta.get(r.code);
      const ok =
        !!m &&
        Number.isFinite(r.value) &&
        (m.valueType !== "percent" || (r.value >= 0 && r.value <= 100)) &&
        (r.lower === null || r.lower <= r.value) &&
        (r.upper === null || r.upper >= r.value);
      if (!ok) bad.push(`${r.code}@${r.geoCode}/${r.year}`);
    }
    expect(bad).toEqual([]);
  });

  it("covers state + national for state-scope indicators and LGAs for the LGA set", () => {
    for (const spec of SURVEY_SPECS.filter((s) => s.scope === "state")) {
      for (const y of spec.years) {
        const n = rows.filter((r) => r.code === spec.code && r.year === y && stateCodes.has(r.geoCode)).length;
        expect(n, `${spec.code} ${y}`).toBe(37);
        expect(rows.some((r) => r.code === spec.code && r.year === y && r.geoCode === "NG")).toBe(true);
      }
    }
    for (const code of LGA_INDICATORS) {
      expect(rows.filter((r) => r.code === code && r.year === 2023).length).toBe(774 + 37 + 1);
    }
  });

  it("national value lies within the range of state values", () => {
    const v = rows.filter((r) => r.code === "u5mr" && r.year === 2018);
    const nat = v.find((r) => r.geoCode === "NG")!.value;
    const states = v.filter((r) => r.geoCode !== "NG").map((r) => r.value);
    expect(nat).toBeGreaterThanOrEqual(Math.min(...states));
    expect(nat).toBeLessThanOrEqual(Math.max(...states));
  });
});

describe("outbreak model", () => {
  const rows = generateOutbreakRows();
  it("is sparse, consistent and within weeks 1–40", () => {
    expect(rows.length).toBeGreaterThan(500);
    expect(rows.length).toBeLessThan(4 * 37 * OUTBREAK_WEEKS);
    const keys = new Set<string>();
    const bad: string[] = [];
    for (const r of rows) {
      const k = `${r.disease}|${r.stateCode}|${r.week}`;
      const ok =
        r.suspected > 0 && // zero-case weeks are omitted
        r.confirmed <= r.suspected &&
        r.deaths <= r.suspected &&
        r.week >= 1 &&
        r.week <= OUTBREAK_WEEKS &&
        !keys.has(k);
      if (!ok) bad.push(k);
      keys.add(k);
    }
    expect(bad).toEqual([]);
    for (const d of ["cholera", "lassa_fever", "meningitis", "measles"]) {
      expect(rows.some((r) => r.disease === d)).toBe(true);
    }
  });
});

describe("facility model", () => {
  const f = generateFacilities(h, pop);
  it("creates ~3,000 facilities with a realistic mix and unique keys", () => {
    expect(f.length).toBeGreaterThan(2500);
    expect(f.length).toBeLessThan(4000);
    expect(new Set(f.map((x) => x.key)).size).toBe(f.length);
    expect(f.filter((x) => x.careLevel === "tertiary").length).toBeGreaterThanOrEqual(37);
    expect(f.some((x) => x.ownership === "private")).toBe(true);
    expect(f.some((x) => x.ownership === "faith_based")).toBe(true);
    // Every LGA has at least one facility, so people_per_facility exists for all LGAs.
    expect(new Set(f.map((x) => x.lgaCode)).size).toBe(774);
  });
});

describe("catalogue coverage", () => {
  it("every catalogue indicator gets synthetic values from some generator", () => {
    const covered = new Set<string>([
      // population dataset
      "pop_total", "pop_male", "pop_female", "pop_u5", "pop_w1549", "pop_60p", "sex_ratio", "pop_density",
      // facilities dataset
      "facilities_per_100k", "people_per_facility",
      // outbreaks dataset (annual totals)
      "cholera_cases", "lassa_cases", "meningitis_cases", "measles_cases",
      ...SURVEY_SPECS.map((s) => s.code),
    ]);
    const missing = INDICATOR_CATALOGUE.map((e) => e.code).filter((c) => !covered.has(c));
    expect(missing).toEqual([]);
    expect(INDICATOR_CATALOGUE.length).toBeGreaterThan(55);
  });
});
