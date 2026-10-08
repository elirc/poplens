import { z } from "zod";
import { limitOr429 } from "@/lib/rate-limit";
import { searchAll } from "@/server/search/search";

/**
 * GET /api/search?q=… — combined place + indicator search for the client
 * combobox. Public, so rate-limited per IP (best-effort burst control) and
 * cacheable for 60 s by browsers/CDNs.
 */

const querySchema = z.object({
  q: z.string().max(200).default(""),
});

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function GET(req: Request) {
  const limited = limitOr429(`search:${clientIp(req)}`, 60, 60_000);
  if (limited) return limited;

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({ q: url.searchParams.get("q") ?? undefined });
  if (!parsed.success) {
    return Response.json({ error: "invalid_query" }, { status: 400 });
  }

  try {
    const result = await searchAll(parsed.data.q);
    return Response.json(result, {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=60" },
    });
  } catch (err) {
    console.error("search failed", err);
    return Response.json({ error: "search_failed" }, { status: 500 });
  }
}
