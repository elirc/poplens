import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { DEFAULT_PLAN_LIMITS, type PlanLimits } from "@/lib/limits";

/**
 * Plan rows (prices are placeholders, in kobo). Limits follow the
 * PlanLimits contract in src/lib/limits.ts; this Zod schema validates the
 * admin plans editor and normalises rows read back from jsonb.
 */

const nullableCount = z.number().int().min(0).nullable();

export const planLimitsSchema = z.object({
  downloadsPerDay: nullableCount,
  areaAnalysesPerDay: nullableCount,
  apiRequestsPerDay: nullableCount,
  customReports: z.boolean(),
  apiAccess: z.boolean(),
  seats: z.number().int().min(1).max(10_000),
}) satisfies z.ZodType<PlanLimits>;

export interface PlanRow {
  code: string;
  name: string;
  priceKoboMonthly: number;
  limits: PlanLimits;
  paystackPlanCode: string | null;
}

/** Read a jsonb limits value defensively, falling back to the free limits. */
export function normaliseLimits(raw: unknown): PlanLimits {
  const parsed = planLimitsSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  return { ...DEFAULT_PLAN_LIMITS.free, ...(typeof raw === "object" && raw ? (raw as Partial<PlanLimits>) : {}) };
}

export async function listPlans(): Promise<PlanRow[]> {
  const rows = await db.select().from(schema.plans).orderBy(asc(schema.plans.priceKoboMonthly));
  return rows.map((r) => ({
    code: r.code,
    name: r.name,
    priceKoboMonthly: r.priceKoboMonthly,
    limits: normaliseLimits(r.limits),
    paystackPlanCode: r.paystackPlanCode,
  }));
}

export async function getPlan(code: string): Promise<PlanRow | null> {
  const [r] = await db.select().from(schema.plans).where(eq(schema.plans.code, code)).limit(1);
  if (!r) return null;
  return {
    code: r.code,
    name: r.name,
    priceKoboMonthly: r.priceKoboMonthly,
    limits: normaliseLimits(r.limits),
    paystackPlanCode: r.paystackPlanCode,
  };
}

/** Map a payment's plan code (ours, or Paystack's PLN_… code) to our plan. */
export async function resolvePlanCode(code: string | undefined | null): Promise<PlanRow | null> {
  if (!code) return null;
  const direct = await getPlan(code);
  if (direct) return direct;
  const [r] = await db
    .select({ code: schema.plans.code })
    .from(schema.plans)
    .where(eq(schema.plans.paystackPlanCode, code))
    .limit(1);
  return r ? getPlan(r.code) : null;
}

/** Human-readable limit, for pricing/billing pages. */
export function describeLimit(n: number | null, unit: string): string {
  if (n === null) return `Unlimited ${unit}`;
  if (n === 0) return `No ${unit}`;
  return `${n.toLocaleString("en-NG")} ${unit} a day`;
}
