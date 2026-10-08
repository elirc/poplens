"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartFrame } from "@/components/data/chart-frame";
import { SourceLine } from "@/components/data/source-line";
import { NO_DATA } from "@/lib/format";
import type { EpiWeek } from "@/components/analytics/outbreak-series";
import { cases } from "./outbreak-format";

const CONFIRMED_COLOR = "#0072B2";
const SUSPECTED_COLOR = "#56B4E9";

/**
 * National epi curve: weekly cases summed over reporting states, stacked as
 * confirmed + (suspected not confirmed) so each bar's height is the
 * suspected total. Weeks with no report are gaps, never zero bars. Clicking
 * a bar selects that week (map + table follow).
 */
export function EpiCurve({
  curve,
  week,
  onWeek,
  title,
  sourceName,
  year,
}: {
  curve: EpiWeek[];
  week: number | null;
  onWeek: (w: number) => void;
  title: string;
  sourceName: string;
  year: number | null;
}) {
  const table = (
    <div className="max-h-72 overflow-auto">
      <table className="w-full text-xs">
        <caption className="sr-only">{title}</caption>
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="py-1 pr-2 font-medium">Epi week</th>
            <th className="py-1 pr-2 text-right font-medium">Suspected</th>
            <th className="py-1 pr-2 text-right font-medium">Confirmed</th>
            <th className="py-1 pr-2 text-right font-medium">Deaths</th>
            <th className="py-1 pr-2 text-right font-medium">States reporting</th>
          </tr>
        </thead>
        <tbody>
          {curve.map((w) => (
            <tr key={w.week} className={`border-b border-border/60 ${w.week === week ? "bg-muted/60" : ""}`}>
              <td className="py-1 pr-2">Week {w.week}</td>
              <td className="py-1 pr-2 text-right tabular-nums">{cases(w.suspected)}</td>
              <td className="py-1 pr-2 text-right tabular-nums">{cases(w.confirmed)}</td>
              <td className="py-1 pr-2 text-right tabular-nums">{cases(w.deaths)}</td>
              <td className="py-1 pr-2 text-right tabular-nums">{w.reportingStates || NO_DATA}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <ChartFrame
      title={title}
      table={table}
      footnote="Bar height = suspected cases (darker part confirmed), summed over states that reported. Weeks without a report are blank, not zero. Tap a bar to select its week."
      source={<SourceLine sourceName={sourceName} year={year} />}
    >
      <div className="h-56 w-full sm:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={curve}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            barCategoryGap="12%"
            onClick={(s) => {
              const w = Number((s as { activeLabel?: string | number } | null)?.activeLabel);
              if (Number.isFinite(w) && w >= 1) onWeek(w);
            }}
            className="cursor-pointer"
          >
            <CartesianGrid stroke="currentColor" strokeOpacity={0.08} vertical={false} />
            <XAxis dataKey="week" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={8} />
            <YAxis tick={{ fontSize: 10 }} width={40} allowDecimals={false} tickFormatter={(v: number) => cases(v)} />
            <Tooltip
              cursor={{ fillOpacity: 0.08 }}
              content={({ active, payload }) => {
                const w = active ? (payload?.[0]?.payload as EpiWeek | undefined) : undefined;
                if (!w) return null;
                return (
                  <div className="rounded-md border border-border bg-background p-2 text-xs shadow-sm">
                    <p className="font-medium">Epi week {w.week}</p>
                    {w.reportingStates === 0 ? (
                      <p className="text-muted-foreground">No report</p>
                    ) : (
                      <>
                        <p>Suspected: {cases(w.suspected)}</p>
                        <p>Confirmed: {cases(w.confirmed)}</p>
                        <p>Deaths: {cases(w.deaths)}</p>
                        <p className="text-muted-foreground">{w.reportingStates} states reporting</p>
                      </>
                    )}
                  </div>
                );
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {week != null && (
              <ReferenceLine x={week} stroke="#111827" strokeWidth={1.5} strokeDasharray="3 2" ifOverflow="extendDomain" />
            )}
            <Bar
              dataKey="confirmed"
              name="Confirmed"
              stackId="cases"
              fill={CONFIRMED_COLOR}
              isAnimationActive={false}
            />
            <Bar
              dataKey="suspectedNotConfirmed"
              name="Suspected, not confirmed"
              stackId="cases"
              fill={SUSPECTED_COLOR}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}
