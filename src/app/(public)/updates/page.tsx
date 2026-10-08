import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { formatLagosDate } from "@/lib/format";
import { listPublishedChanges } from "@/server/datasets/versioning";
import { asChangeSummary } from "@/server/pipeline/diff";

/**
 * Public data-updates page (spec: "A public data updates page lists every
 * published change"). Server-rendered, revalidated every 5 minutes, and
 * refreshed immediately on publish/rollback by the editor actions.
 */
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Data updates",
  description: "Every dataset PopLens has published, superseded or rolled back, with what changed.",
};

const STATUS_TEXT: Record<string, { label: string; variant: "success" | "secondary" | "destructive" }> = {
  published: { label: "Live", variant: "success" },
  superseded: { label: "Replaced by a newer version", variant: "secondary" },
  rolled_back: { label: "Rolled back", variant: "destructive" },
};

export default async function UpdatesPage() {
  const changes = await listPublishedChanges(100);
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Data updates</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Every dataset version published on PopLens, newest first. Values only appear on the site once
        a data editor publishes them, and any version can be rolled back. Times are Africa/Lagos.
      </p>
      {changes.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">Nothing has been published yet.</p>
      ) : (
        <ol className="mt-6 space-y-3">
          {changes.map((c) => {
            const s = asChangeSummary(c.changeSummary);
            const st = STATUS_TEXT[c.status] ?? { label: c.status, variant: "secondary" as const };
            return (
              <li key={c.datasetId} className="rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-medium">{c.title}</h2>
                  <Badge variant={st.variant}>{st.label}</Badge>
                  {c.isSynthetic && (
                    <Badge variant="warning" title="Synthetic demo values — not real statistics">
                      Synthetic demo data
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {c.sourcePublisher} · version {c.version} ·{" "}
                  {c.publishedAt ? `published ${formatLagosDate(c.publishedAt)}` : "publication date not recorded"}
                </p>
                {s ? (
                  <p className="mt-2 text-sm">
                    {s.comparedWithVersion
                      ? `Compared with version ${s.comparedWithVersion}: `
                      : "First release of this series: "}
                    <span className="text-emerald-700">{s.added.toLocaleString("en-NG")} added</span>,{" "}
                    <span className="text-amber-700">{s.changed.toLocaleString("en-NG")} changed</span>,{" "}
                    <span className="text-red-700">{s.removed.toLocaleString("en-NG")} removed</span>
                    {s.unchanged > 0 && `, ${s.unchanged.toLocaleString("en-NG")} unchanged`}.
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">No change summary recorded.</p>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
