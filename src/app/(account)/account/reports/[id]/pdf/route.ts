import { db, schema } from "@/db";
import { getStorage } from "@/adapters";
import { getCurrentUser } from "@/lib/session";
import { getReportForUser } from "@/server/reports/build";

export const dynamic = "force-dynamic";

/**
 * Download a built custom report. Only the owner may fetch it (ownership is
 * part of the lookup). Every download is logged (spec).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in required", { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return new Response("Not found", { status: 404 });
  const report = await getReportForUser(user.id, id);
  if (!report || report.status !== "ready" || !report.fileKey) return new Response("Not found", { status: 404 });
  const file = await getStorage().get(report.fileKey);
  if (!file) return new Response("Report file missing — rebuild it from your account", { status: 410 });

  await db.insert(schema.downloadLog).values({
    userId: user.id,
    datasetId: null,
    format: "pdf",
    detail: { page: "custom_report", params: { reportId: report.id, ...(report.params as object) } },
  });

  const safeName = report.title.replace(/[^A-Za-z0-9 _-]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "report";
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="poplens-${safeName}-${report.id}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
