"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartFrame } from "@/components/data/chart-frame";
import { SourceLine } from "@/components/data/source-line";
import { formatCI, formatValue } from "@/lib/format";
import type { BarRow, ChartIndicator } from "./types";

/** Okabe-Ito blue (colour-blind-safe), consistent across story/embed bars. */
const BAR_COLOR = "#0072B2";

/**
 * Horizontal bar chart (bar + top5 shortcodes) in ChartFrame with a real
 * table view. Places without data are listed as "No data", never drawn as 0.
 */
export function BarChartView({
  title,
  indicator,
  rows,
  missing,
  year,
  ranked,
  footnote,
  compact,
}: {
  title: string;
  indicator: ChartIndicator;
  rows: BarRow[];
  missing: Array<{ code: string; name: string }>;
  year: number | null;
  ranked?: boolean;
  footnote?: string | null;
  compact?: boolean;
}) {
  const fmt = (v: number) => formatValue(v, indicator);
  const sourceNames = [...new Set(rows.map((r) => r.sourceName))];
  const years = [...new Set(rows.map((r) => r.year))].sort((a, b) => a - b);
  const yearLabel =
    year ?? (years.length > 1 ? `${years[0]}–${years[years.length - 1]}` : (years[0] ?? null));
  const data = rows.map((r) => ({
    label: ranked && r.rank != null ? `${r.rank}. ${r.name}` : r.name,
    value: r.value,
    row: r,
  }));
  const height = Math.max(120, data.length * (compact ? 30 : 36) + 32);
  const notes = [
    footnote,
    missing.length > 0 ? `No data: ${missing.map((m) => m.name).join(", ")}.` : null,
    !year && years.length > 1 ? "Each place shows its latest available year." : null,
  ].filter(Boolean);

  const table = (
    <div className="max-h-72 overflow-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            {ranked && <th className="py-1 pr-2 font-medium">Rank</th>}
            <th className="py-1 pr-2 font-medium">Place</th>
            <th className="py-1 pr-2 text-right font-medium">Value</th>
            <th className="py-1 pr-2 font-medium">Year</th>
            <th className="py-1 pr-2 font-medium">Source</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.code} className="border-b border-border/60">
              {ranked && <td className="py-1 pr-2 tabular-nums">{r.rank}</td>}
              <td className="py-1 pr-2">{r.name}</td>
              <td className="py-1 pr-2 text-right tabular-nums">
                {fmt(r.value)} {formatCI(r.lower, r.upper, indicator)}
              </td>
              <td className="py-1 pr-2 tabular-nums">{r.year}</td>
              <td className="py-1 pr-2">
                {r.sourceName}
                {r.isEstimate ? " · estimate" : ""}
              </td>
            </tr>
          ))}
          {missing.map((m) => (
            <tr key={m.code} className="border-b border-border/60 text-muted-foreground">
              {ranked && <td className="py-1 pr-2">—</td>}
              <td className="py-1 pr-2">{m.name}</td>
              <td className="py-1 pr-2 text-right">No data</td>
              <td className="py-1 pr-2">—</td>
              <td className="py-1 pr-2">—</td>
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
      source={
        <SourceLine
          sourceName={sourceNames.join("; ") || "—"}
          year={yearLabel}
          isEstimate={rows.some((r) => r.isEstimate)}
        />
      }
      footnote={notes.length > 0 ? notes.join(" ") : undefined}
    >
      {data.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No data</p>
      ) : (
        <div style={{ height }} className="w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 4 }}>
              <CartesianGrid stroke="currentColor" strokeOpacity={0.08} horizontal={false} />
              <XAxis
                type="number"
                domain={[0, "auto"]}
                tick={{ fontSize: 11 }}
                tickFormatter={(v: number) => fmt(v)}
              />
              <YAxis type="category" dataKey="label" width={compact ? 96 : 120} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(v, _n, item) => {
                  const r = (item?.payload as { row?: BarRow } | undefined)?.row;
                  const ci = r ? formatCI(r.lower, r.upper, indicator) : "";
                  return [`${typeof v === "number" ? fmt(v) : String(v)} ${ci}`.trim(), indicator.name];
                }}
              />
              <Bar dataKey="value" fill={BAR_COLOR} radius={[0, 3, 3, 0]} isAnimationActive={false}>
                <LabelList
                  dataKey="value"
                  position="right"
                  fontSize={11}
                  formatter={(v: unknown) => (typeof v === "number" ? fmt(v) : "")}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartFrame>
  );
}
