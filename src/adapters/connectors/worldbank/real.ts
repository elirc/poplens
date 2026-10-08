import { env } from "@/env";
import { fetchJson } from "@/server/pipeline/http";
import type { ConnectorAdapter, StagedValue } from "../../types";

/**
 * Real World Bank Indicators API (v2) driver.
 *
 * Checked 2026-10-08 against live responses of
 *   GET {WORLD_BANK_API_BASE}/country/NGA/indicator/{code}?format=json&per_page=1000&page=N
 * → [ { page, pages, per_page, total, sourceid, lastupdated },
 *     [ { indicator:{id,value}, country:{id:'NG',value:'Nigeria'},
 *         countryiso3code:'NGA', date:'2023', value:number|null,
 *         unit, obs_status, decimal } ] ]
 * `value: null` means no data for that year and is skipped (never 0).
 * The API is slow at times (requests >40 s observed), hence long timeouts.
 * National series only.
 */

/** WDI code → PopLens catalogue code (verified to have NGA rows). */
export const WORLD_BANK_INDICATOR_MAP: Array<{ wbCode: string; code: string; note?: string }> = [
  { wbCode: "SP.POP.TOTL", code: "pop_total", note: "UN WPP-based modelled estimate" },
  { wbCode: "SP.POP.GROW", code: "pop_growth_rate" },
  { wbCode: "SP.URB.TOTL.IN.ZS", code: "urban_share" },
  { wbCode: "SP.DYN.TFRT.IN", code: "tfr" },
  { wbCode: "SP.ADO.TFRT", code: "adolescent_birth_rate" },
  {
    wbCode: "EG.ELC.ACCS.ZS",
    code: "electricity_access",
    note: "World Bank measures % of population (PopLens definition: households)",
  },
  {
    wbCode: "SE.ADT.LITR.FE.ZS",
    code: "female_literacy",
    note: "World Bank covers women aged 15+ (PopLens definition: 15–49)",
  },
];

interface WbMeta {
  page: number;
  pages: number;
  per_page: number;
  total: number;
  lastupdated?: string;
}

interface WbRow {
  indicator: { id: string; value: string };
  countryiso3code: string;
  date: string;
  value: number | null;
}

type WbResponse = [WbMeta, WbRow[] | null] | [{ message: unknown }];

/** Convert one WDI row (null = skip). Exported for tests. */
export function wbRowToStaged(r: WbRow, code: string, note?: string): StagedValue | null {
  if (r.countryiso3code !== "NGA") return null;
  if (r.value === null || r.value === undefined || !Number.isFinite(Number(r.value))) return null;
  const year = Number.parseInt(r.date, 10);
  if (!Number.isFinite(year)) return null;
  return {
    sourceIndicatorCode: r.indicator.id,
    indicatorCode: code,
    geo: { kind: "code", value: "NG", level: "nation" },
    year,
    value: Number(r.value),
    isEstimate: true,
    note: [`World Bank WDI ${r.indicator.id}`, note].filter(Boolean).join(" · "),
  };
}

export const realWorldBankConnector: ConnectorAdapter = {
  async run() {
    if (env.ADAPTER_CONNECTOR_WORLDBANK !== "real") {
      throw new Error("Real World Bank driver called while ADAPTER_CONNECTOR_WORLDBANK is not 'real'.");
    }
    const rows: StagedValue[] = [];
    let lastUpdated: string | undefined;
    for (const m of WORLD_BANK_INDICATOR_MAP) {
      let page = 1;
      let pages = 1;
      do {
        const url = `${env.WORLD_BANK_API_BASE}/country/NGA/indicator/${encodeURIComponent(m.wbCode)}?format=json&per_page=1000&page=${page}`;
        const res = await fetchJson<WbResponse>(url, { label: `World Bank ${m.wbCode}`, timeoutMs: 90_000 });
        const meta = res[0] as WbMeta | { message: unknown };
        if ("message" in meta) {
          throw new Error(`World Bank API error for ${m.wbCode}: ${JSON.stringify(meta.message)}`);
        }
        pages = Number(meta.pages) || 1;
        lastUpdated = meta.lastupdated ?? lastUpdated;
        for (const r of (res[1] as WbRow[] | null) ?? []) {
          const s = wbRowToStaged(r, m.code, m.note);
          if (s) rows.push(s);
        }
        page++;
      } while (page <= pages && page <= 20);
    }
    if (rows.length === 0) throw new Error("World Bank API returned no usable Nigerian rows.");
    const years = rows.map((r) => r.year);
    return {
      sourceKey: "worldbank",
      datasetTitle: "World Bank WDI — Nigeria national series",
      seriesKey: "worldbank-national",
      releaseNote: `World Bank API pull: ${rows.length} values, ${Math.min(...years)}–${Math.max(...years)}${lastUpdated ? ` (WDI last updated ${lastUpdated})` : ""}.`,
      rows,
    };
  },
};
