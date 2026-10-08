import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";

/**
 * Plan limits contract. Plans are rows in `plans`; their limits jsonb follows
 * PlanLimits. null = unlimited. ALL plan gating goes through this module so
 * limits are enforced consistently on the server.
 */
export interface PlanLimits {
  downloadsPerDay: number | null;
  areaAnalysesPerDay: number | null;
  apiRequestsPerDay: number | null;
  customReports: boolean;
  apiAccess: boolean;
  seats: number;
}

export const DEFAULT_PLAN_LIMITS: Record<string, PlanLimits> = {
  free: {
    downloadsPerDay: 0,
    areaAnalysesPerDay: 3,
    apiRequestsPerDay: 0,
    customReports: false,
    apiAccess: false,
    seats: 1,
  },
  pro: {
    downloadsPerDay: null,
    areaAnalysesPerDay: null,
    apiRequestsPerDay: 10_000,
    customReports: true,
    apiAccess: true,
    seats: 1,
  },
  org: {
    downloadsPerDay: null,
    areaAnalysesPerDay: null,
    apiRequestsPerDay: 50_000,
    customReports: true,
    apiAccess: true,
    seats: 10,
  },
};

/** Day key in Africa/Lagos time (UTC+1, no DST). */
export function lagosDay(now = new Date()): string {
  const lagos = new Date(now.getTime() + 60 * 60 * 1000);
  return lagos.toISOString().slice(0, 10);
}

/** Resolve the effective plan for a user (their own sub, else their org's, else free). */
export async function getUserPlan(
  userId: string,
): Promise<{ planCode: string; limits: PlanLimits }> {
  const rows = await db
    .select({
      planCode: schema.subscriptions.planCode,
      limits: schema.plans.limits,
    })
    .from(schema.subscriptions)
    .innerJoin(
      schema.plans,
      eq(schema.subscriptions.planCode, schema.plans.code),
    )
    .where(
      and(
        eq(schema.subscriptions.userId, userId),
        eq(schema.subscriptions.status, "active"),
      ),
    )
    .limit(1);
  if (rows.length > 0) {
    return {
      planCode: rows[0].planCode,
      limits: rows[0].limits as PlanLimits,
    };
  }
  // Organisation membership grants the org's plan.
  const orgRows = await db
    .select({
      planCode: schema.subscriptions.planCode,
      limits: schema.plans.limits,
    })
    .from(schema.member)
    .innerJoin(
      schema.subscriptions,
      eq(schema.subscriptions.organizationId, schema.member.organizationId),
    )
    .innerJoin(
      schema.plans,
      eq(schema.subscriptions.planCode, schema.plans.code),
    )
    .where(
      and(
        eq(schema.member.userId, userId),
        eq(schema.subscriptions.status, "active"),
      ),
    )
    .limit(1);
  if (orgRows.length > 0) {
    return {
      planCode: orgRows[0].planCode,
      limits: orgRows[0].limits as PlanLimits,
    };
  }
  return { planCode: "free", limits: DEFAULT_PLAN_LIMITS.free };
}

/**
 * Atomically consume one unit of a daily-limited quota.
 * Returns { allowed, used, limit }. limit null = unlimited (always allowed).
 */
export async function consumeDailyQuota(
  userId: string,
  kind: "area_analysis" | "download",
  limit: number | null,
): Promise<{ allowed: boolean; used: number; limit: number | null }> {
  if (limit === null) return { allowed: true, used: 0, limit: null };
  if (limit <= 0) return { allowed: false, used: 0, limit };
  const day = lagosDay();
  const res = await db
    .insert(schema.usageCounters)
    .values({ userId, kind, day, count: 1 })
    .onConflictDoUpdate({
      target: [
        schema.usageCounters.userId,
        schema.usageCounters.kind,
        schema.usageCounters.day,
      ],
      set: { count: sql`${schema.usageCounters.count} + 1` },
      // Only increment while under the limit — the WHERE makes it atomic.
      setWhere: sql`${schema.usageCounters.count} < ${limit}`,
    })
    .returning({ count: schema.usageCounters.count });
  if (res.length === 0) {
    return { allowed: false, used: limit, limit };
  }
  return { allowed: true, used: res[0].count, limit };
}
