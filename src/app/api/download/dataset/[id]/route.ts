import { getCurrentUser } from "@/lib/session";
import { limitOr429 } from "@/lib/rate-limit";
import { clientIp } from "@/server/tiles/http";
import { parseDatasetId, parseFormat } from "@/server/downloads/spec";
import { downloadResponse, performDownload } from "@/server/downloads/service";

/**
 * GET /api/download/dataset/<id>?format=csv|xlsx — a whole published
 * dataset. Licence → account → plan/quota → download_log, all server-side.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = limitOr429(`download:${clientIp(req)}`, 30, 60_000);
  if (limited) return limited;

  const { id } = await params;
  const datasetId = parseDatasetId(id);
  if (datasetId == null) {
    return downloadResponse({ ok: false, status: 400, code: "invalid", message: "Invalid dataset id" });
  }
  const format = parseFormat(new URL(req.url).searchParams.get("format"));
  if (!format) {
    return downloadResponse({ ok: false, status: 400, code: "invalid", message: "format must be csv or xlsx" });
  }
  const user = await getCurrentUser();
  const outcome = await performDownload({
    user: user ? { id: user.id } : null,
    spec: { kind: "dataset", datasetId },
    format,
  });
  return downloadResponse(outcome);
}
