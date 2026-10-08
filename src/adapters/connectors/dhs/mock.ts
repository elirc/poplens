import type { ConnectorAdapter, StagedValue } from "../../types";
import { syntheticStateValues } from "../synthetic";

/**
 * Mock DHS connector: deterministic SYNTHETIC survey-style values for a
 * handful of indicators at state + national level, for DHS-style survey
 * years. No network. Every value is marked as synthetic in its note.
 */
export const mockDhsConnector: ConnectorAdapter = {
  async run() {
    const rows: StagedValue[] = [];
    const surveys: Array<[number, string]> = [
      [2013, "2013 DHS (synthetic)"],
      [2018, "2018 DHS (synthetic)"],
    ];
    const indicators: Array<[string, string, number, number]> = [
      // [poplensCode, dhsStyleCode, baseline, spread]
      ["u5mr", "CM_ECMR_C_U5M", 110, 60],
      ["imr", "CM_ECMR_C_IMR", 65, 30],
      ["anc4", "RH_ANCN_W_N4P", 55, 35],
      ["sba", "RH_DELA_C_SKP", 45, 40],
      ["mcpr", "FP_CUSM_W_MOD", 15, 14],
      ["stunting", "CN_NUTS_C_HA2", 35, 25],
    ];
    for (const [year, label] of surveys) {
      for (const [code, dhsCode, base, spread] of indicators) {
        for (const v of syntheticStateValues(`dhs:${code}:${year}`, base, spread)) {
          rows.push({
            sourceIndicatorCode: dhsCode,
            indicatorCode: code,
            geo: v.geo,
            year,
            periodLabel: label,
            value: v.value,
            lower: Math.max(0, v.value * 0.9),
            upper: v.value * 1.1,
            isEstimate: true,
            note: "SYNTHETIC demo value — not a real statistic",
          });
        }
      }
    }
    return {
      sourceKey: "dhs",
      datasetTitle: "DHS survey indicators (mock run)",
      seriesKey: "dhs-indicators",
      releaseNote: "Mock connector run with synthetic values",
      rows,
    };
  },
};
