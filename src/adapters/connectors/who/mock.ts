import type { ConnectorAdapter, StagedValue } from "../../types";
import { syntheticNationalSeries } from "../synthetic";

/** Mock WHO GHO connector: SYNTHETIC national annual series. No network. */
export const mockWhoConnector: ConnectorAdapter = {
  async run() {
    const years = Array.from({ length: 10 }, (_, i) => 2014 + i);
    const series: Array<[string, string, number, number, number]> = [
      // [poplensCode, ghoStyleCode, start, trendPerYear, noise]
      ["life_expectancy", "WHOSIS_000001", 52, 0.35, 0.4],
      ["mmr", "MDG_0000000026", 980, -18, 25],
      ["hiv_prev", "MDG_0000000029", 1.6, -0.03, 0.05],
    ];
    const rows: StagedValue[] = [];
    for (const [code, ghoCode, start, trend, noise] of series) {
      for (const p of syntheticNationalSeries(`who:${code}`, years, start, trend, noise)) {
        rows.push({
          sourceIndicatorCode: ghoCode,
          indicatorCode: code,
          geo: { kind: "code", value: "NG", level: "nation" },
          year: p.year,
          value: p.value,
          isEstimate: true,
          note: "SYNTHETIC demo value — not a real statistic",
        });
      }
    }
    return {
      sourceKey: "who-gho",
      datasetTitle: "WHO GHO national series (mock run)",
      seriesKey: "who-gho-national",
      releaseNote: "Mock connector run with synthetic values",
      rows,
    };
  },
};
