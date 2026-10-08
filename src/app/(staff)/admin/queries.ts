import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { DEFAULT_PLAN_LIMITS } from "@/lib/limits";
import { normaliseLimits } from "@/server/billing/plans";

/** Seats used vs allowed for an organisation (its active plan, else free). */
export async function orgSeatInfo(
  organizationId: string,
): Promise<{ seats: number; used: number; planCode: string } | null> {
  const [org] = await db
    .select({ id: schema.organization.id })
    .from(schema.organization)
    .where(eq(schema.organization.id, organizationId))
    .limit(1);
  if (!org) return null;
  const [sub] = await db
    .select({ planCode: schema.subscriptions.planCode, limits: schema.plans.limits })
    .from(schema.subscriptions)
    .innerJoin(schema.plans, eq(schema.plans.code, schema.subscriptions.planCode))
    .where(and(eq(schema.subscriptions.organizationId, organizationId), eq(schema.subscriptions.status, "active")))
    .orderBy(desc(schema.subscriptions.id))
    .limit(1);
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.member)
    .where(eq(schema.member.organizationId, organizationId));
  return {
    seats: sub ? normaliseLimits(sub.limits).seats : DEFAULT_PLAN_LIMITS.free.seats,
    used: n,
    planCode: sub?.planCode ?? "free",
  };
}

/** ILIKE pattern with wildcards escaped. */
export function likePattern(q: string): string {
  return `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
}
