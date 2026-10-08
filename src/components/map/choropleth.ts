/**
 * Pure choropleth helpers (no React / no maplibre runtime; unit-tested).
 * Colours come only from the colour-blind-safe ramps in src/lib/class-breaks.
 */

import type { ExpressionSpecification } from "maplibre-gl";
import {
  NO_DATA_COLOR,
  bucketFor,
  classBreaks,
  rampFor,
  type BreakMethod,
} from "@/lib/class-breaks";
import { formatValue, type IndicatorMeta } from "@/lib/format";

export interface ClassScheme {
  /** Ascending upper-bound thresholds (one per bucket). */
  breaks: number[];
  /** One colour per bucket, light → dark (low → high values). */
  colors: string[];
  min: number | null;
  max: number | null;
}

/** Pick `n` colours spread across the ramp (handles n < 3 after dedupe). */
export function pickColors(n: number): string[] {
  if (n <= 0) return [];
  if (n >= 3) return rampFor(n).slice(0, n);
  const ramp = rampFor(3);
  return n === 1 ? [ramp[1]] : [ramp[0], ramp[2]];
}

export function computeScheme(
  values: number[],
  classes: number,
  method: BreakMethod,
): ClassScheme {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length === 0) return { breaks: [], colors: [], min: null, max: null };
  const breaks = classBreaks(clean, classes, method);
  return {
    breaks,
    colors: pickColors(breaks.length),
    min: Math.min(...clean),
    max: Math.max(...clean),
  };
}

export function colorFor(value: number | null | undefined, scheme: ClassScheme): string {
  if (value == null || !Number.isFinite(value) || scheme.breaks.length === 0) {
    return NO_DATA_COLOR;
  }
  return scheme.colors[bucketFor(value, scheme.breaks)] ?? NO_DATA_COLOR;
}

/**
 * MapLibre fill-color expression joining values onto features by the
 * `id` property (geo_units.id). Ids are grouped per bucket so the expression
 * stays compact even for ~9k wards; everything else gets NO_DATA_COLOR.
 */
export function fillColorExpression(
  values: Array<{ id: number; value: number }>,
  scheme: ClassScheme,
  idProperty = "id",
): ExpressionSpecification | string {
  if (scheme.breaks.length === 0 || values.length === 0) return NO_DATA_COLOR;
  const groups: number[][] = scheme.colors.map(() => []);
  const seen = new Set<number>();
  for (const v of values) {
    if (!Number.isFinite(v.value) || seen.has(v.id)) continue;
    seen.add(v.id);
    groups[bucketFor(v.value, scheme.breaks)]?.push(v.id);
  }
  const branches: unknown[] = [];
  groups.forEach((ids, i) => {
    if (ids.length > 0) branches.push(ids, scheme.colors[i]);
  });
  if (branches.length === 0) return NO_DATA_COLOR;
  return [
    "match",
    ["to-number", ["get", idProperty], -1],
    ...branches,
    NO_DATA_COLOR,
  ] as unknown as ExpressionSpecification;
}

export interface LegendItem {
  color: string;
  label: string;
}

/**
 * Legend rows: bucket i covers (breaks[i-1], breaks[i]]; the first bucket
 * starts at the observed minimum. Always ends with a "No data" row.
 */
export function legendItems(scheme: ClassScheme, meta: IndicatorMeta): LegendItem[] {
  const fmt = (v: number) => formatValue(v, meta, { compact: true });
  const items: LegendItem[] = scheme.breaks.map((b, i) => {
    const lo = i === 0 ? scheme.min : scheme.breaks[i - 1];
    const label = lo == null || lo === b ? fmt(b) : `${fmt(lo)} – ${fmt(b)}`;
    return { color: scheme.colors[i], label };
  });
  items.push({ color: NO_DATA_COLOR, label: "No data" });
  return items;
}
