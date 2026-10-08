/** Validate a ?next= redirect target: same-site path only (no open redirects). */
export function safeNext(raw: string | string[] | undefined, fallback = "/account"): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v || !v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\")) return fallback;
  if (/[\r\n]/.test(v) || v.length > 500) return fallback;
  return v;
}
