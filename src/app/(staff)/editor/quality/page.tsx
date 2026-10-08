import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCI, formatValue } from "@/lib/format";
import { listFlaggedValues } from "@/server/pipeline/admin";
import { setQualityFlagAction } from "../actions";
import { flashFrom, requireDataEditor } from "../_components/gate";
import { EditorTabs, Flash, PageTitle, StatusBadge } from "../_components/ui";

export const metadata: Metadata = { title: "Quality flags" };

export default async function QualityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireDataEditor();
  const flash = flashFrom(await searchParams);
  const rows = await listFlaggedValues();
  return (
    <div>
      <EditorTabs active="/editor/quality" />
      <PageTitle title="Quality flags" />
      <Flash {...flash} />
      <p className="mb-4 text-sm text-muted-foreground">
        Values staff have flagged as questionable or as confirmed outliers. Flag values from a
        dataset’s review page (suspected outliers are listed there). Flags are audited.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Flag</TableHead>
            <TableHead>Indicator</TableHead>
            <TableHead>Place</TableHead>
            <TableHead>Year</TableHead>
            <TableHead className="text-right">Value</TableHead>
            <TableHead>Dataset</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-muted-foreground">
                No flagged values.
              </TableCell>
            </TableRow>
          )}
          {rows.map((v) => {
            const meta = { unit: v.unit, valueType: v.valueType, decimals: v.decimals };
            return (
              <TableRow key={v.id}>
                <TableCell className="text-xs font-medium text-amber-800">{v.qualityFlag}</TableCell>
                <TableCell className="text-xs">{v.indicatorCode}</TableCell>
                <TableCell>
                  {v.placeName} <span className="text-xs text-muted-foreground">{v.placeCode}</span>
                </TableCell>
                <TableCell>{v.year}</TableCell>
                <TableCell className="whitespace-nowrap text-right">
                  {formatValue(v.value, meta, { compact: false })}{" "}
                  <span className="text-xs text-muted-foreground">{formatCI(v.lower, v.upper, meta)}</span>
                </TableCell>
                <TableCell className="text-xs">
                  <Link href={`/editor/drafts/${v.datasetId}`} className="hover:underline">
                    #{v.datasetId}
                  </Link>{" "}
                  <StatusBadge status={v.datasetStatus} />
                </TableCell>
                <TableCell>
                  <form action={setQualityFlagAction}>
                    <input type="hidden" name="valueId" value={v.id} />
                    <input type="hidden" name="flag" value="clear" />
                    <input type="hidden" name="back" value="/editor/quality" />
                    <Button type="submit" size="sm" variant="ghost">
                      Clear
                    </Button>
                  </form>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
