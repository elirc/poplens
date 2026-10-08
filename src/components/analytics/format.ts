/**
 * Display helpers shared by the analytics views (client-safe, pure).
 * Every value still goes through formatValue (→ "No data" for null).
 */

import { formatCI, formatValue, type IndicatorMeta } from "@/lib/format";
import type { ValueCell } from "./types";

export function fmt(v: number | null | undefined, meta: IndicatorMeta): string {
  return formatValue(v, meta);
}

/** "12.3 (10.1–14.6)" — value plus interval when the source gives one. */
export function fmtWithCI(cell: ValueCell | null, meta: IndicatorMeta): string {
  if (!cell) return formatValue(null, meta);
  const ci = formatCI(cell.lower, cell.upper, meta);
  return ci ? `${formatValue(cell.value, meta)} ${ci}` : formatValue(cell.value, meta);
}

/** Distinct source labels across cells, joined for a SourceLine. */
export function sourcesOf(cells: Array<ValueCell | null | undefined>): string {
  const names = [...new Set(cells.filter((c): c is ValueCell => !!c).map((c) => c.source))];
  return names.length ? names.join("; ") : "No published source";
}

/** "2018" or "2013–2023" across cells (null when none). */
export function yearsOf(cells: Array<ValueCell | null | undefined>): string | null {
  const ys = [...new Set(cells.filter((c): c is ValueCell => !!c).map((c) => c.year))].sort(
    (a, b) => a - b,
  );
  if (ys.length === 0) return null;
  return ys.length === 1 ? String(ys[0]) : `${ys[0]}–${ys[ys.length - 1]}`;
}

export function anyEstimate(cells: Array<ValueCell | null | undefined>): boolean {
  return cells.some((c) => c?.isEstimate);
}

/** Axis/legend unit suffix: "%" types already carry it in the value. */
export function unitSuffix(meta: IndicatorMeta): string {
  return meta.valueType === "percent" || !meta.unit ? "" : ` (${meta.unit})`;
}

/** Bars and count/percent axes start at zero (spec: honest baselines). */
export function zeroBased(meta: IndicatorMeta): boolean {
  return meta.valueType === "count" || meta.valueType === "percent";
}
