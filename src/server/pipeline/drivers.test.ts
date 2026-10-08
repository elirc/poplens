import { describe, expect, it } from "vitest";
import { DHS_INDICATOR_MAP, dhsRowToStaged } from "@/adapters/connectors/dhs/real";
import { ghoRowToStaged, WHO_INDICATOR_MAP } from "@/adapters/connectors/who/real";
import { WORLD_BANK_INDICATOR_MAP, wbRowToStaged } from "@/adapters/connectors/worldbank/real";
import { INDICATOR_CATALOGUE } from "@/server/indicators/catalogue-data";

/**
 * Real-driver row converters, exercised with response shapes copied from
 * live API responses (2026-10-08). No network. The numbers are only used
 * to check parsing — they are not displayed anywhere.
 */

const catalogueCodes = new Set(INDICATOR_CATALOGUE.map((c) => c.code));

describe("mapping tables", () => {
  it("map only to catalogue codes", () => {
    for (const m of DHS_INDICATOR_MAP) expect(catalogueCodes.has(m.code), m.code).toBe(true);
    for (const m of WHO_INDICATOR_MAP) expect(catalogueCodes.has(m.code), m.code).toBe(true);
    for (const m of WORLD_BANK_INDICATOR_MAP) expect(catalogueCodes.has(m.code), m.code).toBe(true);
  });
  it("have no duplicate source ids", () => {
    expect(new Set(DHS_INDICATOR_MAP.map((m) => m.dhsId)).size).toBe(DHS_INDICATOR_MAP.length);
  });
});

describe("dhsRowToStaged", () => {
  const map = new Map(DHS_INDICATOR_MAP.map((m) => [m.dhsId, m]));
  const base = {
    IndicatorId: "CM_ECMR_C_U5M",
    SurveyId: "NG2018DHS",
    SurveyYear: 2018,
    SurveyType: "DHS",
    Value: 75,
    CILow: 55,
    CIHigh: 94,
    CharacteristicCategory: "Region",
    CharacteristicLabel: "..FCT Abuja",
    IsTotal: 0,
    IsPreferred: 1,
    LevelRank: 2 as number | "",
    ByVariableLabel: "Ten years preceding the survey",
  };

  it("turns '..State' region rows into state name refs", () => {
    expect(dhsRowToStaged(base, map)).toMatchObject({
      indicatorCode: "u5mr",
      geo: { kind: "name", value: "FCT Abuja", level: "state" },
      year: 2018,
      value: 75,
      lower: 55,
      upper: 94,
      periodLabel: "DHS 2018",
      isEstimate: true,
    });
  });
  it("turns rank-1 region rows into zones and skips historic regions", () => {
    expect(dhsRowToStaged({ ...base, CharacteristicLabel: "North Central", LevelRank: 1 }, map)?.geo).toEqual({
      kind: "name",
      value: "North Central",
      level: "zone",
    });
    expect(dhsRowToStaged({ ...base, CharacteristicLabel: "Northeast - 1990", LevelRank: 1 }, map)).toBeNull();
  });
  it("maps Total to the nation and residence to urban/rural", () => {
    expect(
      dhsRowToStaged({ ...base, CharacteristicCategory: "Total", CharacteristicLabel: "Total", IsTotal: 1, LevelRank: "" }, map)
        ?.geo,
    ).toEqual({ kind: "code", value: "NG", level: "nation" });
    const urban = dhsRowToStaged({ ...base, CharacteristicCategory: "Residence", CharacteristicLabel: "Urban" }, map);
    expect(urban).toMatchObject({ residence: "urban", geo: { value: "NG" } });
  });
  it("skips non-preferred rows, unmapped indicators and empty values", () => {
    expect(dhsRowToStaged({ ...base, IsPreferred: 0 }, map)).toBeNull();
    expect(dhsRowToStaged({ ...base, IndicatorId: "XX_UNKNOWN" }, map)).toBeNull();
    expect(dhsRowToStaged({ ...base, Value: "" }, map)).toBeNull();
    expect(dhsRowToStaged({ ...base, CharacteristicCategory: "Wealth quintile" }, map)).toBeNull();
  });
});

describe("ghoRowToStaged", () => {
  const base = {
    IndicatorCode: "WHOSIS_000001",
    SpatialDim: "NGA",
    TimeDimType: "YEAR",
    TimeDim: 2018,
    Dim1Type: "SEX",
    Dim1: "SEX_MLE",
    Dim2: null,
    Dim3: null,
    NumericValue: 61.3,
    Low: 59.1,
    High: 63.5,
  };
  it("maps sex dimension and bounds", () => {
    expect(ghoRowToStaged(base, "life_expectancy")).toMatchObject({
      sex: "male",
      year: 2018,
      value: 61.3,
      lower: 59.1,
      upper: 63.5,
      geo: { value: "NG", level: "nation" },
    });
    expect(ghoRowToStaged({ ...base, Dim1: null, Dim1Type: null }, "mmr")?.sex).toBe("all");
  });
  it("skips non-total extra dimensions and null values", () => {
    expect(ghoRowToStaged({ ...base, Dim2: "AGEGROUP_YEARS15-19" }, "x")).toBeNull();
    expect(ghoRowToStaged({ ...base, Dim3: "WEALTHQUINTILE_TOTL" }, "x")).not.toBeNull();
    expect(ghoRowToStaged({ ...base, NumericValue: null }, "x")).toBeNull();
    expect(ghoRowToStaged({ ...base, SpatialDim: "GHA" }, "x")).toBeNull();
  });
});

describe("wbRowToStaged", () => {
  const base = {
    indicator: { id: "SP.POP.GROW", value: "Population growth (annual %)" },
    countryiso3code: "NGA",
    date: "2023",
    value: 2.1 as number | null,
  };
  it("parses year and value", () => {
    expect(wbRowToStaged(base, "pop_growth_rate")).toMatchObject({ year: 2023, value: 2.1, indicatorCode: "pop_growth_rate" });
  });
  it("skips null values (no data, never 0)", () => {
    expect(wbRowToStaged({ ...base, value: null }, "pop_growth_rate")).toBeNull();
  });
});
