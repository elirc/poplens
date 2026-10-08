import type {
  ResolvedOutbreak,
  ResolvedValue,
  ValidationIssue,
  ValidationReport,
} from "./types";
import { outbreakKey, valueKey } from "./diff";

/**
 * Upload validation (spec: "validated for range, duplicates and unknown
 * places before it becomes a draft"). Pure: callers resolve places and
 * indicators first and pass the lookups in. Errors block the draft;
 * warnings are listed. Missing values are SKIPPED (never stored as 0).
 */

export type ValueType = "count" | "rate" | "percent" | "ratio" | "index";

const MISSING = new Set(["", "na", "n/a", "-", "--", "..", "nodata", "no data", "null", "nan"]);

export type ParsedNumber = { kind: "empty" } | { kind: "num"; n: number } | { kind: "bad" };

export function parseNumber(raw: string | null | undefined): ParsedNumber {
  const s = (raw ?? "").trim();
  if (MISSING.has(s.toLowerCase())) return { kind: "empty" };
  const cleaned = s.replace(/%$/, "").replace(/[,\s _]/g, "");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(cleaned)) return { kind: "bad" };
  const n = Number(cleaned);
  return Number.isFinite(n) ? { kind: "num", n } : { kind: "bad" };
}

export function parseSex(raw: string): "all" | "male" | "female" | null {
  const s = raw.trim().toLowerCase();
  if (["", "all", "total", "both", "both sexes", "t", "btsx"].includes(s)) return "all";
  if (["m", "male", "males", "men", "boys"].includes(s)) return "male";
  if (["f", "female", "females", "women", "girls"].includes(s)) return "female";
  return null;
}

export function parseResidence(raw: string): "all" | "urban" | "rural" | null {
  const s = raw.trim().toLowerCase();
  if (["", "all", "total", "t"].includes(s)) return "all";
  if (["u", "urban"].includes(s)) return "urban";
  if (["r", "rural"].includes(s)) return "rural";
  return null;
}

export function parseAgeGroup(raw: string): string {
  const s = raw.trim();
  return s === "" || /^(all|total)$/i.test(s) ? "all" : s;
}

export function parseDisease(raw: string): ResolvedOutbreak["disease"] | null {
  const s = raw.trim().toLowerCase().replace(/[^a-z]+/g, " ").trim();
  if (s === "cholera") return "cholera";
  if (s === "lassa" || s === "lassa fever" || s === "lassa fever lf") return "lassa_fever";
  if (s === "meningitis" || s === "csm" || s === "cerebrospinal meningitis") return "meningitis";
  if (s === "measles") return "measles";
  return null;
}

export function parseYear(raw: string): number | null {
  const m = raw.trim().match(/^(\d{4})/);
  if (!m) return null;
  const y = Number(m[1]);
  const max = new Date().getFullYear() + 1;
  return y >= 1950 && y <= max ? y : null;
}

/** Range sanity by value type. Returns an error message or null. */
export function rangeError(v: number, t: ValueType): string | null {
  switch (t) {
    case "percent":
      return v < 0 || v > 100 ? "percent values must be between 0 and 100" : null;
    case "count":
    case "rate":
    case "ratio":
      return v < 0 ? `${t} values cannot be negative` : null;
    case "index":
      return null;
  }
}

class Issues {
  private map = new Map<string, ValidationIssue>();
  add(severity: ValidationIssue["severity"], code: ValidationIssue["code"], message: string, row?: number) {
    const k = `${severity}|${code}|${message}`;
    let it = this.map.get(k);
    if (!it) {
      it = { severity, code, message, rows: [] };
      this.map.set(k, it);
    }
    if (row !== undefined && it.rows.length < 200) it.rows.push(row);
  }
  list(): ValidationIssue[] {
    return [...this.map.values()].sort((a, b) =>
      a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1,
    );
  }
}

function report(issues: Issues, validRows: number, totalRows: number): ValidationReport {
  const list = issues.list();
  const errors = list.filter((i) => i.severity === "error").length;
  return {
    ok: errors === 0,
    errors,
    warnings: list.length - errors,
    validRows,
    totalRows,
    issues: list,
  };
}

/* ── Indicator values ────────────────────────────────────────────────────── */

export interface PreparedIndicatorRow {
  /** 1-based data row number. */
  row: number;
  placeName: string;
  /** Resolved place; null = unresolved. */
  geoUnitId: number | null;
  /** True when the reviewer chose to exclude this place's rows. */
  excluded: boolean;
  indicatorCode: string;
  yearRaw: string;
  valueRaw: string;
  lowerRaw: string;
  upperRaw: string;
  sexRaw: string;
  ageRaw: string;
  residenceRaw: string;
  note: string | null;
  periodLabel: string | null;
  isEstimate: boolean;
}

export function validateIndicatorRows(
  rows: PreparedIndicatorRow[],
  indicators: Map<string, { id: number; valueType: ValueType }>,
): { report: ValidationReport; values: ResolvedValue[] } {
  const issues = new Issues();
  const values: ResolvedValue[] = [];
  const seen = new Map<string, number>();
  const dupKeys = new Set<string>();
  let excluded = 0;

  for (const r of rows) {
    if (r.excluded) {
      excluded++;
      continue;
    }
    let bad = false;
    const ind = indicators.get(r.indicatorCode.trim().toLowerCase()) ?? indicators.get(r.indicatorCode.trim());
    if (!ind) {
      issues.add("error", "unknown_indicator", `Unknown indicator code "${r.indicatorCode || "(blank)"}"`, r.row);
      bad = true;
    }
    if (r.geoUnitId == null) {
      issues.add("error", "unknown_place", `Unknown place "${r.placeName || "(blank)"}"`, r.row);
      bad = true;
    }
    const year = parseYear(r.yearRaw);
    if (year == null) {
      issues.add("error", "bad_year", `Year "${r.yearRaw}" is not a valid year (1950–next year)`, r.row);
      bad = true;
    }
    const sex = parseSex(r.sexRaw);
    const residence = parseResidence(r.residenceRaw);
    if (!sex) {
      issues.add("error", "bad_breakdown", `Sex "${r.sexRaw}" must be all, male or female`, r.row);
      bad = true;
    }
    if (!residence) {
      issues.add("error", "bad_breakdown", `Residence "${r.residenceRaw}" must be all, urban or rural`, r.row);
      bad = true;
    }
    const ageGroup = parseAgeGroup(r.ageRaw);

    const v = parseNumber(r.valueRaw);
    if (v.kind === "empty") {
      issues.add("warning", "missing_value", "Rows with no value are skipped (shown as No data, never 0)", r.row);
      continue;
    }
    if (v.kind === "bad") {
      issues.add("error", "non_numeric", "Value is not a number", r.row);
      continue;
    }
    const lo = parseNumber(r.lowerRaw);
    const up = parseNumber(r.upperRaw);
    if (lo.kind === "bad" || up.kind === "bad") {
      issues.add("error", "non_numeric", "Lower/upper bound is not a number", r.row);
      bad = true;
    }
    const lower = lo.kind === "num" ? lo.n : null;
    const upper = up.kind === "num" ? up.n : null;
    if (ind) {
      const re = rangeError(v.n, ind.valueType);
      if (re) {
        issues.add("error", "out_of_range", `${r.indicatorCode}: ${re}`, r.row);
        bad = true;
      }
      if (ind.valueType === "count" && !Number.isInteger(v.n)) {
        issues.add("warning", "out_of_range", `${r.indicatorCode}: count is not a whole number`, r.row);
      }
    }
    if ((lower != null && lower > v.n) || (upper != null && upper < v.n) || (lower != null && upper != null && lower > upper)) {
      issues.add("error", "bounds", "Value must lie between its lower and upper bound", r.row);
      bad = true;
    }
    if (bad || !ind || r.geoUnitId == null || year == null || !sex || !residence) continue;

    const resolved: ResolvedValue = {
      indicatorId: ind.id,
      indicatorCode: r.indicatorCode.trim(),
      geoUnitId: r.geoUnitId,
      year,
      periodLabel: r.periodLabel,
      value: v.n,
      lower,
      upper,
      sex,
      ageGroup,
      residence,
      isEstimate: r.isEstimate,
      note: r.note,
    };
    const k = valueKey(resolved);
    const first = seen.get(k);
    if (first !== undefined) {
      issues.add(
        "error",
        "duplicate",
        "Duplicate rows for the same place, indicator, year and breakdown",
        first,
      );
      issues.add("error", "duplicate", "Duplicate rows for the same place, indicator, year and breakdown", r.row);
      dupKeys.add(k);
      continue;
    }
    seen.set(k, r.row);
    values.push(resolved);
  }
  if (excluded > 0) {
    issues.add("warning", "excluded", `${excluded} row(s) excluded during place review`);
  }
  // Duplicates invalidate the first occurrence too.
  const finalValues = values.filter((v) => !dupKeys.has(valueKey(v)));
  return { report: report(issues, finalValues.length, rows.length), values: finalValues };
}

/* ── Outbreak lines (NCDC template) ──────────────────────────────────────── */

export interface PreparedOutbreakRow {
  row: number;
  diseaseRaw: string;
  stateName: string;
  stateId: number | null;
  excluded: boolean;
  yearRaw: string;
  weekRaw: string;
  suspectedRaw: string;
  confirmedRaw: string;
  deathsRaw: string;
}

export function validateOutbreakRows(
  rows: PreparedOutbreakRow[],
): { report: ValidationReport; values: ResolvedOutbreak[] } {
  const issues = new Issues();
  const out: ResolvedOutbreak[] = [];
  const seen = new Map<string, number>();
  const dup = new Set<string>();
  let excluded = 0;

  for (const r of rows) {
    if (r.excluded) {
      excluded++;
      continue;
    }
    let bad = false;
    const disease = parseDisease(r.diseaseRaw);
    if (!disease) {
      issues.add("error", "bad_disease", `Disease "${r.diseaseRaw}" must be cholera, lassa fever, meningitis or measles`, r.row);
      bad = true;
    }
    if (r.stateId == null) {
      issues.add("error", "unknown_place", `Unknown state "${r.stateName || "(blank)"}"`, r.row);
      bad = true;
    }
    const year = parseYear(r.yearRaw);
    if (year == null) {
      issues.add("error", "bad_year", `Year "${r.yearRaw}" is not valid`, r.row);
      bad = true;
    }
    const w = parseNumber(r.weekRaw);
    const week = w.kind === "num" && Number.isInteger(w.n) && w.n >= 1 && w.n <= 53 ? w.n : null;
    if (week == null) {
      issues.add("error", "bad_week", "Epi week must be a whole number from 1 to 53", r.row);
      bad = true;
    }
    const counts: Array<number | null> = [];
    for (const [label, raw] of [
      ["suspected", r.suspectedRaw],
      ["confirmed", r.confirmedRaw],
      ["deaths", r.deathsRaw],
    ] as const) {
      const p = parseNumber(raw);
      if (p.kind === "empty") counts.push(null);
      else if (p.kind === "bad" || !Number.isInteger(p.n) || p.n < 0) {
        issues.add("error", "non_numeric", `${label} must be a whole number ≥ 0`, r.row);
        bad = true;
        counts.push(null);
      } else counts.push(p.n);
    }
    const [suspected, confirmed, deaths] = counts;
    if (suspected == null && confirmed == null && deaths == null) {
      issues.add("warning", "missing_value", "Rows with no counts are skipped (No data, never 0)", r.row);
      continue;
    }
    if (suspected != null && confirmed != null && confirmed > suspected) {
      issues.add("warning", "inconsistent", "Confirmed cases exceed suspected cases", r.row);
    }
    if (bad || !disease || r.stateId == null || year == null || week == null) continue;
    const line: ResolvedOutbreak = { disease, stateId: r.stateId, year, week, suspected, confirmed, deaths };
    const k = outbreakKey(line);
    const first = seen.get(k);
    if (first !== undefined) {
      issues.add("error", "duplicate", "Duplicate rows for the same disease, state, year and week", first);
      issues.add("error", "duplicate", "Duplicate rows for the same disease, state, year and week", r.row);
      dup.add(k);
      continue;
    }
    seen.set(k, r.row);
    out.push(line);
  }
  if (excluded > 0) issues.add("warning", "excluded", `${excluded} row(s) excluded during place review`);
  const values = out.filter((o) => !dup.has(outbreakKey(o)));
  return { report: report(issues, values.length, rows.length), values };
}
