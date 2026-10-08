import Link from "next/link";
import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { dashboardCounts, listDatasets, listImportRuns } from "@/server/pipeline/admin";
import { requireDataEditor } from "./_components/gate";
import { ChangeCounts, EditorTabs, PageTitle, StatusBadge, SyntheticBadge, When } from "./_components/ui";

export const metadata: Metadata = { title: "Data editor" };

export default async function EditorDashboard() {
  await requireDataEditor();
  const [counts, drafts, runs] = await Promise.all([
    dashboardCounts(),
    listDatasets({ statuses: ["draft"], limit: 8 }),
    listImportRuns({ limit: 8 }),
  ]);
  const tiles: Array<[string, number, string]> = [
    ["Drafts awaiting review", counts.drafts, "/editor/drafts?status=draft"],
    ["Published datasets", counts.published, "/editor/drafts?status=published"],
    ["Failed runs (7 days)", counts.failedRuns7d, "/editor/connectors"],
    ["Open uploads", counts.openUploads, "/editor/uploads"],
    ["Flagged values", counts.flagged, "/editor/quality"],
    ["Place aliases", counts.aliases, "/editor/aliases"],
  ];
  return (
    <div>
      <EditorTabs active="/editor" />
      <PageTitle title="Data editor">
        <Link href="/editor/uploads" className={buttonVariants({ size: "sm" })}>
          Upload a file
        </Link>
        <Link href="/editor/connectors" className={buttonVariants({ size: "sm", variant: "outline" })}>
          Run a connector
        </Link>
      </PageTitle>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map(([label, n, href]) => (
          <Link key={label} href={href} className="rounded-lg border border-border p-3 hover:bg-muted/50">
            <div className="text-2xl font-semibold">{n.toLocaleString("en-NG")}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </Link>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Drafts to review</CardTitle>
          </CardHeader>
          <CardContent>
            {drafts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No drafts. Run a connector or upload a file.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {drafts.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center gap-2 py-2">
                    <Link href={`/editor/drafts/${d.id}`} className="font-medium hover:underline">
                      {d.title}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {d.seriesKey} v{d.version}
                    </span>
                    <SyntheticBadge show={d.isSynthetic} />
                    <span className="ml-auto">
                      <ChangeCounts summary={d.changeSummary} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recent import runs</CardTitle>
          </CardHeader>
          <CardContent>
            {runs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No runs yet.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {runs.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-2 py-2">
                    <Link href={`/editor/runs/${r.id}`} className="font-medium hover:underline">
                      #{r.id} {r.kind}
                    </Link>
                    <StatusBadge status={r.status} />
                    <span className="ml-auto text-xs text-muted-foreground">
                      <When d={r.startedAt} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
