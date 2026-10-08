import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, Checkbox } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCI, formatValue } from "@/lib/format";
import {
  datasetIndicatorBreakdown,
  findOutliers,
  getDataset,
  listDatasetOutbreaks,
  listDatasetValues,
  listSeriesVersions,
  type ValueRow,
} from "@/server/pipeline/admin";
import {
  discardDraftAction,
  publishDatasetAction,
  rollbackDatasetAction,
  setQualityFlagAction,
} from "../../actions";
import { flashFrom, requireDataEditor } from "../../_components/gate";
import { SubmitButton } from "../../_components/submit-button";
import { ChangeSummaryPanel, EditorTabs, Flash, PageTitle, StatusBadge, SyntheticBadge, When } from "../../_components/ui";

export const metadata: Metadata = { title: "Dataset review" };

function FlagForm({ v, back }: { v: ValueRow; back: string }) {
  return (
    <form action={setQualityFlagAction} className="flex items-center gap-1">
      <input type="hidden" name="valueId" value={v.id} />
      <input type="hidden" name="back" value={back} />
      <select
        name="flag"
        defaultValue={v.qualityFlag ?? ""}
        aria-label="Quality flag"
        className="h-7 rounded border border-border bg-background px-1 text-xs"
      >
        <option value="">no flag</option>
        <option value="questionable">questionable</option>
        <option value="confirmed-outlier">confirmed outlier</option>
      </select>
      <Button type="submit" size="sm" variant="ghost" className="h-7 px-2">
        Set
      </Button>
    </form>
  );
}

function ValuesTable({ rows, back }: { rows: Array<ValueRow & { z?: number }>; back: string }) {
  const hasZ = rows.some((r) => r.z !== undefined);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Indicator</TableHead>
          <TableHead>Place</TableHead>
          <TableHead>Year</TableHead>
          <TableHead>Breakdown</TableHead>
          <TableHead className="text-right">Value</TableHead>
          {hasZ && <TableHead className="text-right">z</TableHead>}
          <TableHead>Flag</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((v) => {
          const meta = { unit: v.unit, valueType: v.valueType, decimals: v.decimals };
          const bd = [v.sex, v.ageGroup, v.residence].filter((x) => x !== "all").join(" / ");
          return (
            <TableRow key={v.id}>
              <TableCell className="text-xs">{v.indicatorCode}</TableCell>
              <TableCell>
                {v.placeName} <span className="text-xs text-muted-foreground">{v.placeCode}</span>
              </TableCell>
              <TableCell>{v.year}</TableCell>
              <TableCell className="text-xs">{bd || "—"}</TableCell>
              <TableCell className="whitespace-nowrap text-right">
                {formatValue(v.value, meta, { compact: false })}{" "}
                <span className="text-xs text-muted-foreground">{formatCI(v.lower, v.upper, meta)}</span>
                {v.isEstimate && <span className="ml-1 text-xs text-muted-foreground">est.</span>}
              </TableCell>
              {hasZ && <TableCell className="text-right text-xs">{v.z}</TableCell>}
              <TableCell>
                <FlagForm v={v} back={back} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export default async function DatasetDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireDataEditor();
  const { id: raw } = await params;
  const sp = await searchParams;
  const flash = flashFrom(sp);
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const found = await getDataset(id);
  if (!found) notFound();
  const { dataset: d, source } = found;
  const indicatorFilter = typeof sp.indicator === "string" ? sp.indicator : undefined;
  const page = Math.max(0, Number(sp.page) || 0);
  const [breakdown, values, outbreaks, versions, outliers] = await Promise.all([
    datasetIndicatorBreakdown(id),
    listDatasetValues(id, { indicatorCode: indicatorFilter, limit: 100, offset: page * 100 }),
    listDatasetOutbreaks(id),
    listSeriesVersions(d.seriesKey),
    findOutliers(id, 3, 30),
  ]);
  const back = `/editor/drafts/${id}`;
  const qs = (p: number) =>
    `${back}?${new URLSearchParams({ ...(indicatorFilter ? { indicator: indicatorFilter } : {}), page: String(p) })}`;

  return (
    <div>
      <EditorTabs active="/editor/drafts" />
      <PageTitle title={`#${d.id} ${d.title}`}>
        <StatusBadge status={d.status} />
        <SyntheticBadge show={d.isSynthetic} />
      </PageTitle>
      <Flash {...flash} />
      <dl className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted-foreground">Series / version</dt>
          <dd>
            <code>{d.seriesKey}</code> v{d.version}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Source</dt>
          <dd>
            {source.publisher}{" "}
            <Badge variant={source.allowsRedistribution ? "success" : "secondary"}>
              {source.allowsRedistribution ? "redistributable" : "no redistribution"}
            </Badge>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Years · levels</dt>
          <dd>
            {d.yearsCovered ?? "—"} · {d.levelsCovered?.join(", ") ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Created / published</dt>
          <dd className="text-xs">
            <When d={d.createdAt} /> / <When d={d.publishedAt} />
          </dd>
        </div>
      </dl>
      {d.description && <p className="mb-4 text-sm text-muted-foreground">{d.description}</p>}

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>What will change</CardTitle>
            <CardDescription>Computed when this version was imported.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChangeSummaryPanel summary={d.changeSummary} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {d.status === "draft" && (
              <>
                <form action={publishDatasetAction} className="space-y-2">
                  <input type="hidden" name="datasetId" value={d.id} />
                  <div className="flex items-start gap-2">
                    <Checkbox id="confirm-publish" name="confirm" value="yes" required />
                    <Label htmlFor="confirm-publish" className="font-normal leading-snug">
                      I have reviewed the changes. Publishing makes these values public
                      {versions.some((v) => v.status === "published") ? " and supersedes the current version" : ""}.
                    </Label>
                  </div>
                  <SubmitButton pendingText="Publishing…">Publish</SubmitButton>
                </form>
                <form action={discardDraftAction}>
                  <input type="hidden" name="datasetId" value={d.id} />
                  <Button type="submit" variant="ghost" size="sm">
                    Discard draft
                  </Button>
                </form>
              </>
            )}
            {d.status === "published" && (
              <form action={rollbackDatasetAction} className="space-y-2">
                <input type="hidden" name="datasetId" value={d.id} />
                <div className="flex items-start gap-2">
                  <Checkbox id="confirm-rollback" name="confirm" value="yes" required />
                  <Label htmlFor="confirm-rollback" className="font-normal leading-snug">
                    Roll back: unpublish this version and restore the previous published version of the
                    series (if any).
                  </Label>
                </div>
                <SubmitButton variant="destructive" pendingText="Rolling back…">
                  Roll back
                </SubmitButton>
              </form>
            )}
            {(d.status === "superseded" || d.status === "rolled_back") && (
              <p className="text-sm text-muted-foreground">
                This version is kept for history. Roll back the published version to restore the most
                recent superseded one.
              </p>
            )}
            <div>
              <h3 className="mb-1 text-sm font-medium">Version history</h3>
              <ul className="space-y-1 text-sm">
                {versions.map((v) => (
                  <li key={v.id} className="flex items-center gap-2">
                    <Link href={`/editor/drafts/${v.id}`} className={v.id === d.id ? "font-semibold" : "hover:underline"}>
                      v{v.version} (#{v.id})
                    </Link>
                    <StatusBadge status={v.status} />
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      {breakdown.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 font-semibold">Indicators in this dataset</h2>
          <div className="flex flex-wrap gap-2 text-sm">
            <Link
              href={back}
              className={"rounded-full border px-3 py-1 " + (!indicatorFilter ? "border-foreground" : "border-border")}
            >
              All
            </Link>
            {breakdown.map((b) => (
              <Link
                key={b.code}
                href={`${back}?indicator=${encodeURIComponent(b.code)}`}
                className={
                  "rounded-full border px-3 py-1 " + (indicatorFilter === b.code ? "border-foreground" : "border-border")
                }
                title={b.name}
              >
                {b.code} · {b.rows} · {b.minYear === b.maxYear ? b.minYear : `${b.minYear}–${b.maxYear}`}
                {b.flagged > 0 && <span className="text-amber-700"> · {b.flagged} flagged</span>}
              </Link>
            ))}
          </div>
        </section>
      )}

      {outliers.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-1 font-semibold">Suspected outliers</h2>
          <p className="mb-2 text-xs text-muted-foreground">
            More than 3 standard deviations from peers (same indicator, year, level and breakdown). Check
            them against the source; flag the ones that are questionable.
          </p>
          <ValuesTable rows={outliers} back={back} />
        </section>
      )}

      {values.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 font-semibold">Values {indicatorFilter ? `· ${indicatorFilter}` : ""}</h2>
          <ValuesTable rows={values} back={back} />
          <div className="mt-2 flex gap-3 text-sm">
            {page > 0 && (
              <Link href={qs(page - 1)} className="hover:underline">
                ← Previous
              </Link>
            )}
            {values.length === 100 && (
              <Link href={qs(page + 1)} className="hover:underline">
                Next →
              </Link>
            )}
          </div>
        </section>
      )}

      {outbreaks.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 font-semibold">Outbreak lines (first 100)</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Disease</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Year · week</TableHead>
                <TableHead className="text-right">Suspected</TableHead>
                <TableHead className="text-right">Confirmed</TableHead>
                <TableHead className="text-right">Deaths</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {outbreaks.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>{o.disease.replace("_", " ")}</TableCell>
                  <TableCell>{o.stateName}</TableCell>
                  <TableCell>
                    {o.year} · wk {o.week}
                  </TableCell>
                  <TableCell className="text-right">{o.suspected ?? "No data"}</TableCell>
                  <TableCell className="text-right">{o.confirmed ?? "No data"}</TableCell>
                  <TableCell className="text-right">{o.deaths ?? "No data"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}

      {values.length === 0 && outbreaks.length === 0 && (
        <Alert>This dataset has no rows{indicatorFilter ? " for that indicator" : ""}.</Alert>
      )}
    </div>
  );
}
