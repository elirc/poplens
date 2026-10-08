import { describe, expect, it } from "vitest";
import { NO_DATA_COLOR, rampFor } from "@/lib/class-breaks";
import {
  colorFor,
  computeScheme,
  fillColorExpression,
  legendItems,
  pickColors,
} from "@/components/map/choropleth";
import { facilitiesUrl } from "@/components/map/facility-url";

const pct = { unit: "%", valueType: "percent" as const, decimals: 1 };

describe("choropleth helpers", () => {
  it("picks ramp colours for any bucket count", () => {
    expect(pickColors(0)).toEqual([]);
    expect(pickColors(1)).toHaveLength(1);
    expect(pickColors(2)).toHaveLength(2);
    expect(pickColors(5)).toEqual(rampFor(5));
  });

  it("returns an empty scheme (all No data) when there are no values", () => {
    const s = computeScheme([], 5, "quantile");
    expect(s.breaks).toEqual([]);
    expect(colorFor(10, s)).toBe(NO_DATA_COLOR);
    expect(fillColorExpression([], s)).toBe(NO_DATA_COLOR);
    expect(legendItems(s, pct)).toEqual([{ color: NO_DATA_COLOR, label: "No data" }]);
  });

  it("colours missing values with NO_DATA_COLOR, never as the lowest class", () => {
    const s = computeScheme([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5, "quantile");
    expect(colorFor(null, s)).toBe(NO_DATA_COLOR);
    expect(colorFor(undefined, s)).toBe(NO_DATA_COLOR);
    expect(colorFor(1, s)).toBe(s.colors[0]);
    expect(colorFor(10, s)).toBe(s.colors[s.colors.length - 1]);
  });

  it("builds a grouped match expression keyed on the id property", () => {
    const values = [
      { id: 1, value: 1 },
      { id: 2, value: 2 },
      { id: 3, value: 9 },
      { id: 4, value: 10 },
    ];
    const s = computeScheme(values.map((v) => v.value), 2, "equal");
    const expr = fillColorExpression(values, s) as unknown[];
    expect(expr[0]).toBe("match");
    expect(expr[1]).toEqual(["to-number", ["get", "id"], -1]);
    expect(expr[2]).toEqual([1, 2]);
    expect(expr[3]).toBe(s.colors[0]);
    expect(expr[4]).toEqual([3, 4]);
    expect(expr[5]).toBe(s.colors[1]);
    expect(expr[expr.length - 1]).toBe(NO_DATA_COLOR);
  });

  it("formats legend ranges and always ends with No data", () => {
    const s = computeScheme([10, 20, 30, 40], 2, "equal");
    const items = legendItems(s, pct);
    expect(items.map((i) => i.label)).toEqual(["10.0% – 25.0%", "25.0% – 40.0%", "No data"]);
  });
});

describe("facilitiesUrl", () => {
  it("builds stable, sorted filter URLs", () => {
    expect(facilitiesUrl()).toBe("/api/geo/facilities");
    expect(
      facilitiesUrl({ state: "NG-KN", careLevels: ["tertiary", "primary"], ownerships: ["public"] }),
    ).toBe("/api/geo/facilities?state=NG-KN&care=primary%2Ctertiary&own=public");
  });
});
