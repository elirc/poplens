"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Alert } from "@/components/ui/misc";
import { SourceLine } from "@/components/data/source-line";
import { ControlPanel, SelectField } from "@/components/analytics/controls";
import {
  epiCurve,
  pickWeek,
  statesForWeek,
  yearToDate,
} from "@/components/analytics/outbreak-series";
import { DISEASES, DISEASE_LABEL, outbreaksHref, type Disease } from "@/components/analytics/params";
import type { OutbreaksData } from "@/components/analytics/types";
import { useUrlNav } from "@/components/analytics/use-url-nav";
import { NO_DATA } from "@/lib/format";
import { EpiCurve } from "./epi-curve";
import { OutbreakMap } from "./outbreak-map";
import { cases } from "./outbreak-format";

/**
 * Outbreaks: disease tabs, a week scrubber, a state map for the selected
 * week, the national epi curve and a per-state table. Disease/year changes
 * navigate (server data); week scrubbing is client-side over the year's rows
 * and mirrored into the URL with replaceState, so every view is shareable.
 */
export function OutbreaksView({
  data,
  requestedWeek,
  styleUrl,
}: {
  data: OutbreaksData;
  requestedWeek: number | null;
  styleUrl: string;
}) {
  const { go, pending } = useUrlNav();
  const [week, setWeekState] = useState<number | null>(() => pickWeek(requestedWeek, data.lastWeek));
  const label = DISEASE_LABEL[data.disease];
  const sourceName = data.sources.length ? data.sources.join("; ") : "No published source";

  const setWeek = (w: number) => {
    if (data.lastWeek == null) return;
    const next = Math.max(1, Math.min(data.lastWeek, w));
    setWeekState(next);
    window.history.replaceState(
      null,
      "",
      outbreaksHref({ disease: data.disease, year: data.year, week: next }),
    );
  };

  const curve = useMemo(() => epiCurve(data.rows, data.lastWeek), [data.rows, data.lastWeek]);
  const weekRows = useMemo(() => statesForWeek(data.rows, week), [data.rows, week]);
  const toDate = useMemo(() => yearToDate(data.rows, week), [data.rows, week]);
  const weekById = useMemo(() => new Map(weekRows.map((r) => [r.stateId, r])), [weekRows]);
  const nat = week != null ? curve[week - 1] : undefined;

  return (
    <div className="space-y-4">
      <nav aria-label="Disease" className="-mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0">
        <ul className="flex min-w-max gap-1 border-b border-border" role="tablist">
          {DISEASES.map((d: Disease) => {
            const active = d === data.disease;
            const has = data.diseasesWithData.includes(d);
            return (
              <li key={d} role="presentation">
                <button
                  type="button"
                  role="tab"
                  aria-selected={active}
                  disabled={pending}
                  onClick={() => !active && go(outbreaksHref({ disease: d }))}
                  className={`-mb-px border-b-2 px-3 py-2 text-sm ${
                    active
                      ? "border-emerald-600 font-medium text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {DISEASE_LABEL[d]}
                  {!has && <span className="ml-1 text-xs">(no data)</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {data.year == null || data.lastWeek == null || week == null ? (
        <Alert>
          {NO_DATA}: no published {label.toLowerCase()} reports yet. Outbreak figures are entered by
          staff from NCDC situation reports.
        </Alert>
      ) : (
        <>
          <ControlPanel pending={pending}>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,8rem)_minmax(0,1fr)] sm:items-end">
              <SelectField
                label="Year"
                value={data.year}
                options={[...data.years].reverse().map((y) => ({ value: y, label: String(y) }))}
                onChange={(y) => go(outbreaksHref({ disease: data.disease, year: y }))}
                disabled={pending}
              />
              <div className="space-y-1">
                <label htmlFor="week-scrubber" className="text-xs font-medium text-muted-foreground">
                  Epi week <span className="text-foreground">{week}</span> of {data.year}
                  {nat && nat.reportingStates === 0 ? " · no report" : ""}
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setWeek(week - 1)}
                    disabled={week <= 1}
                    aria-label="Previous week"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border hover:bg-muted disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <input
                    id="week-scrubber"
                    type="range"
                    min={1}
                    max={data.lastWeek}
                    step={1}
                    value={week}
                    onChange={(e) => setWeek(Number(e.target.value))}
                    className="h-9 w-full accent-emerald-600"
                    aria-valuetext={`Week ${week}`}
                  />
                  <button
                    type="button"
                    onClick={() => setWeek(week + 1)}
                    disabled={week >= data.lastWeek}
                    aria-label="Next week"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border hover:bg-muted disabled:opacity-40"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
            {nat && nat.reportingStates > 0 && (
              <p className="mt-2 text-sm">
                Week {week}, all reporting states: <strong className="tabular-nums">{cases(nat.suspected)}</strong>{" "}
                suspected, <strong className="tabular-nums">{cases(nat.confirmed)}</strong> confirmed,{" "}
                <strong className="tabular-nums">{cases(nat.deaths)}</strong> deaths ({nat.reportingStates} states
                reporting).
              </p>
            )}
          </ControlPanel>

          <div className={pending ? "space-y-4 opacity-70 transition-opacity" : "space-y-4"}>
            <OutbreakMap
              weekRows={weekRows}
              styleUrl={styleUrl}
              diseaseLabel={label}
              week={week}
              year={data.year}
              sourceFooter={<SourceLine sourceName={sourceName} year={data.year} />}
            />

            <EpiCurve
              curve={curve}
              week={week}
              onWeek={setWeek}
              title={`${label} — weekly cases, Nigeria, ${data.year}`}
              sourceName={sourceName}
              year={data.year}
            />

            <section aria-labelledby="state-table" className="space-y-2">
              <h2 id="state-table" className="text-base font-semibold">
                By state — week {week} and year to date
              </h2>
              {toDate.length === 0 ? (
                <p className="text-sm text-muted-foreground">{NO_DATA}: no state has reported yet this year.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <caption className="sr-only">
                      {label} cases by state, epi week {week} {data.year} and weeks 1–{week}
                    </caption>
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th className="px-2 py-1.5 font-medium">State</th>
                        <th className="px-2 py-1.5 text-right font-medium">Week {week} suspected</th>
                        <th className="px-2 py-1.5 text-right font-medium">Week {week} confirmed</th>
                        <th className="px-2 py-1.5 text-right font-medium">Week {week} deaths</th>
                        <th className="px-2 py-1.5 text-right font-medium">Wk 1–{week} suspected</th>
                        <th className="px-2 py-1.5 text-right font-medium">Wk 1–{week} confirmed</th>
                        <th className="px-2 py-1.5 text-right font-medium">Wk 1–{week} deaths</th>
                      </tr>
                    </thead>
                    <tbody>
                      {toDate.map((s) => {
                        const w = weekById.get(s.stateId);
                        return (
                          <tr key={s.stateId} className="border-b border-border/60 last:border-0">
                            <td className="px-2 py-1.5">
                              <Link
                                href={`/places/${encodeURIComponent(s.code)}`}
                                className="font-medium text-emerald-800 underline-offset-2 hover:underline"
                              >
                                {s.name}
                              </Link>
                            </td>
                            <td className={`px-2 py-1.5 text-right tabular-nums ${w ? "" : "text-muted-foreground"}`}>
                              {cases(w?.suspected)}
                            </td>
                            <td className={`px-2 py-1.5 text-right tabular-nums ${w ? "" : "text-muted-foreground"}`}>
                              {cases(w?.confirmed)}
                            </td>
                            <td className={`px-2 py-1.5 text-right tabular-nums ${w ? "" : "text-muted-foreground"}`}>
                              {cases(w?.deaths)}
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{cases(s.suspected)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{cases(s.confirmed)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{cases(s.deaths)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Reported counts as published; “{NO_DATA}” means the state filed no report for that week. Year-to-date
                columns add only the weeks a state reported.
              </p>
              <SourceLine sourceName={sourceName} year={data.year} />
            </section>
          </div>
        </>
      )}
    </div>
  );
}
