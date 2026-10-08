import type { ConnectorAdapter, StagedValue } from "../../types";
import { syntheticNationalSeries } from "../synthetic";

/** Mock World Bank connector: SYNTHETIC national annual series. No network. */
export const mockWorldBankConnector: ConnectorAdapter = {
  async run() {
    const years = Array.from({ length: 15 }, (_, i) => 2009 + i);
    const series: Array<[string, string, number, number, number]> = [
      ["pop_growth_rate", "SP.POP.GROW", 2.7, -0.01, 0.06],
      ["urban_share", "SP.URB.TOTL.IN.ZS", 43, 0.65, 0.2],
      ["electricity_access", "EG.ELC.ACCS.ZS", 48, 1.1, 1.5],
      ["female_literacy", "SE.ADT.LITR.FE.ZS", 50, 0.6, 1.2],
    ];
    const rows: StagedValue[] = [];
    for (const [code, wbCode, start, trend, noise] of series) {
      for (const p of syntheticNationalSeries(`wb:${code}`, years, start, trend, noise)) {
        rows.push({
          sourceIndicatorCode: wbCode,
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
      sourceKey: "worldbank",
      datasetTitle: "World Bank national series (mock run)",
      seriesKey: "worldbank-national",
      releaseNote: "Mock connector run with synthetic values",
      rows,
    };
  },
};
