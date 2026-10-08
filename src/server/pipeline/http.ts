/**
 * Resilient JSON fetch for the REAL connector drivers: per-request timeout,
 * 2 retries with backoff on network errors / 429 / 5xx. Never used by mock
 * drivers (mock mode makes no network calls).
 */
export async function fetchJson<T>(
  url: string,
  opts: { timeoutMs?: number; retries?: number; label?: string } = {},
): Promise<T> {
  const retries = opts.retries ?? 2;
  const timeoutMs = opts.timeoutMs ?? 45_000;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { Accept: "application/json", "User-Agent": "PopLens data connector" },
      });
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`HTTP ${res.status}`);
      }
      if (!res.ok) {
        // 4xx other than 429 will not get better on retry.
        const body = await res.text().catch(() => "");
        throw Object.assign(new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`), {
          fatal: true,
        });
      }
      return (await res.json()) as T;
    } catch (e) {
      lastErr = e;
      if ((e as { fatal?: boolean }).fatal) break;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw new Error(`${opts.label ?? "request"} failed (${url}): ${msg}`);
}
