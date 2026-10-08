/**
 * Shared pipeline types. Pure — safe to import from client components
 * (no db/env imports here).
 */

export type Breakdown = { sex: string; ageGroup: string; residence: string };

/** An indicator value ready to insert (places + indicator already resolved). */
export interface ResolvedValue extends Breakdown {
  indicatorId: number;
  indicatorCode: string;
  geoUnitId: number;
  year: number;
  periodLabel: string | null;
  value: number;
  lower: number | null;
  upper: number | null;
  isEstimate: boolean;
  note: string | null;
}

/** A weekly outbreak line ready to insert. */
export interface ResolvedOutbreak {
  disease: "cholera" | "lassa_fever" | "meningitis" | "measles";
  stateId: number;
  year: number;
  week: number;
  suspected: number | null;
  confirmed: number | null;
  deaths: number | null;
}

export interface ChangeSample {
  kind: "added" | "changed" | "removed";
  /** Human key, e.g. "u5mr · NG-KN · 2018" (+ breakdown when not headline). */
  key: string;
  oldValue: number | null;
  newValue: number | null;
}

/**
 * Stored in datasets.change_summary: diff of a draft against the currently
 * published version of the same seriesKey (computed at import time).
 */
export interface ChangeSummary {
  kind: "indicator_values" | "outbreak_reports";
  comparedWithDatasetId: number | null;
  comparedWithVersion: number | null;
  total: number;
  added: number;
  changed: number;
  removed: number;
  unchanged: number;
  samples: ChangeSample[];
  /** Import-time warnings carried along for the reviewer (truncated). */
  warnings?: string[];
}

export interface ValidationIssue {
  severity: "error" | "warning";
  /** 1-based data row numbers in the file (header excluded) — may be empty. */
  rows: number[];
  code:
    | "non_numeric"
    | "missing_value"
    | "out_of_range"
    | "bounds"
    | "duplicate"
    | "unknown_place"
    | "unknown_indicator"
    | "bad_year"
    | "bad_breakdown"
    | "bad_week"
    | "bad_disease"
    | "excluded"
    | "inconsistent";
  message: string;
}

export interface ValidationReport {
  ok: boolean;
  errors: number;
  warnings: number;
  validRows: number;
  totalRows: number;
  issues: ValidationIssue[];
}

/** Column mapping chosen in the wizard (header names; null = not mapped). */
export interface IndicatorColumnMapping {
  kind: "indicator_values";
  place: string;
  /** Optional state column to scope LGA/ward matching. */
  stateColumn: string | null;
  placeCode: string | null;
  level: "nation" | "zone" | "state" | "lga" | "ward";
  year: string;
  /** Either a column of indicator codes, or one fixed catalogue indicator. */
  indicatorColumn: string | null;
  fixedIndicator: string | null;
  value: string;
  lower: string | null;
  upper: string | null;
  sex: string | null;
  ageGroup: string | null;
  residence: string | null;
  note: string | null;
  isEstimate: boolean;
  periodLabel: string | null;
}

export interface OutbreakColumnMapping {
  kind: "outbreak_reports";
  disease: string;
  state: string;
  year: string;
  week: string;
  suspected: string | null;
  confirmed: string | null;
  deaths: string | null;
}

export type ColumnMapping = IndicatorColumnMapping | OutbreakColumnMapping;

/** Wizard decision for one distinct place key that was not auto-matched. */
export interface PlaceDecision {
  /** Distinct key: `${level}|${stateId ?? ''}|${rawName}`. */
  key: string;
  rawName: string;
  /** Chosen unit, or null = exclude these rows. */
  geoUnitId: number | null;
}
