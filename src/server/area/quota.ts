import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { consumeDailyQuota, getUserPlan, lagosDay } from "@/lib/limits";
import { quotaMessage, quotaState, type AreaQuotaState } from "./summary";

/**
 * Area-analysis quota (spec: free accounts get three a day; Pro/org
 * unlimited). Consumption goes through the shared atomic
 * `consumeDailyQuota` contract; this module only adds a read-only view of
 * today's usage for the "2 of 3 left" line.
 */

export type { AreaQuotaState };

export async function getAreaQuota(userId: string): Promise<AreaQuotaState & { message: string }> {
  const plan = await getUserPlan(userId);
  const limit = plan.limits.areaAnalysesPerDay;
  const rows = await db
    .select({ count: schema.usageCounters.count })
    .from(schema.usageCounters)
    .where(
      and(
        eq(schema.usageCounters.userId, userId),
        eq(schema.usageCounters.kind, "area_analysis"),
        eq(schema.usageCounters.day, lagosDay()),
      ),
    )
    .limit(1);
  const q = quotaState(plan.planCode, limit, rows[0]?.count ?? 0);
  return { ...q, message: quotaMessage(q) };
}

/** Consume one analysis. `allowed: false` when today's free quota is used up. */
export async function consumeAreaQuota(
  userId: string,
): Promise<{ allowed: boolean; quota: AreaQuotaState & { message: string } }> {
  const plan = await getUserPlan(userId);
  const limit = plan.limits.areaAnalysesPerDay;
  const r = await consumeDailyQuota(userId, "area_analysis", limit);
  const q = quotaState(plan.planCode, r.limit, r.used);
  return { allowed: r.allowed, quota: { ...q, message: quotaMessage(q) } };
}
