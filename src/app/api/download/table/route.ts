import { getCurrentUser } from "@/lib/session";
import { limitOr429 } from "@/lib/rate-limit";
import { clientIp } from "@/server/tiles/http";
import { parseFormat, parseTableSpec } from "@/server/downloads/spec";
import { downloadResponse, performDownload } from "@/server/downloads/service";

/**
 * GET /api/download/table?kind=level|places|place&…&format=csv|xlsx
 * Every check happens here on the server: licence → account → plan/quota →
 * download_log. Refusals are JSON { error, message, actionUrl }.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const limited = limitOr429(`download:${clientIp(req)}`, 30, 60_000);
  if (limited) return limited;

  const sp = new URL(req.url).searchParams;
  const format = parseFormat(sp.get("format"));
  if (!format) {
    return downloadResponse({ ok: false, status: 400, code: "invalid", message: "format must be csv or xlsx" });
  }
  const spec = parseTableSpec(sp);
  if (!spec.ok) {
    return downloadResponse({ ok: false, status: 400, code: "invalid", message: spec.message });
  }
  const user = await getCurrentUser();
  const outcome = await performDownload({ user: user ? { id: user.id } : null, spec: spec.value, format });
  return downloadResponse(outcome);
}
