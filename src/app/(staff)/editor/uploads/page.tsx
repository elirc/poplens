import Link from "next/link";
import type { Metadata } from "next";
import { Download } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/misc";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listImportRuns, listSeriesKeys, listSources } from "@/server/pipeline/admin";
import type { UploadSession } from "@/server/pipeline/uploads";
import { flashFrom, requireDataEditor } from "../_components/gate";
import { EditorTabs, Flash, PageTitle, StatusBadge, When } from "../_components/ui";

export const metadata: Metadata = { title: "Uploads" };

export default async function UploadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireDataEditor();
  const flash = flashFrom(await searchParams);
  const [sources, seriesKeys, runs] = await Promise.all([
    listSources(),
    listSeriesKeys(),
    listImportRuns({ kinds: ["upload"], limit: 30 }),
  ]);
  return (
    <div>
      <EditorTabs active="/editor/uploads" />
      <PageTitle title="Upload a dataset">
        {/* File downloads from a route handler, not page navigations. */}
        <a download href="/editor/uploads/template/indicators" className={buttonVariants({ size: "sm", variant: "outline" })}>
          <Download /> Indicator template
        </a>
        <a download href="/editor/uploads/template/outbreaks" className={buttonVariants({ size: "sm", variant: "outline" })}>
          <Download /> NCDC outbreak template
        </a>
      </PageTitle>
      <Flash {...flash} />
      <ol className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <li className="font-medium text-foreground">1. Upload</li>
        <li>2. Map columns</li>
        <li>3. Review place matches</li>
        <li>4. Validate</li>
        <li>5. Draft → review → publish</li>
      </ol>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>New upload</CardTitle>
          <CardDescription>
            CSV or Excel (.xlsx, first sheet), up to 10 MB / 50,000 rows, with a header row. Values are
            only ever entered from a real source document — leave cells empty where the source has no
            figure (they become “No data”, never 0).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Posts to a route handler (Server Actions cap bodies at 1 MB). */}
          <form
            action="/editor/uploads/upload"
            method="post"
            encType="multipart/form-data"
            className="grid gap-4 sm:grid-cols-2"
          >
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="file">File</Label>
              <Input id="file" name="file" type="file" accept=".csv,.xlsx,text/csv" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="kind">What the file contains</Label>
              <Select id="kind" name="kind" defaultValue="indicator_values">
                <option value="indicator_values">Indicator values (NBS, NPC, MICS, …)</option>
                <option value="outbreak_reports">Weekly outbreak cases (NCDC template)</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sourceId">Source</Label>
              <Select id="sourceId" name="sourceId" required defaultValue="">
                <option value="" disabled>
                  Choose a source…
                </option>
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.publisher} — {s.title}
                  </option>
                ))}
              </Select>
              {sources.length === 0 && (
                <p className="text-xs text-red-700">
                  No sources yet — <Link href="/editor/sources" className="underline">add one</Link> first.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="title">Dataset title</Label>
              <Input id="title" name="title" required minLength={3} placeholder="MICS6 state indicators 2021" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="seriesKey">Series key</Label>
              <Input
                id="seriesKey"
                name="seriesKey"
                required
                pattern="[a-z0-9][a-z0-9\-]{2,80}"
                list="series-keys"
                placeholder="upload-mics6-states"
              />
              <datalist id="series-keys">
                {seriesKeys.map((k) => (
                  <option key={k} value={k} />
                ))}
              </datalist>
              <p className="text-xs text-muted-foreground">
                Reuse an existing key to make a new version of that series (publishing it supersedes the
                current one); a new key starts a new series.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="releaseDate">Source release date (optional)</Label>
              <Input id="releaseDate" name="releaseDate" type="date" />
            </div>
            <div className="flex items-center gap-2 self-end">
              <Checkbox id="isSynthetic" name="isSynthetic" />
              <Label htmlFor="isSynthetic">Synthetic / demo data (shows the demo banner)</Label>
            </div>
            <div className="sm:col-span-2">
              <Button type="submit">Upload and continue</Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <h2 className="mb-2 font-semibold">Recent uploads</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Upload</TableHead>
            <TableHead>File</TableHead>
            <TableHead>Stage</TableHead>
            <TableHead>Started</TableHead>
            <TableHead>Draft</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground">
                No uploads yet.
              </TableCell>
            </TableRow>
          )}
          {runs.map((r) => {
            const s = (r.stats ?? {}) as Partial<UploadSession>;
            return (
              <TableRow key={r.id}>
                <TableCell>
                  <Link
                    href={r.status === "running" ? `/editor/uploads/${r.id}` : `/editor/runs/${r.id}`}
                    className="hover:underline"
                  >
                    #{r.id}
                  </Link>
                </TableCell>
                <TableCell className="max-w-[14rem] truncate">{s.fileName ?? "—"}</TableCell>
                <TableCell>
                  {r.status === "running" ? (
                    <span className="text-xs">{s.stage}</span>
                  ) : (
                    <StatusBadge status={s.stage === "cancelled" ? "cancelled" : r.status} />
                  )}
                </TableCell>
                <TableCell>
                  <When d={r.startedAt} />
                </TableCell>
                <TableCell>
                  {r.datasetId ? (
                    <Link href={`/editor/drafts/${r.datasetId}`} className="hover:underline">
                      #{r.datasetId}
                    </Link>
                  ) : (
                    "—"
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
