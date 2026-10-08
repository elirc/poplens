import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Pure API-key helpers (no database). Spec: keys are stored hashed.
 *  - Format: `pl_live_<32 lowercase hex>` (128 bits of randomness).
 *  - Storage: SHA-256 hex of the full plaintext key; the plaintext is shown
 *    to the owner exactly once at creation.
 *  - Display prefix: first 12 chars (`pl_live_ab12`) — never enough to use.
 */

export const API_KEY_PREFIX = "pl_live_";
export const API_KEY_RE = /^pl_live_[0-9a-f]{32}$/;
export const DISPLAY_PREFIX_LENGTH = 12;

/** Burst limit applied per key on top of the per-plan daily quota. */
export const API_BURST_PER_MINUTE = 60;
export const API_BURST_WINDOW_MS = 60_000;

export function generateApiKey(): { plaintext: string; hash: string; prefix: string } {
  const plaintext = `${API_KEY_PREFIX}${randomBytes(16).toString("hex")}`;
  return { plaintext, hash: hashApiKey(plaintext), prefix: displayPrefix(plaintext) };
}

export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext, "utf8").digest("hex");
}

export function displayPrefix(plaintext: string): string {
  return plaintext.slice(0, DISPLAY_PREFIX_LENGTH);
}

export function isWellFormedApiKey(value: string): boolean {
  return API_KEY_RE.test(value);
}

/** Constant-time check of a presented key against a stored hash. */
export function verifyApiKey(presented: string, storedHash: string): boolean {
  if (!isWellFormedApiKey(presented)) return false;
  const a = Buffer.from(hashApiKey(presented), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Pull the presented key from request headers:
 * `Authorization: Bearer <key>` (preferred) or `x-api-key: <key>`.
 * Returns null when neither header carries a value.
 */
export function extractApiKey(headers: Headers): string | null {
  const authz = headers.get("authorization");
  if (authz) {
    const m = /^Bearer\s+(\S+)\s*$/i.exec(authz);
    if (m) return m[1];
  }
  const x = headers.get("x-api-key");
  if (x && x.trim()) return x.trim();
  return null;
}

/** Seconds from `now` until the next Africa/Lagos midnight (UTC+1, no DST). */
export function secondsUntilLagosMidnight(now = new Date()): number {
  const lagosMs = now.getTime() + 60 * 60 * 1000;
  const dayMs = 24 * 60 * 60 * 1000;
  const next = (Math.floor(lagosMs / dayMs) + 1) * dayMs;
  return Math.max(1, Math.ceil((next - lagosMs) / 1000));
}

export type AccessDecision =
  | { ok: true; dailyLimit: number | null }
  | { ok: false; status: 401 | 403; code: string; message: string };

/**
 * Pure gate run after a key lookup and before any counting:
 * unknown key → 401; revoked → 403; plan without API access → 403.
 */
export function decideKeyAccess(input: {
  found: boolean;
  revoked: boolean;
  apiAccess: boolean;
  apiRequestsPerDay: number | null;
}): AccessDecision {
  if (!input.found) {
    return { ok: false, status: 401, code: "invalid_api_key", message: "Missing or invalid API key." };
  }
  if (input.revoked) {
    return { ok: false, status: 403, code: "api_key_revoked", message: "This API key has been revoked." };
  }
  if (!input.apiAccess || (input.apiRequestsPerDay !== null && input.apiRequestsPerDay <= 0)) {
    return {
      ok: false,
      status: 403,
      code: "plan_has_no_api_access",
      message: "Your plan does not include API access. Upgrade to Pro or Organisation.",
    };
  }
  return { ok: true, dailyLimit: input.apiRequestsPerDay };
}
