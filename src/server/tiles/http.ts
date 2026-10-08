/** Shared HTTP helpers for the geo + tile route handlers. */

/** Best-effort client IP for per-IP rate limiting. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "local";
}

/** Shapes rarely change: 1 h fresh, 1 day stale-while-revalidate (brief). */
export const SHAPE_CACHE_CONTROL = "public, max-age=3600, stale-while-revalidate=86400";

/** Values change when datasets publish: shorter freshness. */
export const VALUES_CACHE_CONTROL = "public, max-age=300, stale-while-revalidate=3600";

/** Generous public limits (per IP per minute). Tiles burst heavily while panning. */
export const GEO_RATE = { max: 240, windowMs: 60_000 } as const;
export const TILE_RATE = { max: 1200, windowMs: 60_000 } as const;

export function jsonResponse(
  body: unknown,
  init: { status?: number; cacheControl?: string } = {},
): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...(init.cacheControl ? { "Cache-Control": init.cacheControl } : {}),
    },
  });
}

export function badRequest(message: string): Response {
  return jsonResponse({ error: "bad_request", message }, { status: 400 });
}

export function notFound(message = "not found"): Response {
  return jsonResponse({ error: "not_found", message }, { status: 404 });
}
