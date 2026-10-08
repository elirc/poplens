import { getCurrentUser } from "@/lib/session";
import { parseCardSpec } from "@/server/content/card-spec";
import { buildCardData } from "@/server/content/cards";
import { renderCardImage, renderErrorImage, type CardImageSize } from "@/server/content/og";

/**
 * GET /api/og/preview?spec=<json>&title=<text>&size=wide|square
 * Live preview of an UNSAVED card spec for the card generator. Content
 * editors only; never cached.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getCurrentUser().catch(() => null);
  if (!user || (user.role !== "content_editor" && user.role !== "admin")) {
    return new Response("Forbidden", { status: 403 });
  }
  const sp = new URL(req.url).searchParams;
  const size: CardImageSize = sp.get("size") === "square" ? "square" : "wide";
  let raw: unknown;
  try {
    raw = JSON.parse(sp.get("spec") ?? "");
  } catch {
    return renderErrorImage("Spec is not valid JSON", size);
  }
  const spec = parseCardSpec(raw);
  if (!spec.ok) return renderErrorImage(spec.message, size);
  const title = (sp.get("title") ?? "").trim().slice(0, 140) || null;
  const built = await buildCardData(spec.value, title);
  if (!built.ok) return renderErrorImage(built.message, size);
  return renderCardImage(built.data, size, { cacheControl: "private, no-store" });
}
