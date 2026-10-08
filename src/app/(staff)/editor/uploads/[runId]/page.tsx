import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Alert, Checkbox } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listIndicatorOptions } from "@/server/pipeline/admin";
import { getUploadSession, previewRows, type UploadSession } from "@/server/pipeline/uploads";
import type { IndicatorColumnMapping, OutbreakColumnMapping, ValidationReport } from "@/server/pipeline/types";
import {
  backToMappingAction,
  cancelUploadAction,
  createDraftAction,
  saveMappingAction,
  saveReviewAction,
} from "../../actions";
import { flashFrom, requireDataEditor } from "../../_components/gate";
import { SubmitButton } from "../../_components/submit-button";
import { EditorTabs, Flash, PageTitle } from "../../_components/ui";

export const metadata: Metadata = { title: "Upload wizard" };

const STEPS = ["Upload", "Map columns", "Review places", "Validate", "Draft"] as const;

function Steps({ current }: { current: number }) {
  return (
    <ol className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {STEPS.map((s, i) => (
        <li
          key={s}
          aria-current={i === current ? "step" : undefined}
          className={i === current ? "font-semibold text-foreground" : i < current ? "text-emerald-700" : "text-muted-foreground"}
        >
          {i + 1}. {s}
        </li>
      ))}
    </ol>
  );
}

function ColumnSelect({
  name,
  label,
  headers,
  value,
  required,
  hint,
}: {
  name: string;
  label: string;
  headers: string[];
  value: string | null | undefined;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`m-${name}`}>
        {label}
        {required && <span className="text-red-700"> *</span>}
      </Label>
      <Select id={`m-${name}`} name={name} defaultValue={value ?? ""} required={required}>
        <option value="">{required ? "Choose a column…" : "— not in file —"}</option>
        {headers.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </Select>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

async function MappingStep({ runId, session }: { runId: number; session: UploadSession }) {
  const [preview, indicators] = await Promise.all([previewRows(session), listIndicatorOptions()]);
  const h = session.headers;
  const m = session.mapping;
  return (
    <>
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Preview</CardTitle>
          <CardDescription>
            First {preview.length} of {session.rowCount.toLocaleString("en-NG")} rows of {session.fileName}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                {h.map((x) => (
                  <TableHead key={x}>{x}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.map((r, i) => (
                <TableRow key={i}>
                  {r.map((c, j) => (
                    <TableCell key={j} className="whitespace-nowrap">
                      {c || <span className="text-muted-foreground">·</span>}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Map columns</CardTitle>
          <CardDescription>Tell PopLens which column holds what. Guesses are pre-filled from the header names.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={saveMappingAction} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <input type="hidden" name="runId" value={runId} />
            <input type="hidden" name="kind" value={session.kind} />
            {session.kind === "outbreak_reports" ? (
              (() => {
                const om = m?.kind === "outbreak_reports" ? (m as OutbreakColumnMapping) : null;
                return (
                  <>
                    <ColumnSelect name="disease" label="Disease" headers={h} value={om?.disease} required hint="cholera, lassa fever, meningitis or measles" />
                    <ColumnSelect name="state" label="State" headers={h} value={om?.state} required />
                    <ColumnSelect name="year" label="Year" headers={h} value={om?.year} required />
                    <ColumnSelect name="week" label="Epi week" headers={h} value={om?.week} required hint="1–53" />
                    <ColumnSelect name="suspected" label="Suspected cases" headers={h} value={om?.suspected} />
                    <ColumnSelect name="confirmed" label="Confirmed cases" headers={h} value={om?.confirmed} />
                    <ColumnSelect name="deaths" label="Deaths" headers={h} value={om?.deaths} />
                  </>
                );
              })()
            ) : (
              (() => {
                const im = m?.kind === "indicator_values" ? (m as IndicatorColumnMapping) : null;
                return (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="m-level">
                        Place level<span className="text-red-700"> *</span>
                      </Label>
                      <Select id="m-level" name="level" defaultValue={im?.level ?? "state"}>
                        <option value="nation">Nation</option>
                        <option value="zone">Geopolitical zone</option>
                        <option value="state">State</option>
                        <option value="lga">LGA</option>
                        <option value="ward">Ward</option>
                      </Select>
                    </div>
                    <ColumnSelect name="place" label="Place name" headers={h} value={im?.place} required />
                    <ColumnSelect name="stateColumn" label="State (for LGAs/wards)" headers={h} value={im?.stateColumn} hint="Scopes matching to the right state — strongly recommended for LGAs." />
                    <ColumnSelect name="placeCode" label="Official place code" headers={h} value={im?.placeCode} hint="e.g. NG-KN; matched before names." />
                    <ColumnSelect name="year" label="Year / period" headers={h} value={im?.year} required />
                    <ColumnSelect name="value" label="Value" headers={h} value={im?.value} required />
                    <ColumnSelect name="indicatorColumn" label="Indicator code column" headers={h} value={im?.indicatorColumn} hint="Catalogue code or exact name per row…" />
                    <div className="space-y-1.5">
                      <Label htmlFor="m-fixedIndicator">…or one indicator for the whole file</Label>
                      <Select id="m-fixedIndicator" name="fixedIndicator" defaultValue={im?.fixedIndicator ?? ""}>
                        <option value="">— use the indicator column —</option>
                        {indicators.map((i) => (
                          <option key={i.code} value={i.code}>
                            {i.name} ({i.code}, {i.unit})
                          </option>
                        ))}
                      </Select>
                    </div>
                    <ColumnSelect name="lower" label="Lower bound (CI)" headers={h} value={im?.lower} />
                    <ColumnSelect name="upper" label="Upper bound (CI)" headers={h} value={im?.upper} />
                    <ColumnSelect name="sex" label="Sex" headers={h} value={im?.sex} hint="all / male / female" />
                    <ColumnSelect name="ageGroup" label="Age group" headers={h} value={im?.ageGroup} />
                    <ColumnSelect name="residence" label="Urban / rural" headers={h} value={im?.residence} />
                    <ColumnSelect name="note" label="Note" headers={h} value={im?.note} />
                    <div className="space-y-1.5">
                      <Label htmlFor="m-periodLabel">Period label (optional)</Label>
                      <Input id="m-periodLabel" name="periodLabel" defaultValue={im?.periodLabel ?? ""} placeholder="MICS 2021" />
                    </div>
                    <div className="flex items-center gap-2 self-end">
                      <Checkbox id="m-isEstimate" name="isEstimate" defaultChecked={im?.isEstimate ?? true} />
                      <Label htmlFor="m-isEstimate">Values are estimates (survey/modelled)</Label>
                    </div>
                  </>
                );
              })()
            )}
            <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-3">
              <SubmitButton pendingText="Matching places…">Save mapping and match places</SubmitButton>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}

function ReviewStep({ runId, session }: { runId: number; session: UploadSession }) {
  const pending = session.pending ?? [];
  const decisions = session.decisions ?? {};
  return (
    <Card>
      <CardHeader>
        <CardTitle>Review place matches</CardTitle>
        <CardDescription>
          {session.autoMatched ?? 0} place name(s) matched automatically by code, exact name or alias.{" "}
          {pending.length === 0
            ? "Nothing needs review."
            : `${pending.length} need a decision: pick the right place, type its official code, or exclude its rows.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={saveReviewAction} className="space-y-4">
          <input type="hidden" name="runId" value={runId} />
          {pending.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>In the file</TableHead>
                  <TableHead>Rows</TableHead>
                  <TableHead>Match</TableHead>
                  <TableHead>Or official code</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((p, i) => {
                  const d = decisions[p.key];
                  const def = d === null ? "exclude" : d != null ? String(d) : p.status === "review" && p.candidates[0] ? String(p.candidates[0].geoUnitId) : "";
                  return (
                    <TableRow key={p.key}>
                      <TableCell>
                        <input type="hidden" name="placeKey" value={p.key} />
                        <div className="font-medium">{p.rawName || "(blank)"}</div>
                        <div className="text-xs text-muted-foreground">
                          {p.level}
                          {p.stateName ? ` in ${p.stateName}` : ""} ·{" "}
                          <Badge variant={p.status === "review" ? "warning" : "destructive"}>
                            {p.status === "review" ? "uncertain" : "no match"}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>{p.rowCount}</TableCell>
                      <TableCell className="min-w-[14rem]">
                        <Select name={`choice_${i}`} defaultValue={def} aria-label={`Match for ${p.rawName}`}>
                          <option value="">— leave unresolved —</option>
                          {p.candidates.map((c) => (
                            <option key={c.geoUnitId} value={c.geoUnitId}>
                              {c.name} ({c.code}) · {Math.round(c.score * 100)}%
                            </option>
                          ))}
                          <option value="exclude">Exclude these rows</option>
                        </Select>
                      </TableCell>
                      <TableCell className="min-w-[9rem]">
                        <Input name={`code_${i}`} placeholder="NG-KN-GWALE" aria-label={`Official code for ${p.rawName}`} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          {pending.length > 0 && (
            <div className="flex items-center gap-2">
              <Checkbox id="saveAliases" name="saveAliases" defaultChecked />
              <Label htmlFor="saveAliases">Save confirmed matches as aliases so future uploads match automatically</Label>
            </div>
          )}
          <SubmitButton pendingText="Validating…">Confirm and validate</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

function ValidationStep({ runId, report }: { runId: number; report: ValidationReport }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Validation report</CardTitle>
        <CardDescription>
          {report.validRows.toLocaleString("en-NG")} of {report.totalRows.toLocaleString("en-NG")} rows are ready ·{" "}
          {report.errors} error type(s) · {report.warnings} warning type(s)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {report.ok ? (
          <Alert>No blocking errors. Warnings (if any) are recorded with the draft.</Alert>
        ) : (
          <Alert variant="destructive">
            Errors block the draft. Fix the file and upload it again, or go back and adjust the mapping /
            place matches.
          </Alert>
        )}
        {report.issues.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Severity</TableHead>
                <TableHead>Problem</TableHead>
                <TableHead>Rows (file row numbers, header excluded)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.issues.map((i, k) => (
                <TableRow key={k}>
                  <TableCell>
                    <Badge variant={i.severity === "error" ? "destructive" : "warning"}>{i.severity}</Badge>
                  </TableCell>
                  <TableCell>{i.message}</TableCell>
                  <TableCell className="max-w-md text-xs text-muted-foreground">
                    {i.rows.length === 0 ? "—" : `${i.rows.slice(0, 30).join(", ")}${i.rows.length > 30 ? ` … (${i.rows.length}${i.rows.length >= 200 ? "+" : ""})` : ""}`}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <div className="flex flex-wrap gap-2">
          {report.ok && (
            <form action={createDraftAction}>
              <input type="hidden" name="runId" value={runId} />
              <SubmitButton pendingText="Creating draft…">Create draft dataset</SubmitButton>
            </form>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default async function UploadWizardPage({
  params,
  searchParams,
}: {
  params: Promise<{ runId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireDataEditor();
  const { runId: raw } = await params;
  const sp = await searchParams;
  const flash = flashFrom(sp);
  const runId = Number(raw);
  if (!Number.isInteger(runId) || runId <= 0) notFound();
  const found = await getUploadSession(runId);
  if (!found) notFound();
  const { session } = found;

  const forceMapping = sp.step === "mapping" && session.stage !== "done" && session.stage !== "cancelled";
  const stepIndex = forceMapping
    ? 1
    : { mapping: 1, review: 2, validated: 3, done: 4, cancelled: 0 }[session.stage];

  return (
    <div>
      <EditorTabs active="/editor/uploads" />
      <PageTitle title={`Upload #${runId}: ${session.title}`}>
        {session.stage !== "done" && session.stage !== "cancelled" && (
          <>
            {session.stage !== "mapping" && !forceMapping && (
              <form action={backToMappingAction}>
                <input type="hidden" name="runId" value={runId} />
                <Button type="submit" size="sm" variant="outline">
                  Back to mapping
                </Button>
              </form>
            )}
            <form action={cancelUploadAction}>
              <input type="hidden" name="runId" value={runId} />
              <Button type="submit" size="sm" variant="ghost">
                Cancel upload
              </Button>
            </form>
          </>
        )}
      </PageTitle>
      <p className="mb-2 text-sm text-muted-foreground">
        {session.fileName} · {session.kind === "outbreak_reports" ? "weekly outbreak cases" : "indicator values"} · series{" "}
        <code>{session.seriesKey}</code>
        {session.isSynthetic && " · marked synthetic"}
      </p>
      <Steps current={stepIndex} />
      <Flash {...flash} />
      {session.stage === "cancelled" ? (
        <Alert>This upload was cancelled.</Alert>
      ) : session.stage === "done" ? (
        <Alert>
          Draft created.{" "}
          <Link className="underline" href={`/editor/drafts/${session.datasetId}`}>
            Review dataset #{session.datasetId}
          </Link>
        </Alert>
      ) : forceMapping || session.stage === "mapping" ? (
        <MappingStep runId={runId} session={session} />
      ) : session.stage === "review" ? (
        <ReviewStep runId={runId} session={session} />
      ) : (
        <div className="space-y-4">
          {session.validation && <ValidationStep runId={runId} report={session.validation} />}
          {(session.pending?.length ?? 0) > 0 && (
            <details className="rounded-lg border border-border p-3">
              <summary className="cursor-pointer text-sm font-medium">Change place decisions</summary>
              <div className="mt-3">
                <ReviewStep runId={runId} session={session} />
              </div>
            </details>
          )}
          <Link href="/editor/uploads" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Start a different upload
          </Link>
        </div>
      )}
    </div>
  );
}
