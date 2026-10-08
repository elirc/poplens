import { formatValue, type IndicatorMeta } from "@/lib/format";

/** Outbreak figures are plain counts of reported cases — never rates. */
export const CASES: IndicatorMeta = { unit: "cases", valueType: "count", decimals: 0 };

/** Exact count ("1,234"), or "No data" when nothing was reported. */
export function cases(v: number | null | undefined): string {
  return formatValue(v, CASES, { compact: false });
}
