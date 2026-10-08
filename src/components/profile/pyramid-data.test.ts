import { describe, expect, it } from "vitest";
import { ageGroupStart, buildPyramid, sortAgeGroups } from "./pyramid-data";

describe("ageGroupStart / sortAgeGroups", () => {
  it("orders age groups numerically, open-ended last", () => {
    expect(sortAgeGroups(["80+", "10-14", "0-4", "5-9", "75-79"])).toEqual([
      "0-4",
      "5-9",
      "10-14",
      "75-79",
      "80+",
    ]);
  });
  it("parses '<1' as 0 and unknown labels as Infinity", () => {
    expect(ageGroupStart("<1")).toBe(0);
    expect(ageGroupStart("unknown")).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("buildPyramid", () => {
  it("returns null when there are no rows (No data, never zeros)", () => {
    expect(buildPyramid([])).toBeNull();
  });

  it("builds a sex pyramid and keeps missing cells as null", () => {
    const p = buildPyramid([
      { ageGroup: "5-9", sex: "male", value: 10 },
      { ageGroup: "0-4", sex: "male", value: 12 },
      { ageGroup: "0-4", sex: "female", value: 11 },
    ])!;
    expect(p.mode).toBe("sex");
    expect(p.rows).toEqual([
      { ageGroup: "0-4", male: 12, female: 11, total: 23 },
      { ageGroup: "5-9", male: 10, female: null, total: null },
    ]);
  });

  it("falls back to a both-sexes distribution when only 'all' rows exist", () => {
    const p = buildPyramid([
      { ageGroup: "0-4", sex: "all", value: 100 },
      { ageGroup: "80+", sex: "all", value: 5 },
    ])!;
    expect(p.mode).toBe("total");
    expect(p.rows.map((r) => r.total)).toEqual([100, 5]);
  });
});
