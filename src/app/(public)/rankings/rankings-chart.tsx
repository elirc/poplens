"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ErrorBar,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartFrame } from "@/components/data/chart-frame";
import { SourceLine } from "@/components/data/source-line";
import { formatCI, formatValue } from "@/lib/format";
import { OKABE_ITO } from "@/components/analytics/palette";
import { anyEstimate, fmtWithCI, sourcesOf, unitSuffix } from "@/components/analytics/format";
import { ordinal } from "@/components/analytics/rank-format";
import type { IndicatorOption, RankingRow } from "@/components/analytics/types";

const TOP_N = 15;
const ROW_PX = 24;

interface ChartRow {
  label: string;
  value: number;
  err: [number, number] | null;
  row: RankingRow;
}

/** Horizontal bars in rank order: top N with a "show all" expand. */
export function RankingsChart({
  rows,
  indicator,
  year,
  levelPlural,
}: {
  rows: RankingRow[];
  indicator: IndicatorOption;
  year: number | null;
  levelPlural: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? rows : rows.slice(0, TOP_N);
  const data: ChartRow[] = shown.map((r) => ({
    label: `${r.rank}. ${r.name}`,
    value: r.cell.value,
    err:
      r.cell.lower != null && r.cell.upper != null
        ? [Math.max(0, r.cell.value - r.cell.lower), Math.max(0, r.cell.upper - r.cell.value)]
        : null,
    row: r,
  }));
  const cells = rows.map((r) => r.cell);
  const maxVal = Math.max(0, ...shown.map((r) => r.cell.upper ?? r.cell.value));
  const minVal = Math.min(0, ...shown.map((r) => r.cell.lower ?? r.cell.value));
  const height = Math.max(140, data.length * ROW_PX + 40);
  const title = `${indicator.name}${year ? `, ${year}` : ""} — ${
    showAll || rows.length <= TOP_N ? `all ${rows.length} ranked ${levelPlural}` : `top ${TOP_N} of ${rows.length}`
  }`;

  const table = (
    <div className="max-h-80 overflow-auto">
      <table className="w-full text-xs">
        <caption className="sr-only">{title}</caption>
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="py-1 pr-2 font-medium">Rank</th>
            <th className="py-1 pr-2 font-medium">Place</th>
            <th className="py-1 pr-2 text-right font-medium">Value</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.code} className="border-b border-border/60">
              <td className="py-1 pr-2 tabular-nums">{r.rank}</td>
              <td className="py-1 pr-2">{r.name}</td>
              <td className="py-1 pr-2 text-right tabular-nums">{fmtWithCI(r.cell, indicator)}</td>
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
      source={<SourceLine sourceName={sourcesOf(cells)} year={year} isEstimate={anyEstimate(cells)} />}
      footnote={data.some((d) => d.err) ? "Whiskers show the source's confidence interval." : undefined}
    >
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }} barCategoryGap="18%">
            <CartesianGrid stroke="currentColor" strokeOpacity={0.08} horizontal={false} />
            <XAxis
              type="number"
              domain={[minVal, maxVal * 1.05 || 1]}
              tickFormatter={(v: number) => formatValue(v, indicator)}
              tick={{ fontSize: 11 }}
            />
            <YAxis type="category" dataKey="label" width={130} tick={{ fontSize: 11 }} interval={0} />
            <Tooltip
              cursor={{ fillOpacity: 0.06 }}
              content={({ active, payload }) => {
                const d = active ? (payload?.[0]?.payload as ChartRow | undefined) : undefined;
                if (!d) return null;
                const c = d.row.cell;
                return (
                  <div className="rounded-md border border-border bg-background p-2 text-xs shadow-sm">
                    <p className="font-medium">
                      {d.row.name}
                      {d.row.parent ? `, ${d.row.parent}` : ""}
                    </p>
                    <p className="tabular-nums">
                      {formatValue(c.value, indicator)}
                      {unitSuffix(indicator)} {formatCI(c.lower, c.upper, indicator)}
                    </p>
                    <p>
                      {ordinal(d.row.rank)} of {d.row.outOf}
                    </p>
                    <p className="text-muted-foreground">
                      {c.source} · {c.year}
                      {c.isEstimate ? " · estimate" : ""}
                    </p>
                  </div>
                );
              }}
            />
            <Bar dataKey="value" fill={OKABE_ITO[0]} isAnimationActive={false} radius={[0, 3, 3, 0]}>
              <ErrorBar dataKey="err" direction="x" width={5} stroke="#111827" strokeWidth={1} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {rows.length > TOP_N && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          aria-expanded={showAll}
          className="mt-2 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted"
        >
          {showAll ? `Show top ${TOP_N} only` : `Show all ${rows.length}`}
        </button>
      )}
    </ChartFrame>
  );
}
