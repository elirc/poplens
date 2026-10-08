import { createElement, type ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { assembleReport, type ReportIndicator, type ReportPlace, type ReportValueInput } from "./assemble";
import type { ReportData } from "./data";
import { ReportDocument } from "./document";

// Render smoke test: the PDF builds with tables, bars, a source-broken trend
// and maps. Fixture numbers are arbitrary test values.

const places: ReportPlace[] = [
  { id: 1, code: "TST-A", name: "Alpha", level: "state" },
  { id: 2, code: "TST-B", name: "Beta", level: "lga" },
];
const ind: ReportIndicator = {
  id: 1,
  code: "t",
  name: "Test indicator",
  definition: "Defined for tests.",
  unit: "%",
  valueType: "percent",
  decimals: 1,
  higherIsBetter: true,
};
const v = (o: Partial<ReportValueInput>): ReportValueInput => ({
  geoUnitId: 1,
  year: 2018,
  periodLabel: null,
  value: 10,
  lower: null,
  upper: null,
  isEstimate: true,
  datasetId: 1,
  datasetTitle: "Demo",
  isSynthetic: true,
  sourceId: 1,
  sourceKey: "a",
  sourcePublisher: "Pub A",
  sourceTitle: "Source A",
  ...o,
});

const square = (x: number, y: number, s: number) => ({
  type: "Feature" as const,
  properties: {},
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [x, y],
        [x + s, y],
        [x + s, y + s],
        [x, y + s],
        [x, y],
      ],
    ],
  },
});

describe("ReportDocument", () => {
  it("renders a PDF buffer", async () => {
    const model = assembleReport({
      places,
      indicators: [ind],
      valuesByIndicator: new Map([
        [
          1,
          [
            v({ year: 2013, value: 5 }),
            v({ year: 2018, value: 8, lower: 6, upper: 10 }),
            v({ year: 2021, value: 9, sourceKey: "b", sourceId: 2, datasetId: 2, sourcePublisher: "Pub B" }),
            v({ geoUnitId: 2, value: 12 }),
          ],
        ],
      ]),
    });
    const data: ReportData = {
      model,
      maps: [
        { place: places[0], context: square(3, 4, 10), nation: square(3, 4, 10), feature: square(5, 6, 2) },
        { place: places[1], context: null, nation: null, feature: null },
      ],
      licences: new Map([[1, { licence: "CC0", url: null, allowsRedistribution: true }]]),
      missing: { places: [], indicators: ["nope"] },
    };
    const el = createElement(ReportDocument, { title: "Test report", data, generatedAt: new Date("2026-01-01") });
    const buf = await renderToBuffer(el as unknown as ReactElement<DocumentProps>);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(2000);
  }, 60_000);
});
