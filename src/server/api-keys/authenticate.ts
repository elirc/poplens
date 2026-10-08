import { rateLimit, sweepIfDue } from "@/lib/rate-limit";
import {
  API_BURST_PER_MINUTE,
  API_BURST_WINDOW_MS,
  decideKeyAccess,
  extractApiKey,
  secondsUntilLagosMidnight,
} from "./keys";
import { consumeApiQuota, findApiKeyByPlaintext, resolveKeyPlan, touchApiKey, type ApiKeyRow } from "./store";

/**
 * The public-API gate. Order matters:
 *   1. key present + known (hash lookup)            → else 401
 *   2. not revoked, plan has API access             → else 403
 *   3. burst: 60 requests/minute per key (in-proc)  → else 429
 *   4. per-plan daily quota in api_usage (atomic)   → else 429 + Retry-After
 * Burst is checked before the daily counter so rejected bursts do not burn
 * daily quota.
 */

export type ApiAuthResult =
  | {
      ok: true;
      key: ApiKeyRow;
      planCode: string;
      /** Headers every successful response should carry. */
      headers: Record<string, string>;
    }
  | {
      ok: false;
      status: 401 | 403 | 429;
      code: string;
      message: string;
      headers: Record<string, string>;
    };

export async function authenticateApiRequest(req: Request): Promise<ApiAuthResult> {
  const presented = extractApiKey(req.headers);
  const key = presented ? await findApiKeyByPlaintext(presented) : null;
  const plan = key ? await resolveKeyPlan(key) : null;
  const decision = decideKeyAccess({
    found: key !== null,
    revoked: key?.revokedAt != null,
    apiAccess: plan?.limits.apiAccess ?? false,
    apiRequestsPerDay: plan?.limits.apiRequestsPerDay ?? 0,
  });
  if (!decision.ok) {
    const headers: Record<string, string> =
      decision.status === 401 ? { "WWW-Authenticate": 'Bearer realm="poplens-api"' } : {};
    return { ok: false, status: decision.status, code: decision.code, message: decision.message, headers };
  }
  const k = key!;

  sweepIfDue();
  const burst = rateLimit(`api-key:${k.id}`, API_BURST_PER_MINUTE, API_BURST_WINDOW_MS);
  if (!burst.allowed) {
    const retry = Math.max(1, Math.ceil((burst.resetAt - Date.now()) / 1000));
    return {
      ok: false,
      status: 429,
      code: "burst_limit_exceeded",
      message: `Too many requests: at most ${API_BURST_PER_MINUTE} per minute per key.`,
      headers: { "Retry-After": String(retry), "X-Burst-Limit": String(API_BURST_PER_MINUTE) },
    };
  }

  const quota = await consumeApiQuota(k.id, decision.dailyLimit);
  if (!quota.allowed) {
    return {
      ok: false,
      status: 429,
      code: "daily_quota_exceeded",
      message: `Daily request quota of ${quota.limit} reached for your plan. It resets at midnight Africa/Lagos.`,
      headers: {
        "Retry-After": String(secondsUntilLagosMidnight()),
        "X-RateLimit-Limit": String(quota.limit),
        "X-RateLimit-Remaining": "0",
      },
    };
  }

  void touchApiKey(k.id);
  const headers: Record<string, string> = {
    "X-Burst-Limit": String(API_BURST_PER_MINUTE),
    "X-Burst-Remaining": String(burst.remaining),
  };
  if (quota.limit !== null) {
    headers["X-RateLimit-Limit"] = String(quota.limit);
    headers["X-RateLimit-Remaining"] = String(Math.max(0, quota.limit - quota.used));
  }
  return { ok: true, key: k, planCode: plan!.planCode, headers };
}
