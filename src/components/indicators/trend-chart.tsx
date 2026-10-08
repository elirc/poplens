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
import { formatCI, formatValue, type IndicatorMeta } from "@/lib/format";
import { buildTrendChartData, cleanPoints, type TrendSeriesInput } from "./trend-series";

/**
 * Trend line chart for one indicator across one or more places. Survey years
 * are drawn as dots; the line BREAKS where the source changes (separate
 * segment, dashed) and a vertical marker labels the change.
 */
export function TrendChart({
  title,
  meta,
  series,
  height = 200,
}: {
  title: string;
  meta: IndicatorMeta;
  series: TrendSeriesInput[];
  height?: number;
}) {
  const data = buildTrendChartData(series);
  const allPoints = series.flatMap((s) => s.points);
  const sourceNames = [...new Set(allPoints.map((p) => p.sourceName))];
  const anyEstimate = allPoints.some((p) => p.isEstimate);
  const years =
    data.years.length > 1
      ? `${data.years[0]}–${data.years[data.years.length - 1]}`
      : (data.years[0] ?? null);
  const changeYears = [...new Set(data.changes.map((c) => c.year))];
  const fmt = (v: number) => formatValue(v, meta);

  const table = (
    <div className="max-h-72 overflow-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="py-1 pr-2 font-medium">Place</th>
            <th className="py-1 pr-2 font-medium">Year</th>
            <th className="py-1 pr-2 text-right font-medium">Value</th>
            <th className="py-1 pr-2 font-medium">Source</th>
          </tr>
        </thead>
        <tbody>
          {series.flatMap((s) =>
            cleanPoints(s.points).map((p) => (
              <tr key={`${s.key}-${p.year}-${p.sourceId}`} className="border-b border-border/60">
                <td className="py-1 pr-2">{s.label}</td>
                <td className="py-1 pr-2 tabular-nums">{p.year}</td>
                <td className="py-1 pr-2 text-right tabular-nums">
                  {fmt(p.value)} {formatCI(p.lower, p.upper, meta)}
                </td>
                <td className="py-1 pr-2">
                  {p.sourceName}
                  {p.isEstimate ? " · estimate" : ""}
                </td>
              </tr>
            )),
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <ChartFrame
      title={title}
      table={table}
      source={
        <SourceLine
          sourceName={sourceNames.join("; ") || "—"}
          year={years}
          isEstimate={anyEstimate}
        />
      }
      footnote={
        data.changes.length > 0
          ? `Source changes: ${data.changes
              .map((c) => `${c.seriesLabel} ${c.year} (${c.from} → ${c.to})`)
              .join("; ")}. Values from different sources are not joined into one line.`
          : undefined
      }
    >
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="currentColor" strokeOpacity={0.08} vertical={false} />
            <XAxis
              dataKey="year"
              type="number"
              domain={["dataMin", "dataMax"]}
              ticks={data.years}
              allowDecimals={false}
              tick={{ fontSize: 11 }}
              padding={{ left: 12, right: 12 }}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              width={48}
              tickFormatter={(v: number) => fmt(v)}
            />
            <Tooltip
              formatter={(v, name) => {
                const line = data.lines.find((l) => l.dataKey === name);
                return [
                  typeof v === "number" ? fmt(v) : String(v),
                  line ? `${line.label} (${line.sourceName})` : String(name),
                ];
              }}
              labelFormatter={(y) => `Year ${y}`}
            />
            {changeYears.map((y) => (
              <ReferenceLine
                key={`chg-${y}`}
                x={y}
                stroke="#555"
                strokeDasharray="2 3"
                label={{ value: "Source change", position: "insideTopLeft", fontSize: 10 }}
              />
            ))}
            {data.lines.map((l) => (
              <Line
                key={l.dataKey}
                dataKey={l.dataKey}
                stroke={l.color}
                strokeWidth={2}
                strokeDasharray={l.segment % 2 === 1 ? "5 3" : undefined}
                dot={{ r: 3, fill: l.color }}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {series
          .filter((s) => s.points.length > 0)
          .map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block h-0.5 w-4"
                style={{ backgroundColor: s.color }}
              />
              {s.label}
            </li>
          ))}
        <li>Dots mark years with data</li>
      </ul>
    </ChartFrame>
  );
}
