import type { ChangeSample, ChangeSummary } from "./types";

/**
 * Pure diff of a staged set against the currently-published set of the same
 * series. Rows are keyed by their natural key; values compare with a small
 * epsilon, bounds included (a changed CI is a change).
 */

export interface DiffRow {
  key: string;
  /** Human label for samples. */
  label: string;
  value: number | null;
  lower?: number | null;
  upper?: number | null;
}

const EPS = 1e-9;

function sameNum(a: number | null | undefined, b: number | null | undefined): boolean {
  if (a == null || b == null) return a == null && b == null;
  return Math.abs(a - b) <= EPS * Math.max(1, Math.abs(a), Math.abs(b));
}

export function computeChangeSummary(
  staged: DiffRow[],
  published: DiffRow[],
  opts: {
    kind: ChangeSummary["kind"];
    comparedWithDatasetId: number | null;
    comparedWithVersion: number | null;
    maxSamples?: number;
    warnings?: string[];
  },
): ChangeSummary {
  const max = opts.maxSamples ?? 20;
  const pub = new Map(published.map((r) => [r.key, r]));
  const seen = new Set<string>();
  let added = 0;
  let changed = 0;
  let unchanged = 0;
  const addedS: ChangeSample[] = [];
  const changedS: ChangeSample[] = [];
  const removedS: ChangeSample[] = [];

  for (const r of staged) {
    seen.add(r.key);
    const old = pub.get(r.key);
    if (!old) {
      added++;
      if (addedS.length < max) addedS.push({ kind: "added", key: r.label, oldValue: null, newValue: r.value });
    } else if (
      !sameNum(old.value, r.value) ||
      !sameNum(old.lower, r.lower) ||
      !sameNum(old.upper, r.upper)
    ) {
      changed++;
      if (changedS.length < max)
        changedS.push({ kind: "changed", key: r.label, oldValue: old.value, newValue: r.value });
    } else {
      unchanged++;
    }
  }
  let removed = 0;
  for (const r of published) {
    if (seen.has(r.key)) continue;
    removed++;
    if (removedS.length < max) removedS.push({ kind: "removed", key: r.label, oldValue: r.value, newValue: null });
  }
  // Changes first: they are what a reviewer most needs to see.
  const samples = [...changedS, ...removedS, ...addedS].slice(0, max);
  return {
    kind: opts.kind,
    comparedWithDatasetId: opts.comparedWithDatasetId,
    comparedWithVersion: opts.comparedWithVersion,
    total: staged.length,
    added,
    changed,
    removed,
    unchanged,
    samples,
    ...(opts.warnings && opts.warnings.length > 0 ? { warnings: opts.warnings.slice(0, 50) } : {}),
  };
}

export function valueKey(r: {
  indicatorId: number;
  geoUnitId: number;
  year: number;
  sex: string;
  ageGroup: string;
  residence: string;
}): string {
  return `${r.indicatorId}|${r.geoUnitId}|${r.year}|${r.sex}|${r.ageGroup}|${r.residence}`;
}

export function valueLabel(r: {
  indicatorCode: string;
  placeCode: string;
  year: number;
  sex: string;
  ageGroup: string;
  residence: string;
}): string {
  const bd = [r.sex, r.ageGroup, r.residence].filter((x) => x !== "all");
  return `${r.indicatorCode} · ${r.placeCode} · ${r.year}${bd.length ? ` · ${bd.join("/")}` : ""}`;
}

export function outbreakKey(r: { disease: string; stateId: number; year: number; week: number }): string {
  return `${r.disease}|${r.stateId}|${r.year}|${r.week}`;
}

/** Narrow an unknown jsonb value into a ChangeSummary (tolerant of other writers). */
export function asChangeSummary(v: unknown): ChangeSummary | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.added !== "number" || typeof o.changed !== "number" || typeof o.removed !== "number")
    return null;
  return {
    kind: o.kind === "outbreak_reports" ? "outbreak_reports" : "indicator_values",
    comparedWithDatasetId: typeof o.comparedWithDatasetId === "number" ? o.comparedWithDatasetId : null,
    comparedWithVersion: typeof o.comparedWithVersion === "number" ? o.comparedWithVersion : null,
    total: typeof o.total === "number" ? o.total : o.added + o.changed + (Number(o.unchanged) || 0),
    added: o.added,
    changed: o.changed,
    removed: o.removed,
    unchanged: typeof o.unchanged === "number" ? o.unchanged : 0,
    samples: Array.isArray(o.samples) ? (o.samples as ChangeSample[]) : [],
    warnings: Array.isArray(o.warnings) ? (o.warnings as string[]) : undefined,
  };
}
