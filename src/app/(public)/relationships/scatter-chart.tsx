"use client";

import Link from "next/link";
import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { ChartFrame } from "@/components/data/chart-frame";
import { SourceLine } from "@/components/data/source-line";
import { formatValue } from "@/lib/format";
import { OKABE_ITO } from "@/components/analytics/palette";
import { unitSuffix } from "@/components/analytics/format";
import type { RelationshipsData, ScatterPoint } from "@/components/analytics/types";

export const CAUSATION_NOTE =
  "Correlation is not causation — a relationship here may reflect other factors.";

/** Pad a numeric extent so points don't sit on the axes. */
function extent(values: number[]): [number, number] {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = hi === lo ? Math.max(1, Math.abs(hi) * 0.1) : (hi - lo) * 0.06;
  return [lo - pad, hi + pad];
}

/**
 * Scatter of two indicators across states: one dot per state with BOTH
 * values, hover label (state + both values), least-squares line only when
 * the statistics exist (n ≥ 3, non-zero variance).
 */
export function RelationshipScatter({ data }: { data: RelationshipsData }) {
  const { x, y, points, stats, year } = data;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xDomain = points.length ? extent(xs) : ([0, 1] as [number, number]);
  const yDomain = points.length ? extent(ys) : ([0, 1] as [number, number]);
  const line =
    stats.slope != null && stats.intercept != null
      ? [
          { x: xDomain[0], y: stats.intercept + stats.slope * xDomain[0] },
          { x: xDomain[1], y: stats.intercept + stats.slope * xDomain[1] },
        ]
      : null;

  const xSources = [...new Set(points.map((p) => p.xSource))].join("; ");
  const ySources = [...new Set(points.map((p) => p.ySource))].join("; ");
  const anyEst = points.some((p) => p.xEstimate || p.yEstimate);
  const title = `${y.name} vs ${x.name}, states${year ? `, ${year}` : ""}`;

  const table = (
    <div className="max-h-80 overflow-auto">
      <table className="w-full text-xs">
        <caption className="sr-only">{title}</caption>
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="py-1 pr-2 font-medium">State</th>
            <th className="py-1 pr-2 text-right font-medium">{x.name} (x)</th>
            <th className="py-1 pr-2 text-right font-medium">{y.name} (y)</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.code} className="border-b border-border/60">
              <td className="py-1 pr-2">
                <Link href={`/places/${encodeURIComponent(p.code)}`} className="underline-offset-2 hover:underline">
                  {p.name}
                </Link>
              </td>
              <td className="py-1 pr-2 text-right tabular-nums">
                {formatValue(p.x, x)}
                {p.xEstimate ? " est." : ""}
              </td>
              <td className="py-1 pr-2 text-right tabular-nums">
                {formatValue(p.y, y)}
                {p.yEstimate ? " est." : ""}
              </td>
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
      footnote={
        line
          ? "Line: least-squares fit across the plotted states. Each dot is one state."
          : "No trend line: " + (stats.skipText ?? "not enough data.")
      }
      source={
        <SourceLine
          sourceName={points.length ? `x: ${xSources}; y: ${ySources}` : "No published source"}
          year={year}
          isEstimate={anyEst}
        />
      }
    >
      <div className="h-80 w-full sm:h-96">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 16, bottom: 28, left: 8 }}>
            <CartesianGrid stroke="currentColor" strokeOpacity={0.08} />
            <XAxis
              type="number"
              dataKey="x"
              name={x.name}
              domain={xDomain}
              tickFormatter={(v: number) => formatValue(v, x)}
              tick={{ fontSize: 11 }}
              label={{
                value: `${x.name}${unitSuffix(x)}`,
                position: "insideBottom",
                offset: -18,
                fontSize: 11,
              }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name={y.name}
              domain={yDomain}
              width={56}
              tickFormatter={(v: number) => formatValue(v, y)}
              tick={{ fontSize: 11 }}
              label={{
                value: `${y.name}${unitSuffix(y)}`,
                angle: -90,
                position: "insideLeft",
                offset: 4,
                fontSize: 11,
                style: { textAnchor: "middle" },
              }}
            />
            <ZAxis range={[48, 48]} />
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                const p = active ? (payload?.[0]?.payload as ScatterPoint | undefined) : undefined;
                if (!p) return null;
                return (
                  <div className="rounded-md border border-border bg-background p-2 text-xs shadow-sm">
                    <p className="font-medium">{p.name}</p>
                    <p>
                      {x.name}: <span className="tabular-nums">{formatValue(p.x, x)}</span>
                      {unitSuffix(x)}
                    </p>
                    <p>
                      {y.name}: <span className="tabular-nums">{formatValue(p.y, y)}</span>
                      {unitSuffix(y)}
                    </p>
                  </div>
                );
              }}
            />
            {line && (
              <ReferenceLine
                segment={line}
                stroke="#D55E00"
                strokeWidth={2}
                strokeDasharray="6 3"
                ifOverflow="hidden"
              />
            )}
            <Scatter
              data={points}
              fill={OKABE_ITO[0]}
              fillOpacity={0.8}
              stroke="#ffffff"
              strokeWidth={1}
              isAnimationActive={false}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}
