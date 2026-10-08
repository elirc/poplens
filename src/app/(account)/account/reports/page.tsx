import type { Metadata } from "next";
import Link from "next/link";
import { getUserPlan } from "@/lib/limits";
import { requireUser } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, Checkbox } from "@/components/ui/misc";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SubmitButton } from "@/components/account/submit-button";
import { AccountNav, Flash, flashFrom, PageTitle, When } from "@/components/account/ui";
import { listGeoUnits } from "@/server/geo/queries";
import { listIndicators } from "@/server/indicators/queries";
import { listReportsForUser } from "@/server/reports/build";
import { MAX_REPORT_INDICATORS, MAX_REPORT_PLACES } from "@/server/reports/params";
import { buildReportNowAction, createReportAction } from "../actions";

export const metadata: Metadata = { title: "Custom reports" };

const CATEGORY_LABELS: Record<string, string> = {
  population: "Population",
  health_outcomes: "Health outcomes",
  health_services: "Health services",
  living_conditions: "Living conditions",
  outbreaks: "Outbreaks",
};

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "ready" ? "success" : status === "failed" ? "destructive" : status === "building" ? "warning" : "secondary";
  return <Badge variant={variant}>{status}</Badge>;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const flash = flashFrom(await searchParams);
  const [plan, reports] = await Promise.all([getUserPlan(user.id), listReportsForUser(user.id)]);
  const allowed = plan.limits.customReports;
  const [states, indicators] = allowed ? await Promise.all([listGeoUnits("state"), listIndicators()]) : [[], []];
  const byCategory = new Map<string, typeof indicators>();
  for (const i of indicators) byCategory.set(i.category, [...(byCategory.get(i.category) ?? []), i]);
  const inFlight = reports.some((r) => r.status === "pending" || r.status === "building");
  const thisYear = new Date().getFullYear();

  return (
    <div>
      {inFlight && <meta httpEquiv="refresh" content="5" />}
      <AccountNav active="/account/reports" />
      <PageTitle title="Custom reports" />
      <Flash {...flash} />

      {reports.length > 0 && (
        <div className="mb-8">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Report</TableHead>
                <TableHead>Requested</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.map((r) => {
                const p = r.params as { placeCodes?: string[]; indicatorCodes?: string[]; year?: number };
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <p className="font-medium">{r.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.placeCodes?.length ?? 0} places · {p.indicatorCodes?.length ?? 0} indicators
                        {p.year ? ` · ${p.year}` : " · latest year"}
                      </p>
                      {r.status === "failed" && r.error && <p className="text-xs text-red-700">{r.error}</p>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      <When d={r.createdAt} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      {r.status === "ready" ? (
                        <a
                          href={`/account/reports/${r.id}/pdf`}
                          className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                        >
                          Download PDF
                        </a>
                      ) : allowed ? (
                        <form action={buildReportNowAction} className="inline">
                          <input type="hidden" name="id" value={r.id} />
                          <SubmitButton size="sm" variant="outline" pendingText="Building…">
                            {r.status === "failed" ? "Retry" : "Build now"}
                          </SubmitButton>
                        </form>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {!allowed ? (
        <Alert variant="warning">
          Custom PDF reports are part of the Pro and Organisation plans.{" "}
          <Link href="/account/billing?plan=pro" className="underline">
            Upgrade
          </Link>{" "}
          to build reports with charts, tables, maps and sources for any places and indicators.
        </Alert>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Build a report</CardTitle>
            <CardDescription>
              Choose up to {MAX_REPORT_PLACES} places and {MAX_REPORT_INDICATORS} indicators. The PDF includes a table,
              bar chart and trend for each indicator, location maps, and every source with its licence.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createReportAction} className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="title">Title</Label>
                  <Input id="title" name="title" maxLength={140} placeholder="e.g. Maternal health in the North West" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="year">Year (optional)</Label>
                  <Input id="year" name="year" type="number" min={1990} max={thisYear} placeholder="Latest available" />
                </div>
              </div>

              <fieldset>
                <legend className="mb-2 text-sm font-medium">Places</legend>
                <div className="grid max-h-64 grid-cols-2 gap-x-4 gap-y-1.5 overflow-y-auto rounded-md border border-border p-3 text-sm sm:grid-cols-3">
                  <label className="flex items-center gap-2">
                    <Checkbox name="place" value="NG" /> Nigeria
                  </label>
                  {states.map((s) => (
                    <label key={s.code} className="flex items-center gap-2">
                      <Checkbox name="place" value={s.code} /> {s.name}
                    </label>
                  ))}
                </div>
                <div className="mt-2 space-y-1.5">
                  <Label htmlFor="extraPlaces">LGA or ward codes (optional, comma-separated)</Label>
                  <Input id="extraPlaces" name="extraPlaces" placeholder="e.g. NG-KN-GWALE" />
                  <p className="text-xs text-muted-foreground">Codes are shown on each place profile.</p>
                </div>
              </fieldset>

              <fieldset>
                <legend className="mb-2 text-sm font-medium">Indicators</legend>
                <div className="max-h-80 space-y-3 overflow-y-auto rounded-md border border-border p-3 text-sm">
                  {[...byCategory.entries()].map(([cat, list]) => (
                    <div key={cat}>
                      <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">{CATEGORY_LABELS[cat] ?? cat}</p>
                      <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
                        {list.map((i) => (
                          <label key={i.code} className="flex items-center gap-2">
                            <Checkbox name="indicator" value={i.code} /> {i.name}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </fieldset>

              <SubmitButton pendingText="Requesting…">Build PDF report</SubmitButton>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
