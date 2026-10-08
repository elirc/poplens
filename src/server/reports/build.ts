import { createElement, type ReactElement } from "react";
import { and, desc, eq, sql } from "drizzle-orm";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { db, schema } from "@/db";
import { getStorage } from "@/adapters";
import { loadReportData } from "./data";
import { ReportDocument } from "./document";
import { reportFileKey, reportParamsSchema, type ReportParams } from "./params";

/**
 * Report persistence + build. The worker job 'report.build' calls
 * buildReport(id); the account page can also build inline as a fallback.
 * Idempotent: a 'ready' report whose file exists is left alone, and a
 * conditional status flip stops two builders running the same report.
 */

export const REPORT_JOB = "report.build";
/** A 'building' row older than this is assumed dead and may be rebuilt. */
const STALE_BUILD_MINUTES = 10;

export async function createReportRow(userId: string, title: string, params: ReportParams): Promise<number> {
  const [row] = await db
    .insert(schema.customReports)
    .values({ userId, title, params, status: "pending" })
    .returning({ id: schema.customReports.id });
  return row.id;
}

export async function listReportsForUser(userId: string, limit = 50) {
  return db
    .select({
      id: schema.customReports.id,
      title: schema.customReports.title,
      params: schema.customReports.params,
      status: schema.customReports.status,
      error: schema.customReports.error,
      createdAt: schema.customReports.createdAt,
      finishedAt: schema.customReports.finishedAt,
    })
    .from(schema.customReports)
    .where(eq(schema.customReports.userId, userId))
    .orderBy(desc(schema.customReports.createdAt))
    .limit(limit);
}

export async function getReportForUser(userId: string, id: number) {
  const [r] = await db
    .select()
    .from(schema.customReports)
    .where(and(eq(schema.customReports.id, id), eq(schema.customReports.userId, userId)))
    .limit(1);
  return r ?? null;
}

export async function renderReportPdf(title: string, params: ReportParams): Promise<Buffer> {
  const data = await loadReportData(params);
  const doc = createElement(ReportDocument, { title, data, generatedAt: new Date() });
  return renderToBuffer(doc as unknown as ReactElement<DocumentProps>);
}

export type BuildOutcome = "built" | "already_ready" | "in_progress" | "not_found" | "failed";

export async function buildReport(id: number): Promise<BuildOutcome> {
  const [row] = await db.select().from(schema.customReports).where(eq(schema.customReports.id, id)).limit(1);
  if (!row) return "not_found";
  const storage = getStorage();
  if (row.status === "ready" && row.fileKey && (await storage.exists(row.fileKey))) return "already_ready";

  // Claim the build: pending/failed/ready-without-file, or a stale 'building'.
  const claimed = await db
    .update(schema.customReports)
    .set({ status: "building", error: null })
    .where(
      and(
        eq(schema.customReports.id, id),
        sql`(${schema.customReports.status} <> 'building'
             OR ${schema.customReports.createdAt} < now() - (${STALE_BUILD_MINUTES} * interval '1 minute'))`,
      ),
    )
    .returning({ id: schema.customReports.id });
  if (claimed.length === 0) return "in_progress";

  try {
    const params = reportParamsSchema.parse(row.params);
    const pdf = await renderReportPdf(row.title, params);
    const key = reportFileKey(id);
    await storage.put(key, pdf, "application/pdf");
    await db
      .update(schema.customReports)
      .set({ status: "ready", fileKey: key, finishedAt: new Date(), error: null })
      .where(eq(schema.customReports.id, id));
    return "built";
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[reports] build #${id} failed`, e);
    await db
      .update(schema.customReports)
      .set({ status: "failed", error: message.slice(0, 500), finishedAt: new Date() })
      .where(eq(schema.customReports.id, id));
    return "failed";
  }
}
