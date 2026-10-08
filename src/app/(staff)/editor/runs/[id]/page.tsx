import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getImportRun } from "@/server/pipeline/admin";
import { requireDataEditor } from "../../_components/gate";
import { EditorTabs, PageTitle, StatusBadge, When } from "../../_components/ui";

export const metadata: Metadata = { title: "Import run" };

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  await requireDataEditor();
  const { id } = await params;
  const runId = Number(id);
  if (!Number.isInteger(runId) || runId <= 0) notFound();
  const run = await getImportRun(runId);
  if (!run) notFound();
  const stats = (run.stats ?? {}) as Record<string, unknown>;
  // Upload runs keep wizard state in stats; show only the useful summary.
  const shown =
    run.kind === "upload"
      ? { stage: stats.stage, fileName: stats.fileName, rowCount: stats.rowCount, seriesKey: stats.seriesKey }
      : stats;
  return (
    <div>
      <EditorTabs active={run.kind === "upload" ? "/editor/uploads" : "/editor/connectors"} />
      <PageTitle title={`Import run #${run.id} · ${run.kind}`} />
      <dl className="mb-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted-foreground">Status</dt>
          <dd>
            <StatusBadge status={run.status} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Started</dt>
          <dd>
            <When d={run.startedAt} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Finished</dt>
          <dd>
            <When d={run.finishedAt} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Dataset</dt>
          <dd>
            {run.datasetId ? (
              <Link className="hover:underline" href={`/editor/drafts/${run.datasetId}`}>
                #{run.datasetId}
              </Link>
            ) : run.kind === "upload" && run.status === "running" ? (
              <Link className="hover:underline" href={`/editor/uploads/${run.id}`}>
                continue upload
              </Link>
            ) : (
              "—"
            )}
          </dd>
        </div>
      </dl>
      {run.error && <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-900">{run.error}</p>}
      <h2 className="mb-1 font-semibold">Stats</h2>
      <pre className="mb-4 overflow-x-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(shown, null, 2)}</pre>
      <h2 className="mb-1 font-semibold">Log</h2>
      <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">{run.log ?? "(empty)"}</pre>
    </div>
  );
}
