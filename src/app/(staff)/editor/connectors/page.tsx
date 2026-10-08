import Link from "next/link";
import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CONNECTORS, connectorMode } from "@/server/pipeline/connectors";
import { listImportRuns } from "@/server/pipeline/admin";
import { queueConnectorAction, runConnectorAction } from "../actions";
import { flashFrom, requireDataEditor } from "../_components/gate";
import { SubmitButton } from "../_components/submit-button";
import { EditorTabs, Flash, PageTitle, StatusBadge, When } from "../_components/ui";

export const metadata: Metadata = { title: "Connector runs" };

export default async function ConnectorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireDataEditor();
  const flash = flashFrom(await searchParams);
  const runs = await listImportRuns({ kinds: CONNECTORS.map((c) => c.kind), limit: 40 });
  return (
    <div>
      <EditorTabs active="/editor/connectors" />
      <PageTitle title="Connectors" />
      <Flash {...flash} />
      <p className="mb-4 text-sm text-muted-foreground">
        Each run lands as a <strong>draft</strong> with a comparison against the published version.
        Nothing is published until you review it. Weekly runs are scheduled by the worker (Sundays,
        Africa/Lagos).
      </p>
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        {CONNECTORS.map((c) => {
          const mode = connectorMode(c.kind);
          return (
            <Card key={c.kind}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {c.label}
                  <Badge variant={mode === "real" ? "success" : "secondary"}>{mode}</Badge>
                </CardTitle>
                <CardDescription>{c.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {mode === "mock" && (
                  <p className="text-xs text-muted-foreground">
                    Mock mode: no network call; produces clearly labelled SYNTHETIC values.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <form action={runConnectorAction}>
                    <input type="hidden" name="kind" value={c.kind} />
                    <SubmitButton size="sm" pendingText="Running…">
                      Run now
                    </SubmitButton>
                  </form>
                  <form action={queueConnectorAction}>
                    <input type="hidden" name="kind" value={c.kind} />
                    <Button type="submit" size="sm" variant="outline">
                      Queue for worker
                    </Button>
                  </form>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <h2 className="mb-2 font-semibold">Run history</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Run</TableHead>
            <TableHead>Connector</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Started</TableHead>
            <TableHead>Rows</TableHead>
            <TableHead>Draft</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-muted-foreground">
                No connector runs yet.
              </TableCell>
            </TableRow>
          )}
          {runs.map((r) => {
            const st = (r.stats ?? {}) as { rowsInserted?: number; rowsReceived?: number; mode?: string };
            return (
              <TableRow key={r.id}>
                <TableCell>
                  <Link href={`/editor/runs/${r.id}`} className="hover:underline">
                    #{r.id}
                  </Link>
                </TableCell>
                <TableCell>
                  {r.kind} {st.mode && <span className="text-xs text-muted-foreground">({st.mode})</span>}
                </TableCell>
                <TableCell>
                  <StatusBadge status={r.status} />
                </TableCell>
                <TableCell>
                  <When d={r.startedAt} />
                </TableCell>
                <TableCell>
                  {st.rowsInserted != null ? `${st.rowsInserted} / ${st.rowsReceived ?? "?"}` : "—"}
                </TableCell>
                <TableCell>
                  {r.datasetId ? (
                    <Link href={`/editor/drafts/${r.datasetId}`} className="hover:underline">
                      #{r.datasetId}
                    </Link>
                  ) : (
                    <span className="max-w-xs truncate text-xs text-red-700">{r.error ?? "—"}</span>
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
