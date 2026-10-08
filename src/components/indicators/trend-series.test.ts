import { describe, expect, it } from "vitest";
import { buildTrendChartData, cleanPoints, splitBySource, type TrendPoint } from "./trend-series";

const pt = (year: number, value: number, sourceId = 1, sourceName = `S${sourceId}`): TrendPoint => ({
  year,
  value,
  lower: null,
  upper: null,
  isEstimate: false,
  sourceId,
  sourceName,
});

describe("cleanPoints", () => {
  it("orders by year and drops duplicate year+source points", () => {
    const out = cleanPoints([pt(2018, 2), pt(2013, 1), pt(2018, 3)]);
    expect(out.map((p) => [p.year, p.value])).toEqual([
      [2013, 1],
      [2018, 2],
    ]);
  });
});

describe("splitBySource", () => {
  it("starts a new segment whenever the source changes", () => {
    const segs = splitBySource([pt(2008, 1, 1), pt(2013, 2, 1), pt(2018, 3, 2), pt(2023, 4, 1)]);
    expect(segs.map((s) => s.map((p) => p.year))).toEqual([[2008, 2013], [2018], [2023]]);
  });
  it("returns no segments for no points", () => {
    expect(splitBySource([])).toEqual([]);
  });
});

describe("buildTrendChartData", () => {
  it("never puts two sources on the same line and reports each change", () => {
    const data = buildTrendChartData([
      {
        key: "place",
        label: "Kano",
        color: "#0072B2",
        points: [pt(2013, 10, 1, "DHS"), pt(2018, 12, 1, "DHS"), pt(2021, 14, 2, "MICS")],
      },
    ]);
    expect(data.lines.map((l) => l.dataKey)).toEqual(["place__0", "place__1"]);
    expect(data.lines.map((l) => l.sourceName)).toEqual(["DHS", "MICS"]);
    expect(data.changes).toEqual([
      { seriesKey: "place", seriesLabel: "Kano", year: 2021, from: "DHS", to: "MICS" },
    ]);
    const y2021 = data.rows.find((r) => r.year === 2021)!;
    expect(y2021.place__0).toBeNull();
    expect(y2021.place__1).toBe(14);
  });

  it("merges years across series and fills missing values with null, not 0", () => {
    const data = buildTrendChartData([
      { key: "a", label: "A", color: "#000", points: [pt(2013, 5)] },
      { key: "b", label: "B", color: "#111", points: [pt(2018, 7)] },
    ]);
    expect(data.years).toEqual([2013, 2018]);
    expect(data.rows).toEqual([
      { year: 2013, a__0: 5, b__0: null },
      { year: 2018, a__0: null, b__0: 7 },
    ]);
    expect(data.changes).toEqual([]);
  });

  it("handles empty series", () => {
    expect(buildTrendChartData([{ key: "a", label: "A", color: "#000", points: [] }])).toEqual({
      rows: [],
      lines: [],
      changes: [],
      years: [],
    });
  });
});
