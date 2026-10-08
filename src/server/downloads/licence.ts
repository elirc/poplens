/**
 * Download gating (pure decisions + an orchestrator with injected deps, so
 * the ORDER is unit-tested without a database). Spec: "Downloads and API
 * access are offered only for datasets whose licence allows redistribution",
 * "Plan limits are enforced on the server", "Log every download".
 *
 * Order (binding, see agents/B3 brief):
 *   1. licence — every source behind the table must allow redistribution,
 *      else 403 naming the licence(s);
 *   2. account — a signed-in user is required (401);
 *   3. plan    — getUserPlan + consumeDailyQuota(userId, 'download', limit);
 *                free plan (limit 0) gets an upsell (402), an exhausted daily
 *                quota gets 429;
 *   4. (caller) log the download in download_log.
 * A refusal at any step leaves later steps untouched (no quota consumed).
 */

import type { PlanLimits } from "@/lib/limits";

export interface SourceLicence {
  id: number;
  publisher: string;
  title: string;
  licence: string;
  licenceUrl: string | null;
  allowsRedistribution: boolean;
}

export type GateRefusal = {
  ok: false;
  status: 400 | 401 | 402 | 403 | 404 | 429;
  code: "licence" | "auth" | "plan" | "quota" | "empty" | "invalid";
  message: string;
  /** Where the user can resolve it (sign in / upgrade). */
  actionUrl?: string;
};

export type GateResult = { ok: true; planCode: string; used: number; limit: number | null } | GateRefusal;

export const UPGRADE_URL = "/pricing";
export const SIGN_IN_URL = "/sign-in";

/** Step 1: licence. Distinct sources only; ALL must allow redistribution. */
export function checkLicences(sources: SourceLicence[]): { ok: true } | GateRefusal {
  const seen = new Set<number>();
  const blocked: SourceLicence[] = [];
  for (const s of sources) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    if (!s.allowsRedistribution) blocked.push(s);
  }
  if (blocked.length === 0) return { ok: true };
  const named = blocked.map((s) => `${s.publisher} ("${s.licence}")`).join("; ");
  return {
    ok: false,
    status: 403,
    code: "licence",
    message:
      `Download not available: this table includes data from ${named}, ` +
      `whose licence does not allow redistribution. You can still view these figures on PopLens with their source.`,
  };
}

/** Step 3: plan/quota decision from an already-consumed quota attempt. */
export function planDecision(
  plan: { planCode: string; limits: PlanLimits },
  quota: { allowed: boolean; used: number; limit: number | null },
): GateResult {
  if (quota.allowed) return { ok: true, planCode: plan.planCode, used: quota.used, limit: quota.limit };
  const limit = plan.limits.downloadsPerDay;
  if (limit === 0 || quota.limit === 0) {
    return {
      ok: false,
      status: 402,
      code: "plan",
      message: "Downloads are part of PopLens Pro. Upgrade to download CSV and Excel files with a ready-made citation.",
      actionUrl: UPGRADE_URL,
    };
  }
  return {
    ok: false,
    status: 429,
    code: "quota",
    message: `You have reached your plan's limit of ${quota.limit ?? limit} downloads today (Africa/Lagos time). The limit resets at midnight.`,
    actionUrl: UPGRADE_URL,
  };
}

export interface GateDeps {
  getUserPlan: (userId: string) => Promise<{ planCode: string; limits: PlanLimits }>;
  consumeDailyQuota: (
    userId: string,
    kind: "download",
    limit: number | null,
  ) => Promise<{ allowed: boolean; used: number; limit: number | null }>;
}

/** Steps 1–3 in order. Pure apart from the injected plan/quota deps. */
export async function evaluateDownloadGate(
  input: { sources: SourceLicence[]; userId: string | null },
  deps: GateDeps,
): Promise<GateResult> {
  const licence = checkLicences(input.sources);
  if (!licence.ok) return licence;
  if (!input.userId) {
    return {
      ok: false,
      status: 401,
      code: "auth",
      message: "Sign in to download data.",
      actionUrl: SIGN_IN_URL,
    };
  }
  const plan = await deps.getUserPlan(input.userId);
  const quota = await deps.consumeDailyQuota(input.userId, "download", plan.limits.downloadsPerDay);
  return planDecision(plan, quota);
}
