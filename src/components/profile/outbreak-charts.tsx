"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartFrame } from "@/components/data/chart-frame";
import { SourceLine } from "@/components/data/source-line";
import { NO_DATA } from "@/lib/format";
import type { OutbreakHistory } from "./profile-data";

const DISEASE_LABEL: Record<string, string> = {
  cholera: "Cholera",
  lassa_fever: "Lassa fever",
  meningitis: "Meningitis",
  measles: "Measles",
};

const DISEASE_COLOR: Record<string, string> = {
  cholera: "#0072B2",
  lassa_fever: "#D55E00",
  meningitis: "#009E73",
  measles: "#CC79A7",
};

/**
 * Weekly confirmed cases per disease as small bar charts. Weeks without a
 * report are gaps (null), never zero bars.
 */
export function OutbreakCharts({ history }: { history: OutbreakHistory }) {
  const lastWeek = Math.max(...history.diseases.map((d) => d.maxWeek));
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {history.diseases.map((d) => {
        const byWeek = new Map(d.weeks.map((w) => [w.week, w.confirmed]));
        const rows = Array.from({ length: lastWeek }, (_, i) => ({
          week: i + 1,
          confirmed: byWeek.has(i + 1) ? byWeek.get(i + 1)! : null,
        }));
        const label = DISEASE_LABEL[d.disease] ?? d.disease;
        const reported = d.weeks.reduce((s, w) => s + (w.confirmed ?? 0), 0);
        const hasConfirmed = d.weeks.some((w) => w.confirmed != null);
        return (
          <ChartFrame
            key={d.disease}
            title={`${label} — confirmed cases by week, ${history.year}`}
            source={
              <SourceLine sourceName={history.sourceName} year={history.year} />
            }
            footnote={`${history.scopeLabel}. Total reported: ${
              hasConfirmed ? reported.toLocaleString("en-NG") : NO_DATA
            }. Weeks without a report are left blank, not counted as zero.`}
            table={
              <div className="max-h-56 overflow-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="py-1 pr-2 font-medium">Epi week</th>
                      <th className="py-1 pr-2 text-right font-medium">Confirmed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.weeks.map((w) => (
                      <tr key={w.week} className="border-b border-border/60">
                        <td className="py-1 pr-2">Week {w.week}</td>
                        <td className="py-1 pr-2 text-right tabular-nums">
                          {w.confirmed == null ? NO_DATA : w.confirmed.toLocaleString("en-NG")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            }
          >
            <div className="h-36 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <XAxis dataKey="week" tick={{ fontSize: 10 }} interval={4} />
                  <YAxis tick={{ fontSize: 10 }} width={32} allowDecimals={false} />
                  <Tooltip
                    formatter={(v) => [typeof v === "number" ? v : NO_DATA, "Confirmed"]}
                    labelFormatter={(w) => `Week ${w}`}
                  />
                  <Bar
                    dataKey="confirmed"
                    fill={DISEASE_COLOR[d.disease] ?? "#0072B2"}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartFrame>
        );
      })}
    </div>
  );
}
