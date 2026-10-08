import { db, schema } from "@/db";
import { env } from "@/env";
import { consumeDailyQuota, getUserPlan } from "@/lib/limits";
import { slugify } from "@/lib/utils";
import type { DownloadFormat, DownloadSpec } from "@/components/content/types";
import { buildMetadata } from "./citation";
import { toCsv } from "./csv";
import { getPublishedDatasetMeta } from "./datasets";
import { evaluateDownloadGate, type GateDeps, type GateRefusal } from "./licence";
import { buildDownloadTable, type DownloadTable } from "./tables";
import { toXlsx } from "./xlsx";

/**
 * One download, end to end: (1) licence → (2) account → (3) plan/quota →
 * build the file → (4) log in download_log → return the bytes. Session
 * lookup stays in the route handler so this is callable from db tests.
 */

export type DownloadOutcome =
  | {
      ok: true;
      filename: string;
      contentType: string;
      body: string | Uint8Array;
      rows: number;
      planCode: string;
    }
  | GateRefusal;

const defaultDeps: GateDeps = {
  getUserPlan,
  consumeDailyQuota: (userId, kind, limit) => consumeDailyQuota(userId, kind, limit),
};

export async function performDownload(
  input: {
    user: { id: string } | null;
    spec: DownloadSpec;
    format: DownloadFormat;
    now?: Date;
  },
  deps: GateDeps = defaultDeps,
): Promise<DownloadOutcome> {
  const now = input.now ?? new Date();
  const userId = input.user?.id ?? null;
  let table: DownloadTable;
  let planCode: string;

  if (input.spec.kind === "dataset") {
    // Cheap metadata first so the licence is checked before loading values.
    const meta = await getPublishedDatasetMeta(input.spec.datasetId);
    if (!meta) return { ok: false, status: 404, code: "empty", message: "Dataset not found or not published." };
    const gate = await evaluateDownloadGate({ sources: [meta.source], userId }, deps);
    if (!gate.ok) return gate;
    planCode = gate.planCode;
    const built = await buildDownloadTable(input.spec);
    if (!built.ok) return built;
    table = built.table;
  } else {
    // Tables need their rows to know their sources; don't build them for
    // anonymous visitors (downloads always need an account).
    if (!userId) {
      return { ok: false, status: 401, code: "auth", message: "Sign in to download data.", actionUrl: "/sign-in" };
    }
    const built = await buildDownloadTable(input.spec);
    if (!built.ok) return built;
    table = built.table;
    const gate = await evaluateDownloadGate(
      { sources: table.datasets.map((d) => d.source), userId },
      deps,
    );
    if (!gate.ok) return gate;
    planCode = gate.planCode;
  }

  const metadata = buildMetadata({
    title: table.title,
    datasets: table.datasets,
    appUrl: env.APP_URL,
    pagePath: table.pagePath,
    accessed: now,
  });
  const synthetic = table.datasets.some((d) => d.isSynthetic);
  const base = `poplens-${slugify(table.title).slice(0, 60) || "data"}-${now.toISOString().slice(0, 10)}`;

  let body: string | Uint8Array;
  let contentType: string;
  if (input.format === "csv") {
    body = toCsv({ metadata, columns: table.columns, rows: table.rows });
    contentType = "text/csv; charset=utf-8";
  } else {
    body = await toXlsx({ title: table.title, metadata, columns: table.columns, rows: table.rows, synthetic });
    contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }

  // Spec: log every download.
  await db.insert(schema.downloadLog).values({
    userId,
    datasetId: table.singleDatasetId,
    format: input.format,
    detail: {
      page: table.pagePath,
      spec: input.spec,
      title: table.title,
      rows: table.rows.length,
      datasetIds: table.datasets.map((d) => d.datasetId),
      planCode,
    },
  });

  return {
    ok: true,
    filename: `${base}.${input.format}`,
    contentType,
    body,
    rows: table.rows.length,
    planCode,
  };
}

/** Route-handler helper: outcome → Response (JSON error bodies for refusals). */
export function downloadResponse(outcome: DownloadOutcome): Response {
  if (!outcome.ok) {
    return new Response(
      JSON.stringify({ error: outcome.code, message: outcome.message, actionUrl: outcome.actionUrl ?? null }),
      {
        status: outcome.status,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
      },
    );
  }
  const body = typeof outcome.body === "string" ? outcome.body : new Blob([outcome.body as BlobPart]);
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": outcome.contentType,
      "Content-Disposition": `attachment; filename="${outcome.filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
