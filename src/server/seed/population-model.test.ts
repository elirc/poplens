import { describe, expect, it } from "vitest";
import { buildHierarchy } from "./hierarchy";
import { AGE_GROUPS, buildPopulationModel } from "./population-model";

const h = buildHierarchy();
const pop = buildPopulationModel(h);
const get = (code: string) => {
  const c = pop.counts.get(code);
  if (!c) throw new Error(`missing ${code}`);
  return c;
};

describe("synthetic population model", () => {
  it("is deterministic", () => {
    const again = buildPopulationModel(buildHierarchy());
    expect(again.nationalTotal).toBe(pop.nationalTotal);
    expect(again.counts.get("NG-KN-GWALE")).toEqual(pop.counts.get("NG-KN-GWALE"));
  });

  it("national total is ~220m", () => {
    expect(pop.nationalTotal).toBeGreaterThan(215e6);
    expect(pop.nationalTotal).toBeLessThan(225e6);
    expect(get("NG").total).toBe(pop.nationalTotal);
  });

  it("ward sums = LGA, LGA sums = state, state sums = national (all breakdowns)", () => {
    const keys = ["total", "male", "female", "u5", "w1549", "p60"] as const;
    const nat = Object.fromEntries(keys.map((k) => [k, 0])) as Record<(typeof keys)[number], number>;
    for (const s of h) {
      const st = get(s.code);
      const lgaSum = Object.fromEntries(keys.map((k) => [k, 0])) as typeof nat;
      for (const l of s.lgas) {
        const lga = get(l.code);
        for (const k of keys) {
          const wardSum = l.wards.reduce((a, w) => a + get(w.code)[k], 0);
          expect(wardSum).toBe(lga[k]);
          lgaSum[k] += lga[k];
        }
      }
      for (const k of keys) {
        expect(lgaSum[k]).toBe(st[k]);
        nat[k] += st[k];
      }
    }
    for (const k of keys) expect(nat[k]).toBe(get("NG")[k]);
  });

  it("zones sum to national", () => {
    const zones = ["NG-Z-NC", "NG-Z-NE", "NG-Z-NW", "NG-Z-SE", "NG-Z-SS", "NG-Z-SW"];
    expect(zones.reduce((a, z) => a + get(z).total, 0)).toBe(get("NG").total);
  });

  it("every unit is internally consistent", () => {
    const bad: string[] = [];
    for (const [code, c] of pop.counts) {
      const ok =
        c.male + c.female === c.total &&
        c.total > 0 &&
        c.u5 < c.total * 0.3 &&
        c.male / c.total > 0.48 &&
        c.male / c.total < 0.52;
      if (!ok) bad.push(code);
    }
    expect(bad).toEqual([]);
  });

  it("age pyramids match pop_total, pop_u5, pop_60p and pop_male", () => {
    for (const code of ["NG", ...h.map((s) => s.code)]) {
      const rows = pop.ageSex.get(code)!;
      const c = get(code);
      expect(rows.map((r) => r.ageGroup)).toEqual([...AGE_GROUPS]);
      expect(rows.reduce((a, r) => a + r.total, 0)).toBe(c.total);
      expect(rows.reduce((a, r) => a + r.male, 0)).toBe(c.male);
      expect(rows[0].total).toBe(c.u5);
      expect(rows.slice(12).reduce((a, r) => a + r.total, 0)).toBe(c.p60);
      for (const r of rows) {
        expect(r.male).toBeGreaterThanOrEqual(0);
        expect(r.female).toBeGreaterThanOrEqual(0);
        expect(r.male + r.female).toBe(r.total);
      }
      // A pyramid: younger groups are larger than the oldest.
      expect(rows[1].total).toBeGreaterThan(rows[16].total);
    }
  });
});
