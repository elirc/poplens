import Link from "next/link";
import type { Metadata } from "next";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listDatasets, type DatasetStatus } from "@/server/pipeline/admin";
import { flashFrom, requireDataEditor } from "../_components/gate";
import { ChangeCounts, EditorTabs, Flash, PageTitle, StatusBadge, SyntheticBadge, When } from "../_components/ui";

export const metadata: Metadata = { title: "Datasets" };

const FILTERS: Array<[string, string, DatasetStatus[] | undefined]> = [
  ["draft", "Drafts", ["draft"]],
  ["published", "Published", ["published"]],
  ["history", "Superseded & rolled back", ["superseded", "rolled_back"]],
  ["all", "All", undefined],
];

export default async function DatasetsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireDataEditor();
  const sp = await searchParams;
  const flash = flashFrom(sp);
  const key = typeof sp.status === "string" && FILTERS.some((f) => f[0] === sp.status) ? sp.status : "draft";
  const filter = FILTERS.find((f) => f[0] === key)!;
  const rows = await listDatasets({ statuses: filter[2] });
  return (
    <div>
      <EditorTabs active="/editor/drafts" />
      <PageTitle title="Datasets" />
      <Flash {...flash} />
      <nav className="mb-4 flex flex-wrap gap-2 text-sm" aria-label="Filter datasets">
        {FILTERS.map(([k, label]) => (
          <Link
            key={k}
            href={`/editor/drafts?status=${k}`}
            aria-current={k === key ? "page" : undefined}
            className={
              "rounded-full border px-3 py-1 " +
              (k === key ? "border-foreground font-medium" : "border-border text-muted-foreground hover:text-foreground")
            }
          >
            {label}
          </Link>
        ))}
      </nav>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Dataset</TableHead>
            <TableHead>Series</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Rows</TableHead>
            <TableHead>vs published</TableHead>
            <TableHead>Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-muted-foreground">
                Nothing here.
              </TableCell>
            </TableRow>
          )}
          {rows.map((d) => (
            <TableRow key={d.id}>
              <TableCell>
                <Link href={`/editor/drafts/${d.id}`} className="font-medium hover:underline">
                  #{d.id} {d.title}
                </Link>{" "}
                <SyntheticBadge show={d.isSynthetic} />
              </TableCell>
              <TableCell className="whitespace-nowrap text-xs">
                {d.seriesKey} v{d.version}
              </TableCell>
              <TableCell>
                <StatusBadge status={d.status} />
              </TableCell>
              <TableCell className="text-xs">{d.sourcePublisher}</TableCell>
              <TableCell>{(d.valueCount + d.outbreakCount).toLocaleString("en-NG")}</TableCell>
              <TableCell>
                <ChangeCounts summary={d.changeSummary} />
              </TableCell>
              <TableCell className="text-xs">
                <When d={d.createdAt} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
