/**
 * Pure outbreak shaping (client-safe; unit-tested). Case counts are COUNTS
 * as reported — nothing here derives rates or estimates. A week or state with
 * no report stays null ("No data"/gap), never zero; sums only add figures
 * that were actually reported.
 */

import type { OutbreakCell } from "./types";

export interface EpiWeek {
  week: number;
  suspected: number | null;
  confirmed: number | null;
  deaths: number | null;
  /** Suspected minus confirmed, for stacking (null when nothing reported). */
  suspectedNotConfirmed: number | null;
  reportingStates: number;
}

/** Sum of the non-null figures, or null when none were reported. */
export function sumReported(values: Array<number | null | undefined>): number | null {
  let total = 0;
  let any = false;
  for (const v of values) {
    if (v == null || !Number.isFinite(v)) continue;
    total += v;
    any = true;
  }
  return any ? total : null;
}

/** Selected week: the requested one when in 1..lastWeek, else the latest reported week. */
export function pickWeek(requested: number | null, lastWeek: number | null): number | null {
  if (lastWeek == null) return null;
  if (requested != null && requested >= 1 && requested <= lastWeek) return requested;
  return lastWeek;
}

/** National epi curve: one entry per week 1..lastWeek (gaps where nothing was reported). */
export function epiCurve(rows: OutbreakCell[], lastWeek: number | null): EpiWeek[] {
  if (lastWeek == null) return [];
  const byWeek = new Map<number, OutbreakCell[]>();
  for (const r of rows) {
    const list = byWeek.get(r.week) ?? [];
    list.push(r);
    byWeek.set(r.week, list);
  }
  const out: EpiWeek[] = [];
  for (let w = 1; w <= lastWeek; w++) {
    const list = byWeek.get(w) ?? [];
    const suspected = sumReported(list.map((r) => r.suspected));
    const confirmed = sumReported(list.map((r) => r.confirmed));
    const deaths = sumReported(list.map((r) => r.deaths));
    out.push({
      week: w,
      suspected,
      confirmed,
      deaths,
      suspectedNotConfirmed:
        suspected == null ? null : Math.max(0, suspected - (confirmed ?? 0)),
      reportingStates: new Set(list.map((r) => r.stateId)).size,
    });
  }
  return out;
}

/** The reported rows for one week, largest suspected count first. */
export function statesForWeek(rows: OutbreakCell[], week: number | null): OutbreakCell[] {
  if (week == null) return [];
  return rows
    .filter((r) => r.week === week)
    .sort((a, b) => (b.suspected ?? -1) - (a.suspected ?? -1) || a.name.localeCompare(b.name));
}

export interface StateToDate {
  stateId: number;
  code: string;
  name: string;
  suspected: number | null;
  confirmed: number | null;
  deaths: number | null;
  weeksReported: number;
}

/** Per-state totals of reported figures for weeks 1..throughWeek. */
export function yearToDate(rows: OutbreakCell[], throughWeek: number | null): StateToDate[] {
  if (throughWeek == null) return [];
  const by = new Map<number, OutbreakCell[]>();
  for (const r of rows) {
    if (r.week > throughWeek) continue;
    const list = by.get(r.stateId) ?? [];
    list.push(r);
    by.set(r.stateId, list);
  }
  return [...by.values()]
    .map((list) => ({
      stateId: list[0]!.stateId,
      code: list[0]!.code,
      name: list[0]!.name,
      suspected: sumReported(list.map((r) => r.suspected)),
      confirmed: sumReported(list.map((r) => r.confirmed)),
      deaths: sumReported(list.map((r) => r.deaths)),
      weeksReported: new Set(list.map((r) => r.week)).size,
    }))
    .sort((a, b) => (b.suspected ?? -1) - (a.suspected ?? -1) || a.name.localeCompare(b.name));
}
