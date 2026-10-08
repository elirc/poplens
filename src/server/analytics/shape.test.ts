import { describe, expect, it } from "vitest";
import {
  buildRankings,
  commonYears,
  dedupeTrendRows,
  pairValues,
  pickCompareYear,
  resolveYear,
  sourceLabel,
  toCell,
  type PublishedRow,
} from "./shape";

function row(geoUnitId: number, value: number, extra: Partial<PublishedRow> = {}): PublishedRow {
  return {
    value,
    lower: null,
    upper: null,
    year: 2018,
    periodLabel: null,
    isEstimate: false,
    geoUnitId,
    datasetId: 1,
    isSynthetic: false,
    sourceId: 1,
    sourcePublisher: "DHS",
    ...extra,
  };
}

describe("sourceLabel / toCell", () => {
  it("always flags synthetic data", () => {
    expect(sourceLabel("PopLens", true)).toBe("PopLens — SYNTHETIC demo data");
    expect(sourceLabel("DHS", false)).toBe("DHS");
    const c = toCell(row(1, 12.5, { lower: 10, upper: 15, isSynthetic: true, isEstimate: true }));
    expect(c).toMatchObject({ value: 12.5, lower: 10, upper: 15, isEstimate: true, year: 2018 });
    expect(c.source).toMatch(/SYNTHETIC/);
  });
});

describe("resolveYear", () => {
  it("keeps an available requested year", () => {
    expect(resolveYear(2013, [2013, 2018])).toEqual({ year: 2013, fallback: false });
  });
  it("falls back to the latest and flags it", () => {
    expect(resolveYear(2000, [2013, 2018])).toEqual({ year: 2018, fallback: true });
    expect(resolveYear(null, [2018, 2013])).toEqual({ year: 2018, fallback: false });
  });
  it("is null with no years", () => {
    expect(resolveYear(null, [])).toEqual({ year: null, fallback: false });
  });
});

describe("pickCompareYear", () => {
  it("uses the latest year every place with data shares", () => {
    const c = pickCompareYear(
      new Map([
        ["NG-KN", [2013, 2018, 2023]],
        ["NG-LA", [2013, 2018]],
      ]),
    );
    expect(c).toEqual({ mode: "common", year: 2018 });
  });
  it("ignores places with no data at all", () => {
    expect(
      pickCompareYear(
        new Map([
          ["NG-KN", [2018]],
          ["NG-KN-GWALE", []],
        ]),
      ),
    ).toEqual({ mode: "common", year: 2018 });
  });
  it("falls back to each place's latest year when none is shared", () => {
    const c = pickCompareYear(
      new Map([
        ["NG", [2013, 2018]],
        ["NG-KN-GWALE", [2023]],
      ]),
    );
    expect(c.mode).toBe("latest-each");
    if (c.mode === "latest-each") {
      expect(c.years.get("NG")).toBe(2018);
      expect(c.years.get("NG-KN-GWALE")).toBe(2023);
    }
  });
  it("is none when nobody has data", () => {
    expect(pickCompareYear(new Map([["a", []]]))).toEqual({ mode: "none" });
  });
});

describe("commonYears", () => {
  it("intersects and sorts", () => {
    expect(commonYears([2023, 2013, 2018], [2018, 2023, 2024])).toEqual([2018, 2023]);
    expect(commonYears([2013], [2018])).toEqual([]);
  });
});

describe("dedupeTrendRows", () => {
  it("keeps one point per place/year/source (latest dataset) but keeps different sources apart", () => {
    const rows = [
      row(1, 10, { year: 2018, datasetId: 1 }),
      row(1, 11, { year: 2018, datasetId: 5 }),
      row(1, 12, { year: 2018, datasetId: 3, sourceId: 2 }),
      row(1, 9, { year: 2013, datasetId: 1 }),
    ];
    const out = dedupeTrendRows(rows);
    expect(out.map((r) => [r.year, r.sourceId, r.value])).toEqual([
      [2013, 1, 9],
      [2018, 1, 11],
      [2018, 2, 12],
    ]);
  });
});

describe("buildRankings", () => {
  const places = [
    { id: 1, code: "A", name: "Alpha", parent: null },
    { id: 2, code: "B", name: "Bravo", parent: null },
    { id: 3, code: "C", name: "Charlie", parent: null },
    { id: 4, code: "D", name: "Delta", parent: null },
  ];
  const values = [row(1, 50), row(2, 120), row(3, 80)];

  it("lower-is-better: smallest value is rank 1", () => {
    const { rows, noData } = buildRankings(places, values, false);
    expect(rows.map((r) => [r.code, r.rank, r.outOf])).toEqual([
      ["A", 1, 3],
      ["C", 2, 3],
      ["B", 3, 3],
    ]);
    expect(noData).toEqual([{ code: "D", name: "Delta", parent: null }]);
  });

  it("higher-is-better: largest value is rank 1", () => {
    const { rows } = buildRankings(places, values, true);
    expect(rows[0]!.code).toBe("B");
  });

  it("never ranks places without data and shares ranks on ties", () => {
    const { rows, noData } = buildRankings(places, [row(1, 5), row(2, 5), row(4, 1)], true);
    expect(rows.map((r) => r.rank)).toEqual([1, 1, 3]);
    expect(rows.every((r) => r.outOf === 3)).toBe(true);
    expect(noData.map((p) => p.code)).toEqual(["C"]);
  });

  it("ignores values for places outside the list", () => {
    const { rows } = buildRankings(places.slice(0, 1), [row(1, 1), row(99, 2)], true);
    expect(rows).toHaveLength(1);
  });
});

describe("pairValues", () => {
  it("plots only places with both values and reports what is missing", () => {
    const places = [
      { id: 1, code: "A", name: "Alpha" },
      { id: 2, code: "B", name: "Bravo" },
      { id: 3, code: "C", name: "Charlie" },
      { id: 4, code: "D", name: "Delta" },
    ];
    const { points, missing } = pairValues(
      places,
      [row(1, 10), row(2, 20), row(4, Number.NaN)],
      [row(1, 100), row(3, 300)],
    );
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ code: "A", x: 10, y: 100 });
    expect(missing).toEqual([
      { code: "B", name: "Bravo", lacks: "y" },
      { code: "C", name: "Charlie", lacks: "x" },
      { code: "D", name: "Delta", lacks: "both" },
    ]);
  });
});
