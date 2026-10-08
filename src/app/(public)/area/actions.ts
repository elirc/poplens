"use server";

import { requireUser, type CurrentUser } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";
import { AreaAnalysisError, analyzeArea } from "@/server/area/analysis";
import { consumeAreaQuota } from "@/server/area/quota";
import { validateAreaShape } from "./_lib/shape";
import type { AreaAnalysisResult, AreaQuotaView } from "./_lib/types";

export type AreaActionResult =
  | { ok: true; result: AreaAnalysisResult; quota: AreaQuotaView }
  | {
      ok: false;
      code: "auth" | "invalid" | "quota" | "busy" | "error";
      message: string;
      quota?: AreaQuotaView;
    };

/** Burst guard on top of the daily plan quota (Pro/org are unlimited per day). */
const BURST = { max: 10, windowMs: 60_000 } as const;

/**
 * Run an area analysis for the signed-in user.
 * Order: sign-in → shape validation (Zod + vertex/radius/area caps, so a bad
 * shape never burns quota) → burst limit → daily quota (free: 3/day via the
 * atomic consumeDailyQuota; Pro/org unlimited) → PostGIS analysis.
 */
export async function runAreaAnalysis(input: unknown): Promise<AreaActionResult> {
  let user: CurrentUser;
  try {
    user = await requireUser();
  } catch {
    return {
      ok: false,
      code: "auth",
      message: "Sign in to run an area analysis. Free accounts get 3 a day.",
    };
  }

  const v = validateAreaShape(input);
  if (!v.ok) return { ok: false, code: "invalid", message: v.error };

  if (!rateLimit(`area:${user.id}`, BURST.max, BURST.windowMs).allowed) {
    return { ok: false, code: "busy", message: "Too many analyses in a minute. Please wait a moment." };
  }

  const { allowed, quota } = await consumeAreaQuota(user.id);
  if (!allowed) {
    return { ok: false, code: "quota", message: quota.message, quota };
  }

  try {
    const result = await analyzeArea(v.shape);
    return { ok: true, result, quota };
  } catch (err) {
    if (err instanceof AreaAnalysisError) {
      return { ok: false, code: "invalid", message: err.message, quota };
    }
    console.error("[area] analysis failed", err);
    return {
      ok: false,
      code: "error",
      message: "The analysis could not be completed. Please try again.",
      quota,
    };
  }
}
