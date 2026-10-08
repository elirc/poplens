/**
 * Pure shaping logic behind the analytics loaders (unit-tested, no DB).
 * Missing data is always an ABSENT entry here — never a zero.
 */

import { computeRanks } from "@/server/indicators/ranks";
import type {
  NoDataPlace,
  RankingRow,
  ScatterPoint,
  ValueCell,
} from "@/components/analytics/types";

/** Display label for a value's source; synthetic data is always flagged. */
export function sourceLabel(publisher: string, isSynthetic: boolean): string {
  return isSynthetic ? `${publisher} — SYNTHETIC demo data` : publisher;
}

/** Minimal published-row shape (structural subset of PublicValue). */
export interface PublishedRow {
  value: number;
  lower: number | null;
  upper: number | null;
  year: number;
  periodLabel: string | null;
  isEstimate: boolean;
  geoUnitId: number;
  datasetId: number;
  isSynthetic: boolean;
  sourceId: number;
  sourcePublisher: string;
}

export function toCell(r: PublishedRow): ValueCell {
  return {
    value: Number(r.value),
    lower: r.lower == null ? null : Number(r.lower),
    upper: r.upper == null ? null : Number(r.upper),
    year: Number(r.year),
    periodLabel: r.periodLabel ?? null,
    isEstimate: Boolean(r.isEstimate),
    sourceId: Number(r.sourceId),
    source: sourceLabel(r.sourcePublisher, Boolean(r.isSynthetic)),
  };
}

/**
 * Requested year when it is available, otherwise the latest available one.
 * `fallback` is true when a requested year had to be replaced.
 */
export function resolveYear(
  requested: number | null,
  available: number[],
): { year: number | null; fallback: boolean } {
  if (available.length === 0) return { year: null, fallback: requested != null };
  if (requested != null && available.includes(requested)) return { year: requested, fallback: false };
  return { year: Math.max(...available), fallback: requested != null };
}

export type CompareYearChoice =
  | { mode: "common"; year: number }
  | { mode: "latest-each"; years: Map<string, number> }
  | { mode: "none" };

/**
 * Compare rule: use the latest year that EVERY place with any data shares;
 * when they share none, each place shows its own latest year (labelled).
 * Places with no data at all do not block a common year — they show "No data".
 */
export function pickCompareYear(yearsByPlace: Map<string, number[]>): CompareYearChoice {
  const withData = [...yearsByPlace.entries()].filter(([, ys]) => ys.length > 0);
  if (withData.length === 0) return { mode: "none" };
  let common = new Set(withData[0]![1]);
  for (const [, ys] of withData.slice(1)) {
    const s = new Set(ys);
    common = new Set([...common].filter((y) => s.has(y)));
  }
  if (common.size > 0) return { mode: "common", year: Math.max(...common) };
  return {
    mode: "latest-each",
    years: new Map(withData.map(([code, ys]) => [code, Math.max(...ys)])),
  };
}

/** Years present in both lists, ascending. */
export function commonYears(a: number[], b: number[]): number[] {
  const s = new Set(b);
  return [...new Set(a)].filter((y) => s.has(y)).sort((x, y) => x - y);
}

/**
 * Collapse trend rows to one point per (year, source): when several
 * published datasets from the same source cover a year, the highest
 * datasetId (most recent load) wins. Different sources in the same year are
 * kept apart — the chart must not merge them.
 */
export function dedupeTrendRows<T extends PublishedRow>(rows: T[]): T[] {
  const best = new Map<string, T>();
  for (const r of rows) {
    const k = `${r.geoUnitId}:${r.year}:${r.sourceId}`;
    const prev = best.get(k);
    if (!prev || r.datasetId > prev.datasetId) best.set(k, r);
  }
  return [...best.values()].sort(
    (a, b) => a.geoUnitId - b.geoUnitId || a.year - b.year || a.sourceId - b.sourceId,
  );
}

/* ── rankings ────────────────────────────────────────────────────────── */

export interface RankPlace {
  id: number;
  code: string;
  name: string;
  parent: string | null;
}

/**
 * Rank places with data (direction from higherIsBetter via computeRanks);
 * places without data are listed separately, alphabetically, never ranked.
 */
export function buildRankings(
  places: RankPlace[],
  values: Array<PublishedRow>,
  higherIsBetter: boolean | null,
): { rows: RankingRow[]; noData: NoDataPlace[] } {
  const placeById = new Map(places.map((p) => [p.id, p]));
  const valueById = new Map<number, PublishedRow>();
  for (const v of values) {
    if (!placeById.has(v.geoUnitId) || !Number.isFinite(Number(v.value))) continue;
    valueById.set(v.geoUnitId, v);
  }
  const ranked = computeRanks(
    [...valueById.values()].map((v) => ({ geoUnitId: v.geoUnitId, value: Number(v.value) })),
    higherIsBetter,
  );
  const rows: RankingRow[] = ranked.map((r) => {
    const p = placeById.get(r.geoUnitId)!;
    return {
      rank: r.rank,
      outOf: r.outOf,
      code: p.code,
      name: p.name,
      parent: p.parent,
      cell: toCell(valueById.get(r.geoUnitId)!),
    };
  });
  // Stable order within ties: by name.
  rows.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  const noData = places
    .filter((p) => !valueById.has(p.id))
    .map((p) => ({ code: p.code, name: p.name, parent: p.parent }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { rows, noData };
}

/* ── relationships ───────────────────────────────────────────────────── */

export interface PairPlace {
  id: number;
  code: string;
  name: string;
}

/** Pair x/y values by place; only places with BOTH values become points. */
export function pairValues(
  places: PairPlace[],
  xs: PublishedRow[],
  ys: PublishedRow[],
): {
  points: ScatterPoint[];
  missing: Array<{ code: string; name: string; lacks: "x" | "y" | "both" }>;
} {
  const xm = new Map(xs.filter((r) => Number.isFinite(Number(r.value))).map((r) => [r.geoUnitId, r]));
  const ym = new Map(ys.filter((r) => Number.isFinite(Number(r.value))).map((r) => [r.geoUnitId, r]));
  const points: ScatterPoint[] = [];
  const missing: Array<{ code: string; name: string; lacks: "x" | "y" | "both" }> = [];
  for (const p of places) {
    const x = xm.get(p.id);
    const y = ym.get(p.id);
    if (x && y) {
      points.push({
        code: p.code,
        name: p.name,
        x: Number(x.value),
        y: Number(y.value),
        xSource: sourceLabel(x.sourcePublisher, x.isSynthetic),
        ySource: sourceLabel(y.sourcePublisher, y.isSynthetic),
        xEstimate: Boolean(x.isEstimate),
        yEstimate: Boolean(y.isEstimate),
      });
    } else {
      missing.push({ code: p.code, name: p.name, lacks: !x && !y ? "both" : !x ? "x" : "y" });
    }
  }
  points.sort((a, b) => a.name.localeCompare(b.name));
  missing.sort((a, b) => a.name.localeCompare(b.name));
  return { points, missing };
}
