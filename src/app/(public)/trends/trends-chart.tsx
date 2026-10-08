"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartFrame } from "@/components/data/chart-frame";
import { SourceLine } from "@/components/data/source-line";
import { formatCI, formatValue } from "@/lib/format";
import { buildTrendChartData, type TrendSeriesInput } from "@/components/indicators/trend-series";
import { anyEstimate, fmtWithCI, sourcesOf, unitSuffix, yearsOf, zeroBased } from "@/components/analytics/format";
import type { IndicatorOption, TrendPlaceSeries, ValueCell } from "@/components/analytics/types";

export const SOURCE_BREAK_NOTE = "Sources differ — segments are not directly comparable.";

/**
 * Indicator over time, one line per place. Every year with data is a dot
 * (survey/period label in tooltip, table and the period list). Each series
 * is split into same-source segments (buildTrendChartData): the line BREAKS
 * where sourceId changes, the new segment is dashed, a vertical "Source
 * change" marker is drawn and the spec footnote is shown.
 */
export function TrendsChart({
  indicator,
  series,
  colors,
}: {
  indicator: IndicatorOption;
  series: TrendPlaceSeries[];
  colors: string[];
}) {
  const inputs: TrendSeriesInput[] = series.map((s, i) => ({
    key: s.code.replace(/[^A-Za-z0-9_]/g, "_"),
    label: s.name,
    color: colors[i]!,
    points: s.points.map((p) => ({
      year: p.year,
      value: p.value,
      lower: p.lower,
      upper: p.upper,
      isEstimate: p.isEstimate,
      sourceId: p.sourceId,
      sourceName: p.source,
    })),
  }));
  const data = buildTrendChartData(inputs);
  // Look-up for tooltip details: (series key, year, source label) → original cell.
  const cellAt = new Map<string, ValueCell>();
  inputs.forEach((inp, i) => {
    for (const c of series[i]!.points) cellAt.set(`${inp.key}:${c.year}:${c.source}`, c);
  });
  const lineMeta = new Map(data.lines.map((l) => [l.dataKey, l]));
  const allCells = series.flatMap((s) => s.points);
  const changeYears = [...new Set(data.changes.map((c) => c.year))];
  const periodLabels = new Map<number, Set<string>>();
  for (const c of allCells) {
    if (!c.periodLabel) continue;
    const set = periodLabels.get(c.year) ?? new Set<string>();
    set.add(c.periodLabel);
    periodLabels.set(c.year, set);
  }
  const tick = (v: number) => formatValue(v, indicator);
  const title = `${indicator.name}${unitSuffix(indicator)}`;

  const table = (
    <div className="max-h-80 overflow-auto">
      <table className="w-full text-xs">
        <caption className="sr-only">{title} over time</caption>
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="py-1 pr-2 font-medium">Place</th>
            <th className="py-1 pr-2 font-medium">Year</th>
            <th className="py-1 pr-2 font-medium">Period</th>
            <th className="py-1 pr-2 text-right font-medium">Value</th>
            <th className="py-1 pr-2 font-medium">Source</th>
          </tr>
        </thead>
        <tbody>
          {series.flatMap((s) =>
            s.points.map((p) => (
              <tr key={`${s.code}-${p.year}-${p.sourceId}`} className="border-b border-border/60">
                <td className="py-1 pr-2">{s.name}</td>
                <td className="py-1 pr-2 tabular-nums">{p.year}</td>
                <td className="py-1 pr-2 text-muted-foreground">{p.periodLabel ?? "—"}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{fmtWithCI(p, indicator)}</td>
                <td className="py-1 pr-2 text-muted-foreground">
                  {p.source}
                  {p.isEstimate ? " · estimate" : ""}
                </td>
              </tr>
            )),
          )}
        </tbody>
      </table>
    </div>
  );

  const footnote =
    data.changes.length > 0 ? (
      <>
        <strong className="font-medium text-foreground">{SOURCE_BREAK_NOTE}</strong>{" "}
        Source changes:{" "}
        {data.changes.map((c) => `${c.seriesLabel} ${c.year} (${c.from} → ${c.to})`).join("; ")}.
      </>
    ) : undefined;

  return (
    <ChartFrame
      title={title}
      table={table}
      footnote={footnote}
      source={
        <SourceLine sourceName={sourcesOf(allCells)} year={yearsOf(allCells)} isEstimate={anyEstimate(allCells)} />
      }
    >
      <div className="h-72 w-full sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.rows} margin={{ top: 16, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="currentColor" strokeOpacity={0.08} vertical={false} />
            <XAxis
              dataKey="year"
              type="number"
              domain={["dataMin", "dataMax"]}
              ticks={data.years}
              allowDecimals={false}
              tick={{ fontSize: 11 }}
              padding={{ left: 16, right: 16 }}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              width={52}
              tickFormatter={tick}
              domain={zeroBased(indicator) ? [0, "auto"] : ["auto", "auto"]}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const items = payload
                  .filter((p) => typeof p.value === "number")
                  .map((p) => {
                    const l = lineMeta.get(String(p.dataKey));
                    if (!l) return null;
                    const row = p.payload as Record<string, number | null>;
                    const cell = cellAt.get(`${l.seriesKey}:${row.year}:${l.sourceName}`);
                    return { l, cell, value: p.value as number };
                  })
                  .filter((x): x is NonNullable<typeof x> => x != null);
                return (
                  <div className="max-w-[260px] rounded-md border border-border bg-background p-2 text-xs shadow-sm">
                    <p className="mb-1 font-medium">{label}</p>
                    <ul className="space-y-1">
                      {items.map(({ l, cell, value }) => (
                        <li key={l.dataKey}>
                          <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: l.color }} />
                          <span className="font-medium">{l.label}</span>:{" "}
                          <span className="tabular-nums">
                            {formatValue(value, indicator)} {cell ? formatCI(cell.lower, cell.upper, indicator) : ""}
                          </span>
                          <span className="block text-muted-foreground">
                            {cell?.periodLabel ? `${cell.periodLabel} · ` : ""}
                            {l.sourceName}
                            {cell?.isEstimate ? " · estimate" : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              }}
            />
            {changeYears.map((y) => (
              <ReferenceLine
                key={`chg-${y}`}
                x={y}
                stroke="#6b7280"
                strokeDasharray="2 3"
                label={{ value: "Source change", position: "insideTopLeft", fontSize: 10, fill: "#374151" }}
              />
            ))}
            {data.lines.map((l) => (
              <Line
                key={l.dataKey}
                dataKey={l.dataKey}
                name={l.label}
                stroke={l.color}
                strokeWidth={2}
                strokeDasharray={l.segment % 2 === 1 ? "6 4" : undefined}
                dot={{ r: 3.5, fill: l.segment > 0 ? "#ffffff" : l.color, stroke: l.color, strokeWidth: 2 }}
                activeDot={{ r: 5 }}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {series.map((s, i) => (
          <li key={s.code} className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-0.5 w-4" style={{ backgroundColor: colors[i] }} />
            {s.name}
            {s.points.length === 0 && " — No data"}
          </li>
        ))}
        <li>Dots mark years with data{data.changes.length ? "; hollow dots and dashes follow a source change" : ""}</li>
      </ul>
      {periodLabels.size > 0 && (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
          {[...periodLabels.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([year, labels]) => (
              <div key={year} className="contents">
                <dt className="tabular-nums font-medium">{year}</dt>
                <dd className="text-muted-foreground">{[...labels].join("; ")}</dd>
              </div>
            ))}
        </dl>
      )}
    </ChartFrame>
  );
}
