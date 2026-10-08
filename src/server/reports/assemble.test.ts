import { describe, expect, it } from "vitest";
import {
  assembleReport,
  dedupeByYear,
  linearScale,
  niceMax,
  segmentBySource,
  type ReportIndicator,
  type ReportPlace,
  type ReportValueInput,
} from "./assemble";
import { projectFeatures, rewindForD3, ringArea } from "./geo-svg";
import { reportParamsSchema } from "./params";

// Fixture numbers below are arbitrary test values, not statistics.

const places: ReportPlace[] = [
  { id: 1, code: "TST-A", name: "Alpha", level: "state" },
  { id: 2, code: "TST-B", name: "Beta", level: "state" },
  { id: 3, code: "TST-C", name: "Gamma", level: "state" },
];

const pct: ReportIndicator = {
  id: 10,
  code: "test_pct",
  name: "Test percent",
  definition: "A test indicator",
  unit: "%",
  valueType: "percent",
  decimals: 1,
  higherIsBetter: true,
};

function v(over: Partial<ReportValueInput>): ReportValueInput {
  return {
    geoUnitId: 1,
    year: 2018,
    periodLabel: null,
    value: 10,
    lower: null,
    upper: null,
    isEstimate: false,
    datasetId: 1,
    datasetTitle: "Test dataset",
    isSynthetic: false,
    sourceId: 1,
    sourceKey: "src-a",
    sourcePublisher: "Publisher A",
    sourceTitle: "Source A",
    ...over,
  };
}

describe("assembleReport", () => {
  const rows = [
    v({ geoUnitId: 1, year: 2013, value: 20, sourceKey: "src-a" }),
    v({ geoUnitId: 1, year: 2018, value: 25, lower: 22, upper: 28, isEstimate: true }),
    v({ geoUnitId: 1, year: 2021, value: 30, sourceId: 2, sourceKey: "src-b", sourcePublisher: "Publisher B", datasetId: 2, datasetTitle: "B data" }),
    v({ geoUnitId: 2, year: 2018, value: 40, isSynthetic: true }),
  ];
  const model = assembleReport({
    places,
    indicators: [pct],
    valuesByIndicator: new Map([[pct.id, rows]]),
  });
  const s = model.sections[0];

  it("uses the latest year per place when no year is given", () => {
    expect(s.rows[0]).toMatchObject({ value: 30, year: 2021, display: "30.0%" });
    expect(s.rows[1]).toMatchObject({ value: 40, year: 2018 });
  });

  it("renders missing data as 'No data', never 0", () => {
    expect(s.rows[2]).toMatchObject({ value: null, display: "No data", source: null });
    expect(s.bars.map((b) => b.label)).toEqual(["Alpha", "Beta"]);
  });

  it("keeps CI and estimate flag for the chosen year", () => {
    const m = assembleReport({ places, indicators: [pct], valuesByIndicator: new Map([[pct.id, rows]]), year: 2018 });
    expect(m.sections[0].rows[0]).toMatchObject({ value: 25, isEstimate: true, ci: "(22.0%–28.0%)" });
    expect(m.sections[0].rows[2].display).toBe("No data");
  });

  it("flags synthetic data and lists every source", () => {
    expect(model.anySynthetic).toBe(true);
    expect(model.sources.map((x) => x.publisher)).toEqual(["Publisher A", "Publisher B"]);
    expect(s.sources).toContain("Publisher B — B data");
  });

  it("splits the trend line where the source changes", () => {
    const alpha = s.trend!.lines.find((l) => l.place.code === "TST-A")!;
    expect(alpha.segments).toHaveLength(2);
    expect(alpha.segments[0].points.map((p) => p.year)).toEqual([2013, 2018]);
    expect(alpha.sourceBreaks).toEqual([2021]);
    expect(s.trend).toMatchObject({ minYear: 2013, maxYear: 2021, minValue: 20, maxValue: 40 });
  });

  it("has no trend when every place has a single year", () => {
    const m = assembleReport({
      places,
      indicators: [pct],
      valuesByIndicator: new Map([[pct.id, [v({ geoUnitId: 2 })]]]),
    });
    expect(m.sections[0].trend).toBeNull();
    expect(m.sections[0].hasData).toBe(true);
  });

  it("marks indicators without any data", () => {
    const m = assembleReport({ places, indicators: [pct], valuesByIndicator: new Map() });
    expect(m.sections[0].hasData).toBe(false);
    expect(m.sections[0].rows.every((r) => r.display === "No data")).toBe(true);
    expect(m.anySynthetic).toBe(false);
  });
});

describe("helpers", () => {
  it("dedupeByYear keeps the newest dataset for a place-year", () => {
    const m = dedupeByYear([v({ datasetId: 1, value: 1 }), v({ datasetId: 5, value: 5 }), v({ datasetId: 3, value: 3 })]);
    expect(m.get(1)!.get(2018)!.value).toBe(5);
  });
  it("segmentBySource returns one segment for one source", () => {
    const r = segmentBySource([v({ year: 1 }), v({ year: 2 })]);
    expect(r.segments).toHaveLength(1);
    expect(r.breaks).toEqual([]);
  });
  it("linearScale and niceMax", () => {
    expect(linearScale([0, 10], [0, 100])(5)).toBe(50);
    expect(linearScale([3, 3], [0, 100])(3)).toBe(50);
    expect(niceMax(37)).toBe(50);
    expect(niceMax(0)).toBe(1);
    expect(niceMax(180)).toBe(200);
  });
});

describe("report params", () => {
  it("dedupes codes and enforces bounds", () => {
    const p = reportParamsSchema.parse({ placeCodes: ["NG", "NG"], indicatorCodes: ["a"] });
    expect(p.placeCodes).toEqual(["NG"]);
    expect(reportParamsSchema.safeParse({ placeCodes: [], indicatorCodes: ["a"] }).success).toBe(false);
    expect(reportParamsSchema.safeParse({ placeCodes: ["x;drop"], indicatorCodes: ["a"] }).success).toBe(false);
  });
});

describe("geo-svg", () => {
  // A CCW (RFC 7946-style) square around (5,10)…(6,11).
  const ccwSquare = {
    type: "Polygon",
    coordinates: [
      [
        [5, 10],
        [6, 10],
        [6, 11],
        [5, 11],
        [5, 10],
      ],
    ],
  };

  it("rewinds exterior rings to clockwise for d3", () => {
    expect(ringArea(ccwSquare.coordinates[0])).toBeGreaterThan(0);
    const r = rewindForD3(ccwSquare) as typeof ccwSquare;
    expect(ringArea(r.coordinates[0])).toBeLessThan(0);
  });

  it("fits a CCW polygon to the viewport instead of the whole globe", () => {
    const out = projectFeatures([{ type: "Feature", properties: {}, geometry: ccwSquare }], 100, 100, { padding: 0 });
    const d = out.paths[0]!;
    expect(d).toMatch(/^M/);
    const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
    for (const n of nums) {
      expect(n).toBeGreaterThanOrEqual(-0.01);
      expect(n).toBeLessThanOrEqual(100.01);
    }
    // It should fill the frame in at least one dimension.
    expect(Math.max(...nums) - Math.min(...nums)).toBeGreaterThan(90);
  });

  it("returns no paths for no features", () => {
    expect(projectFeatures([], 10, 10).paths).toEqual([]);
  });
});
