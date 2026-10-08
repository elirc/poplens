import { limitOr429 } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/session";
import { clientIp } from "@/server/tiles/http";
import { getCardBySlug } from "@/server/content/queries";
import { buildCardData } from "@/server/content/cards";
import { renderCardImage, renderErrorImage, type CardImageSize } from "@/server/content/og";

/**
 * GET /api/og/card/<slug>?size=wide|square[&download=1]
 * Insight-card image rendered from LIVE published values via the card spec
 * (wide 1200×630 for link previews, square 1080×1080 for WhatsApp/Instagram).
 * Draft cards render only for content editors (editor preview).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STAFF = new Set(["content_editor", "admin"]);

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const limited = limitOr429(`og:${clientIp(req)}`, 120, 60_000);
  if (limited) return limited;

  const { slug } = await params;
  const sp = new URL(req.url).searchParams;
  const size: CardImageSize = sp.get("size") === "square" ? "square" : "wide";

  let card = await getCardBySlug(decodeURIComponent(slug));
  let isDraft = false;
  if (!card) {
    const user = await getCurrentUser().catch(() => null);
    if (user && STAFF.has(user.role)) {
      card = await getCardBySlug(decodeURIComponent(slug), { includeDrafts: true });
      isDraft = card != null;
    }
  }
  if (!card) return new Response("Card not found", { status: 404 });
  if (!card.spec) return renderErrorImage(`Invalid card spec: ${card.specError ?? "unknown"}`, size);

  const built = await buildCardData(card.spec, card.title);
  if (!built.ok) return renderErrorImage(built.message, size);
  return renderCardImage(built.data, size, {
    cacheControl: isDraft ? "private, no-store" : undefined,
    downloadName: sp.get("download") ? `poplens-${card.slug}-${size}.png` : undefined,
  });
}
