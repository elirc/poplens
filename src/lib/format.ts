/**
 * Display formatting contract. EVERY on-screen value goes through these
 * helpers so the engineering rules hold everywhere:
 *  - missing data renders as "No data", never 0;
 *  - values carry source, year and estimate marking;
 *  - counts are compacted (1.2m) for phone screens.
 */

export const NO_DATA = "No data";

export interface IndicatorMeta {
  unit: string;
  valueType: "count" | "rate" | "percent" | "ratio" | "index";
  decimals: number;
}

/** Format a bare number per indicator metadata. null/undefined → "No data". */
export function formatValue(
  value: number | null | undefined,
  meta: IndicatorMeta,
  opts: { compact?: boolean } = {},
): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return NO_DATA;
  }
  if (meta.valueType === "count" && (opts.compact ?? true)) {
    return compactNumber(value);
  }
  const fixed = value.toLocaleString("en-NG", {
    minimumFractionDigits: meta.decimals,
    maximumFractionDigits: meta.decimals,
  });
  return meta.valueType === "percent" ? `${fixed}%` : fixed;
}

/** 1234567 → "1.23m"; 12345 → "12.3k"; keeps small counts exact. */
export function compactNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${trim((value / 1_000_000_000).toFixed(2))}b`;
  if (abs >= 1_000_000) return `${trim((value / 1_000_000).toFixed(2))}m`;
  if (abs >= 10_000) return `${trim((value / 1_000).toFixed(1))}k`;
  return Math.round(value).toLocaleString("en-NG");
}

function trim(s: string): string {
  return s.replace(/\.?0+$/, "");
}

/** "±" confidence interval suffix, empty when the source gives no bounds. */
export function formatCI(
  lower: number | null | undefined,
  upper: number | null | undefined,
  meta: IndicatorMeta,
): string {
  if (lower == null || upper == null) return "";
  return `(${formatValue(lower, meta, { compact: false })}–${formatValue(upper, meta, { compact: false })})`;
}

/**
 * The standard source line shown under every value/chart:
 * "NDHS 2018 · estimate" / "GRID3 v2.1 · 2023 · estimate".
 */
export function sourceLine(parts: {
  sourceName: string;
  year?: number | string | null;
  isEstimate?: boolean;
}): string {
  const bits: string[] = [parts.sourceName];
  if (parts.year != null) bits.push(String(parts.year));
  if (parts.isEstimate) bits.push("estimate");
  return bits.join(" · ");
}

export function formatNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

/** Africa/Lagos date for updates pages and citations. */
export function formatLagosDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("en-NG", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
