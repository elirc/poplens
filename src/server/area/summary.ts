/** Pure helpers for area-analysis results (unit-tested; no db). */

import type {
  CareLevelKey,
  FacilityCount,
  FacilitySummary,
} from "@/app/(public)/area/_lib/types";

export type { CareLevelKey, FacilityCount, FacilitySummary };

/** Group facility counts by type (desc, then name) and by care level. */
export function summariseFacilities(rows: FacilityCount[]): FacilitySummary {
  const byTypeMap = new Map<string, number>();
  const byCareLevel: Record<CareLevelKey, number> = { primary: 0, secondary: 0, tertiary: 0 };
  let total = 0;
  for (const r of rows) {
    byTypeMap.set(r.type, (byTypeMap.get(r.type) ?? 0) + r.count);
    byCareLevel[r.careLevel] += r.count;
    total += r.count;
  }
  const byType = [...byTypeMap.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
  return { total, byType, byCareLevel, rows };
}

/** People per facility; null (rendered "No data") when population is missing or there are no facilities. */
export function peoplePerFacility(population: number | null, facilities: number): number | null {
  if (population == null || !Number.isFinite(population) || facilities <= 0) return null;
  return population / facilities;
}

/** "2 of 3 free analyses left today" style quota summary. */
export interface AreaQuotaState {
  planCode: string;
  /** null = unlimited. */
  limit: number | null;
  used: number;
  remaining: number | null;
}

export function quotaState(planCode: string, limit: number | null, used: number): AreaQuotaState {
  if (limit === null) return { planCode, limit: null, used, remaining: null };
  return { planCode, limit, used, remaining: Math.max(0, limit - used) };
}

export function quotaMessage(q: AreaQuotaState): string {
  if (q.limit === null) return "Unlimited area analyses on your plan.";
  if (q.limit <= 0) return "Area analysis is not included in your plan.";
  const plural = q.limit === 1 ? "analysis" : "analyses";
  if (q.remaining === 0) {
    return `You have used all ${q.limit} free ${plural} for today. The limit resets at midnight (Lagos time).`;
  }
  return `${q.remaining} of ${q.limit} free ${plural} left today.`;
}
