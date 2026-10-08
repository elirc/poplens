import { requireRole } from "@/lib/session";
import { INDICATOR_TEMPLATE_CSV, OUTBREAK_TEMPLATE_CSV } from "@/server/pipeline/parse";

/**
 * Downloadable CSV upload templates:
 *   /editor/uploads/template/indicators — indicator values (any level)
 *   /editor/uploads/template/outbreaks  — NCDC weekly outbreak template
 * The example rows carry NO values (never ship an invented statistic).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ kind: string }> }) {
  try {
    await requireRole("data_editor");
  } catch {
    return new Response("Forbidden", { status: 403 });
  }
  const { kind } = await params;
  const body =
    kind === "outbreaks" ? OUTBREAK_TEMPLATE_CSV : kind === "indicators" ? INDICATOR_TEMPLATE_CSV : null;
  if (!body) return new Response("Unknown template", { status: 404 });
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="poplens-${kind}-template.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
