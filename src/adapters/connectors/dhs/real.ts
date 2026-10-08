import { env } from "@/env";
import { fetchJson } from "@/server/pipeline/http";
import type { ConnectorAdapter, StagedValue } from "../../types";

/**
 * Real DHS Program indicator API driver.
 *
 * Checked against the API documentation on 2026-10-08
 * (https://api.dhsprogram.com/#/api-data.cfm, served from /html/api-data.cfm,
 * and /html/api-advancedqueries.cfm):
 *   GET {DHS_API_BASE}/data
 *     countryIds=NG               DHS two-letter country code
 *     indicatorIds=A,B,C          comma-separated indicator ids
 *     breakdown=national|subnational|background|all   (default national)
 *     characteristicCategory=residence   exact-phrase, case-insensitive filter
 *     perPage (max 1000 without an API key) & page (1-based)
 *     returnFields=…              column subset (query-style calls only)
 *     f=json
 *   Response: { RecordCount, TotalPages, Page, Data: [...] } with fields
 *   (see /rest/dhs/data/fields) IndicatorId, SurveyId, SurveyYear,
 *   SurveyType, Value, CILow, CIHigh, CharacteristicCategory,
 *   CharacteristicLabel, IsTotal, IsPreferred, LevelRank, ByVariableLabel.
 *
 * Observed shape for Nigeria (probed 2026-10-08, NG2018DHS):
 *   - breakdown=national → CharacteristicCategory 'Total' (IsTotal=1)
 *   - breakdown=subnational → CharacteristicCategory 'Region':
 *       LevelRank 1 = geopolitical zone ("North Central"),
 *       LevelRank 2 = state, label prefixed with ".." ("..FCT Abuja", "..Nasarawa")
 *       Pre-2008 surveys use historic regions labelled "Northeast - 1990" —
 *       these are NOT today's zones and are skipped.
 *   - Several rows per indicator differ by ByVariableLabel (e.g. "Five years
 *     preceding the survey" vs "Ten years…"); IsPreferred=1 marks the one
 *     DHS publishes as headline — we keep only IsPreferred rows.
 * Places are emitted as NAME refs and resolved by the matching engine
 * (state spellings like "FCT Abuja" resolve through aliases).
 *
 * Fallback if the API is unreachable: the Humanitarian Data Exchange copy of
 * Nigeria's subnational DHS indicators (upload it through the wizard).
 */

/**
 * DHS indicator id → PopLens catalogue code. Every id below was verified to
 * return Nigerian data on 2026-10-08 (survey years in brackets).
 * Not mapped (no Nigerian rows in the API): HA_HIVP_B_HIV (HIV prevalence),
 * HC_HHSZ_H_AVG, AH_HINS_W_ANY, WS_HNDW_H_SPW, FE_FRTY_W_A15.
 */
export const DHS_INDICATOR_MAP: Array<{ dhsId: string; code: string; note?: string }> = [
  { dhsId: "CM_ECMR_C_U5M", code: "u5mr" }, // 1990–2024
  { dhsId: "CM_ECMR_C_IMR", code: "imr" },
  { dhsId: "CM_ECMR_C_NNR", code: "nmr" },
  { dhsId: "FE_FRTR_W_TFR", code: "tfr" },
  { dhsId: "CN_NUTS_C_HA2", code: "stunting" },
  { dhsId: "CN_NUTS_C_WH2", code: "wasting" },
  { dhsId: "CN_NUTS_C_WA2", code: "underweight" },
  { dhsId: "CN_NUTS_C_WHP", code: "overweight_children" },
  { dhsId: "CN_ANMC_C_ANY", code: "anaemia_children" }, // 2018, 2024
  { dhsId: "AN_ANEM_W_ANY", code: "anaemia_women" }, // 2018, 2024
  { dhsId: "ML_PMAL_C_MSY", code: "malaria_prev_children" }, // 2018 (microscopy)
  { dhsId: "CH_VACS_C_BAS", code: "full_immunisation" },
  { dhsId: "CH_VACS_C_NON", code: "zero_dose" },
  { dhsId: "CH_VACC_C_MSL", code: "measles_vaccination" },
  { dhsId: "CH_VACC_C_DP3", code: "dpt3" },
  { dhsId: "RH_ANCN_W_N4P", code: "anc4" },
  { dhsId: "RH_DELA_C_SKP", code: "sba" },
  { dhsId: "RH_DELP_C_DHF", code: "facility_delivery" },
  { dhsId: "RH_PCMN_W_MOT", code: "postnatal_care" }, // 2024 only
  { dhsId: "FP_CUSM_W_MOD", code: "mcpr" },
  { dhsId: "FP_NADM_W_UNT", code: "unmet_need_fp" },
  { dhsId: "ML_NETC_C_ITN", code: "itn_use" },
  { dhsId: "CH_ARIS_C_ADV", code: "care_seeking_ari" },
  { dhsId: "WS_SRCE_H_IMP", code: "improved_water" },
  {
    dhsId: "WS_TLET_H_IMP",
    code: "improved_sanitation",
    note: "DHS 'improved sanitation facility' (shared facilities may be included).",
  },
  { dhsId: "WS_TLET_H_NFC", code: "open_defecation" },
  { dhsId: "HC_ELEC_H_ELC", code: "electricity_access" },
  { dhsId: "HC_CKFL_H_CLN", code: "clean_cooking_fuel" },
  { dhsId: "ED_LITR_W_LIT", code: "female_literacy" },
  { dhsId: "CH_SZWT_C_L25", code: "low_birth_weight", note: "Among births with a reported birth weight." },
  { dhsId: "ED_NARP_B_BTH", code: "primary_attendance" },
  { dhsId: "ED_NARS_B_BTH", code: "secondary_attendance" },
];

interface DhsRow {
  IndicatorId: string;
  SurveyId: string;
  SurveyYear: number;
  SurveyType: string;
  Value: number | null | "";
  CILow: number | null | "";
  CIHigh: number | null | "";
  CharacteristicCategory: string;
  CharacteristicLabel: string;
  IsTotal: number;
  IsPreferred: number;
  LevelRank: number | "";
  ByVariableLabel: string;
}

interface DhsPage {
  RecordCount: number;
  TotalPages: number;
  Page: number | string;
  Data: DhsRow[];
}

const RETURN_FIELDS = [
  "IndicatorId",
  "SurveyId",
  "SurveyYear",
  "SurveyType",
  "Value",
  "CILow",
  "CIHigh",
  "CharacteristicCategory",
  "CharacteristicLabel",
  "IsTotal",
  "IsPreferred",
  "LevelRank",
  "ByVariableLabel",
].join(",");

const PER_PAGE = 1000; // documented max without an API key
const BATCH = 6; // indicators per request (keeps URLs and pages small)

async function fetchAll(params: Record<string, string>): Promise<DhsRow[]> {
  const out: DhsRow[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const qs = new URLSearchParams({
      ...params,
      countryIds: "NG",
      perPage: String(PER_PAGE),
      page: String(page),
      returnFields: RETURN_FIELDS,
      f: "json",
    });
    const res = await fetchJson<DhsPage>(`${env.DHS_API_BASE}/data?${qs.toString()}`, {
      label: "DHS API",
    });
    out.push(...(res.Data ?? []));
    totalPages = Number(res.TotalPages) || 1;
    page++;
  } while (page <= totalPages && page <= 200);
  return out;
}

const num = (v: number | null | "" | undefined): number | undefined =>
  v === "" || v === null || v === undefined || !Number.isFinite(Number(v)) ? undefined : Number(v);

/** Convert one DHS API row to a staged value (null = skip). Exported for tests. */
export function dhsRowToStaged(
  r: DhsRow,
  codeById: Map<string, { code: string; note?: string }>,
): StagedValue | null {
  if (r.IsPreferred !== 1) return null;
  const mapped = codeById.get(r.IndicatorId);
  const value = num(r.Value);
  if (!mapped || value === undefined) return null;
  const base = {
    sourceIndicatorCode: r.IndicatorId,
    indicatorCode: mapped.code,
    year: Number(r.SurveyYear),
    periodLabel: `${r.SurveyType} ${r.SurveyYear}`,
    value,
    lower: num(r.CILow),
    upper: num(r.CIHigh),
    isEstimate: true,
    note: [`DHS ${r.SurveyId}`, r.ByVariableLabel, mapped.note].filter(Boolean).join(" · "),
  };
  const cat = (r.CharacteristicCategory ?? "").toLowerCase();
  if (cat === "total") {
    return { ...base, geo: { kind: "code", value: "NG", level: "nation" } };
  }
  if (cat === "residence") {
    const l = r.CharacteristicLabel.trim().toLowerCase();
    if (l !== "urban" && l !== "rural") return null;
    return { ...base, residence: l, geo: { kind: "code", value: "NG", level: "nation" } };
  }
  if (cat === "region") {
    const raw = r.CharacteristicLabel ?? "";
    // Historic (pre-2008) region definitions, e.g. "Northeast - 1990".
    if (/\s-\s\d{4}\s*$/.test(raw)) return null;
    const isState = raw.startsWith("..") || Number(r.LevelRank) === 2;
    const name = raw.replace(/^\.+/, "").trim();
    if (!name) return null;
    return { ...base, geo: { kind: "name", value: name, level: isState ? "state" : "zone" } };
  }
  return null;
}

export const realDhsConnector: ConnectorAdapter = {
  async run() {
    if (env.ADAPTER_CONNECTOR_DHS !== "real") {
      throw new Error("Real DHS driver called while ADAPTER_CONNECTOR_DHS is not 'real'.");
    }
    const codeById = new Map(DHS_INDICATOR_MAP.map((m) => [m.dhsId, m]));
    const ids = DHS_INDICATOR_MAP.map((m) => m.dhsId);
    const raw: DhsRow[] = [];
    for (let i = 0; i < ids.length; i += BATCH) {
      const indicatorIds = ids.slice(i, i + BATCH).join(",");
      raw.push(...(await fetchAll({ indicatorIds, breakdown: "national" })));
      raw.push(...(await fetchAll({ indicatorIds, breakdown: "subnational" })));
      raw.push(
        ...(await fetchAll({ indicatorIds, breakdown: "background", characteristicCategory: "residence" })),
      );
    }
    // Prefer standard DHS over other survey types (MIS, …) when a year repeats:
    // the pipeline keeps the first row per natural key.
    raw.sort((a, b) => (a.SurveyType === "DHS" ? 0 : 1) - (b.SurveyType === "DHS" ? 0 : 1));
    const rows = raw
      .map((r) => dhsRowToStaged(r, codeById))
      .filter((r): r is StagedValue => r !== null);
    if (rows.length === 0) throw new Error("DHS API returned no usable Nigerian rows.");
    const years = [...new Set(rows.map((r) => r.year))].sort();
    return {
      sourceKey: "dhs",
      datasetTitle: "DHS Program survey indicators — Nigeria",
      seriesKey: "dhs-indicators",
      releaseNote: `DHS Program API pull: ${rows.length} values, surveys ${years.join(", ")} (national, zone, state, urban/rural).`,
      rows,
    };
  },
};
