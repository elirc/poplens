/**
 * In-process fixed-window rate limiter for public endpoints (per-IP) and
 * API-key burst control. For per-plan daily API quotas use
 * src/server/api-keys (DB-backed, exact). This limiter is best-effort and
 * resets on process restart — acceptable for burst protection.
 */

interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function rateLimit(
  key: string,
  max: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const w = windows.get(key);
  if (!w || w.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: max - 1, resetAt: now + windowMs };
  }
  if (w.count >= max) {
    return { allowed: false, remaining: 0, resetAt: w.resetAt };
  }
  w.count++;
  return { allowed: true, remaining: max - w.count, resetAt: w.resetAt };
}

/** Periodic sweep so the map does not grow unbounded. */
let lastSweep = Date.now();
export function sweepIfDue(): void {
  const now = Date.now();
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
}

/** Convenience for route handlers: returns a 429 Response or null. */
export function limitOr429(
  key: string,
  max: number,
  windowMs: number,
): Response | null {
  sweepIfDue();
  const r = rateLimit(key, max, windowMs);
  if (r.allowed) return null;
  return new Response(
    JSON.stringify({ error: "rate_limited", retryAt: new Date(r.resetAt).toISOString() }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(Math.ceil((r.resetAt - Date.now()) / 1000)),
      },
    },
  );
}

/** Test hook. */
export function _resetRateLimiter(): void {
  windows.clear();
}
