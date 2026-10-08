import { describe, expect, it } from "vitest";
import {
  parseDisease,
  parseNumber,
  parseSex,
  parseYear,
  rangeError,
  validateIndicatorRows,
  validateOutbreakRows,
  type PreparedIndicatorRow,
  type PreparedOutbreakRow,
} from "./validate";

// Test inputs are arbitrary fixture numbers, not statistics.
const indicators = new Map([
  ["anc4", { id: 1, valueType: "percent" as const }],
  ["pop_total", { id: 2, valueType: "count" as const }],
  ["u5mr", { id: 3, valueType: "rate" as const }],
]);

function row(over: Partial<PreparedIndicatorRow> = {}): PreparedIndicatorRow {
  return {
    row: 1,
    placeName: "Kano",
    geoUnitId: 12,
    excluded: false,
    indicatorCode: "anc4",
    yearRaw: "2021",
    valueRaw: "40.5",
    lowerRaw: "",
    upperRaw: "",
    sexRaw: "",
    ageRaw: "",
    residenceRaw: "",
    note: null,
    periodLabel: null,
    isEstimate: true,
    ...over,
  };
}

describe("parsers", () => {
  it("parseNumber handles separators, percent signs and missing markers", () => {
    expect(parseNumber("1,234,567")).toEqual({ kind: "num", n: 1234567 });
    expect(parseNumber("45.2%")).toEqual({ kind: "num", n: 45.2 });
    expect(parseNumber("")).toEqual({ kind: "empty" });
    expect(parseNumber("N/A")).toEqual({ kind: "empty" });
    expect(parseNumber("..")).toEqual({ kind: "empty" });
    expect(parseNumber("12a")).toEqual({ kind: "bad" });
    expect(parseNumber("1.2.3")).toEqual({ kind: "bad" });
  });
  it("parseSex / parseYear / parseDisease", () => {
    expect(parseSex("Total")).toBe("all");
    expect(parseSex("F")).toBe("female");
    expect(parseSex("x")).toBeNull();
    expect(parseYear("2018")).toBe(2018);
    expect(parseYear("2018-19")).toBe(2018);
    expect(parseYear("1800")).toBeNull();
    expect(parseYear("abc")).toBeNull();
    expect(parseDisease("Lassa Fever")).toBe("lassa_fever");
    expect(parseDisease("CSM")).toBe("meningitis");
    expect(parseDisease("ebola")).toBeNull();
  });
  it("rangeError by value type", () => {
    expect(rangeError(101, "percent")).toMatch(/0 and 100/);
    expect(rangeError(-1, "percent")).toMatch(/0 and 100/);
    expect(rangeError(100, "percent")).toBeNull();
    expect(rangeError(-5, "count")).toMatch(/negative/);
    expect(rangeError(-5, "rate")).toMatch(/negative/);
    expect(rangeError(-0.2, "index")).toBeNull();
  });
});

describe("validateIndicatorRows", () => {
  it("accepts clean rows and resolves them", () => {
    const { report, values } = validateIndicatorRows([row(), row({ row: 2, geoUnitId: 13, valueRaw: "51" })], indicators);
    expect(report.ok).toBe(true);
    expect(report.validRows).toBe(2);
    expect(values[0]).toMatchObject({ indicatorId: 1, geoUnitId: 12, year: 2021, value: 40.5, sex: "all", residence: "all", ageGroup: "all" });
  });

  it("blocks out-of-range percentages", () => {
    const { report, values } = validateIndicatorRows([row({ valueRaw: "140" })], indicators);
    expect(report.ok).toBe(false);
    expect(report.issues[0]).toMatchObject({ severity: "error", code: "out_of_range", rows: [1] });
    expect(values).toHaveLength(0);
  });

  it("blocks negative counts and warns on fractional counts", () => {
    const neg = validateIndicatorRows([row({ indicatorCode: "pop_total", valueRaw: "-3" })], indicators);
    expect(neg.report.ok).toBe(false);
    const frac = validateIndicatorRows([row({ indicatorCode: "pop_total", valueRaw: "3.5" })], indicators);
    expect(frac.report.ok).toBe(true);
    expect(frac.report.issues.some((i) => i.severity === "warning")).toBe(true);
  });

  it("blocks duplicates (place, indicator, year, breakdown) and drops every copy", () => {
    const { report, values } = validateIndicatorRows(
      [row({ row: 1 }), row({ row: 2, valueRaw: "41" }), row({ row: 3, sexRaw: "female" })],
      indicators,
    );
    expect(report.ok).toBe(false);
    const dup = report.issues.find((i) => i.code === "duplicate")!;
    expect(dup.rows.sort()).toEqual([1, 2]);
    // the female breakdown row is distinct and still valid
    expect(values).toHaveLength(1);
    expect(values[0].sex).toBe("female");
  });

  it("blocks unknown places, unknown indicators, bad years and non-numeric values", () => {
    const { report } = validateIndicatorRows(
      [
        row({ row: 1, geoUnitId: null, placeName: "Atlantis" }),
        row({ row: 2, indicatorCode: "nope" }),
        row({ row: 3, yearRaw: "soon" }),
        row({ row: 4, valueRaw: "lots" }),
      ],
      indicators,
    );
    const codes = report.issues.map((i) => i.code).sort();
    expect(codes).toEqual(["bad_year", "non_numeric", "unknown_indicator", "unknown_place"]);
    expect(report.errors).toBe(4);
    expect(report.validRows).toBe(0);
  });

  it("skips missing values with a warning — never stores 0", () => {
    const { report, values } = validateIndicatorRows([row({ valueRaw: "" }), row({ row: 2, geoUnitId: 13 })], indicators);
    expect(report.ok).toBe(true);
    expect(values).toHaveLength(1);
    expect(values.every((v) => v.value !== 0)).toBe(true);
    expect(report.issues[0]).toMatchObject({ severity: "warning", code: "missing_value" });
  });

  it("checks confidence bounds", () => {
    const bad = validateIndicatorRows([row({ lowerRaw: "45", upperRaw: "50" })], indicators);
    expect(bad.report.issues[0].code).toBe("bounds");
    const ok = validateIndicatorRows([row({ lowerRaw: "35", upperRaw: "46" })], indicators);
    expect(ok.values[0]).toMatchObject({ lower: 35, upper: 46 });
  });

  it("rows excluded during place review are not errors", () => {
    const { report, values } = validateIndicatorRows(
      [row({ geoUnitId: null, excluded: true }), row({ row: 2, geoUnitId: 13 })],
      indicators,
    );
    expect(report.ok).toBe(true);
    expect(values).toHaveLength(1);
    expect(report.issues[0].code).toBe("excluded");
  });
});

describe("validateOutbreakRows", () => {
  const ob = (over: Partial<PreparedOutbreakRow> = {}): PreparedOutbreakRow => ({
    row: 1,
    diseaseRaw: "cholera",
    stateName: "Borno",
    stateId: 20,
    excluded: false,
    yearRaw: "2024",
    weekRaw: "5",
    suspectedRaw: "12",
    confirmedRaw: "3",
    deathsRaw: "",
    ...over,
  });

  it("accepts the NCDC template shape", () => {
    const { report, values } = validateOutbreakRows([ob()]);
    expect(report.ok).toBe(true);
    expect(values[0]).toEqual({ disease: "cholera", stateId: 20, year: 2024, week: 5, suspected: 12, confirmed: 3, deaths: null });
  });

  it("rejects bad weeks, diseases, negative counts and duplicates", () => {
    const { report, values } = validateOutbreakRows([
      ob({ row: 1, weekRaw: "54" }),
      ob({ row: 2, diseaseRaw: "flu" }),
      ob({ row: 3, suspectedRaw: "-1" }),
      ob({ row: 4, weekRaw: "7" }),
      ob({ row: 5, weekRaw: "7" }),
      ob({ row: 6, stateId: null, stateName: "Wakanda" }),
    ]);
    expect(report.ok).toBe(false);
    expect(new Set(report.issues.map((i) => i.code))).toEqual(
      new Set(["bad_week", "bad_disease", "non_numeric", "duplicate", "unknown_place"]),
    );
    expect(values).toHaveLength(0);
  });

  it("warns when confirmed exceeds suspected and skips empty lines", () => {
    const { report, values } = validateOutbreakRows([
      ob({ suspectedRaw: "2", confirmedRaw: "5" }),
      ob({ row: 2, weekRaw: "6", suspectedRaw: "", confirmedRaw: "", deathsRaw: "" }),
    ]);
    expect(report.ok).toBe(true);
    expect(values).toHaveLength(1);
    expect(report.issues.map((i) => i.code).sort()).toEqual(["inconsistent", "missing_value"]);
  });
});
