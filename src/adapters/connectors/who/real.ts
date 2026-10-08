import { env } from "@/env";
import { fetchJson } from "@/server/pipeline/http";
import type { ConnectorAdapter, StagedValue } from "../../types";

/**
 * Real WHO Global Health Observatory (OData) driver.
 *
 * Checked 2026-10-08 against https://www.who.int/data/gho/info/gho-odata-api
 * and live responses:
 *   GET {WHO_GHO_API_BASE}/{IndicatorCode}?$filter=SpatialDim eq 'NGA'
 *   → { "@odata.context", value: [ { IndicatorCode, SpatialDimType:'COUNTRY',
 *       SpatialDim:'NGA', TimeDimType:'YEAR', TimeDim:2018, Dim1Type:'SEX'|null,
 *       Dim1:'SEX_BTSX'|'SEX_MLE'|'SEX_FMLE'|null, Dim2…, Dim3…,
 *       NumericValue, Low, High, Value:'61.3 [59.1-63.5]' } ],
 *       "@odata.nextLink"? }
 *   Paging is not documented; we follow @odata.nextLink when present.
 *   Indicator names verified via /api/Indicator?$filter=IndicatorCode eq '…'.
 * National series only (WHO publishes country-level values).
 */

/** GHO indicator code → PopLens catalogue code (verified to have NGA rows). */
export const WHO_INDICATOR_MAP: Array<{ ghoCode: string; code: string; label: string }> = [
  { ghoCode: "WHOSIS_000001", code: "life_expectancy", label: "Life expectancy at birth (years)" },
  {
    ghoCode: "MDG_0000000026",
    code: "mmr",
    label: "Maternal mortality ratio (per 100 000 live births)",
  },
  {
    ghoCode: "MDG_0000000029",
    code: "hiv_prev",
    label: "Prevalence of HIV among adults aged 15 to 49 (%)",
  },
];

interface GhoRow {
  IndicatorCode: string;
  SpatialDim: string;
  TimeDimType: string | null;
  TimeDim: number | null;
  Dim1Type: string | null;
  Dim1: string | null;
  Dim2: string | null;
  Dim3: string | null;
  NumericValue: number | null;
  Low: number | null;
  High: number | null;
}

interface GhoResponse {
  value: GhoRow[];
  "@odata.nextLink"?: string;
}

const SEX: Record<string, "all" | "male" | "female"> = {
  SEX_BTSX: "all",
  SEX_MLE: "male",
  SEX_FMLE: "female",
};

/** Convert one GHO row (null = skip). Exported for tests. */
export function ghoRowToStaged(r: GhoRow, code: string): StagedValue | null {
  if (r.SpatialDim !== "NGA") return null;
  if (r.TimeDimType && r.TimeDimType !== "YEAR") return null;
  if (r.NumericValue === null || r.NumericValue === undefined || r.TimeDim == null) return null;
  // Further disaggregations (age group, wealth…) are only accepted when total.
  for (const d of [r.Dim2, r.Dim3]) {
    if (d && !/_TOTL$|_TOTAL$/.test(d)) return null;
  }
  let sex: "all" | "male" | "female" = "all";
  if (r.Dim1) {
    const s = SEX[r.Dim1];
    if (!s) return null; // Dim1 is something other than sex totals
    sex = s;
  }
  return {
    sourceIndicatorCode: r.IndicatorCode,
    indicatorCode: code,
    geo: { kind: "code", value: "NG", level: "nation" },
    year: Number(r.TimeDim),
    value: Number(r.NumericValue),
    lower: r.Low ?? undefined,
    upper: r.High ?? undefined,
    sex,
    isEstimate: true,
    note: `WHO GHO ${r.IndicatorCode} (modelled estimate)`,
  };
}

export const realWhoConnector: ConnectorAdapter = {
  async run() {
    if (env.ADAPTER_CONNECTOR_WHO !== "real") {
      throw new Error("Real WHO driver called while ADAPTER_CONNECTOR_WHO is not 'real'.");
    }
    const rows: StagedValue[] = [];
    for (const m of WHO_INDICATOR_MAP) {
      const filter = encodeURIComponent("SpatialDim eq 'NGA'");
      let url: string | undefined = `${env.WHO_GHO_API_BASE}/${m.ghoCode}?$filter=${filter}`;
      let guard = 0;
      while (url && guard++ < 50) {
        const res: GhoResponse = await fetchJson<GhoResponse>(url, { label: `WHO GHO ${m.ghoCode}` });
        for (const r of res.value ?? []) {
          const s = ghoRowToStaged(r, m.code);
          if (s) rows.push(s);
        }
        url = res["@odata.nextLink"];
      }
    }
    if (rows.length === 0) throw new Error("WHO GHO returned no usable Nigerian rows.");
    const years = rows.map((r) => r.year);
    return {
      sourceKey: "who-gho",
      datasetTitle: "WHO Global Health Observatory — Nigeria national series",
      seriesKey: "who-gho-national",
      releaseNote: `WHO GHO OData pull: ${rows.length} values, ${Math.min(...years)}–${Math.max(...years)}.`,
      rows,
    };
  },
};
