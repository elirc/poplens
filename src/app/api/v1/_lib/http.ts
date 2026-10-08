import { z } from "zod";
import { limitOr429 } from "@/lib/rate-limit";
import { authenticateApiRequest } from "@/server/api-keys/authenticate";

/**
 * Public API v1 plumbing: consistent envelope, key auth + quotas on every
 * endpoint, Zod-validated query params.
 *   success: { data, meta: { count, page?, pageSize?, source? , ... } }
 *   error:   { error: { code, message } }
 */

export const API_VERSION = "v1";

const BASE_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "private, no-store",
  "X-PopLens-API-Version": API_VERSION,
};

export function apiError(
  status: number,
  code: string,
  message: string,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { ...BASE_HEADERS, ...headers },
  });
}

export function apiOk(data: unknown, meta: Record<string, unknown>, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ data, meta }), { status: 200, headers: { ...BASE_HEADERS, ...headers } });
}

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0] : req.headers.get("x-real-ip"))?.trim() || "unknown";
}

type Handler<P> = (ctx: {
  req: Request;
  url: URL;
  params: P;
  planCode: string;
}) => Promise<{ data: unknown; meta: Record<string, unknown> } | Response>;

/**
 * Wrap a route handler: per-IP guard (unauthenticated abuse), key auth,
 * burst + daily quota, envelope, error mapping. Query-param ZodErrors map
 * to 400 invalid_parameter.
 */
export function withApiKey<P = Record<string, never>>(handler: Handler<P>) {
  return async (req: Request, ctx: { params: Promise<P> }): Promise<Response> => {
    const ipLimited = limitOr429(`api-ip:${clientIp(req)}`, 300, 60_000);
    if (ipLimited) return apiError(429, "rate_limited", "Too many requests from this address.", {
      "Retry-After": ipLimited.headers.get("Retry-After") ?? "60",
    });

    const auth = await authenticateApiRequest(req);
    if (!auth.ok) return apiError(auth.status, auth.code, auth.message, auth.headers);
    try {
      const params = (ctx?.params ? await ctx.params : {}) as P;
      const out = await handler({ req, url: new URL(req.url), params, planCode: auth.planCode });
      if (out instanceof Response) {
        for (const [k, v] of Object.entries(auth.headers)) out.headers.set(k, v);
        return out;
      }
      return apiOk(out.data, out.meta, auth.headers);
    } catch (e) {
      if (e instanceof z.ZodError) {
        return apiError(
          400,
          "invalid_parameter",
          e.issues.map((i) => `${i.path.join(".") || "query"}: ${i.message}`).join("; "),
          auth.headers,
        );
      }
      if (e instanceof ApiProblem) return apiError(e.status, e.code, e.message, auth.headers);
      console.error("[api/v1] unhandled error", e);
      return apiError(500, "internal_error", "Something went wrong.", auth.headers);
    }
  };
}

/** Throw from a handler to return a specific error envelope. */
export class ApiProblem extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Query string → plain object (empty strings dropped) for Zod parsing. */
export function queryObject(url: URL): Record<string, string> {
  const out: Record<string, string> = {};
  url.searchParams.forEach((v, k) => {
    if (v.trim() !== "") out[k] = v.trim();
  });
  return out;
}

export const pageParam = z.coerce.number().int().min(1).max(10_000).default(1);
export const codeParam = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_.-]+$/, "Invalid code");
