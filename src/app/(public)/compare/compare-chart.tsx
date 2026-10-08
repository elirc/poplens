"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ErrorBar,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Link from "next/link";
import { ChartFrame } from "@/components/data/chart-frame";
import { SourceLine } from "@/components/data/source-line";
import { formatCI, formatValue, NO_DATA } from "@/lib/format";
import { REFERENCE_COLOR } from "@/components/analytics/palette";
import { anyEstimate, fmtWithCI, sourcesOf, unitSuffix, yearsOf } from "@/components/analytics/format";
import type { CompareChartData, ValueCell } from "@/components/analytics/types";

interface BarRow {
  code: string;
  label: string;
  value: number;
  err: [number, number] | null;
  color: string;
  cell: ValueCell;
}

/**
 * One compare chart: a bar per place (horizontal — long state names fit on
 * phones), CI whiskers where the source gives bounds, and the national
 * figure as a reference line. Places without data are listed, never drawn
 * as zero-length bars.
 */
export function CompareChart({
  chart,
  colorFor,
}: {
  chart: CompareChartData;
  colorFor: (code: string) => string;
}) {
  const meta = chart.indicator;
  const labelYear = chart.mode === "latest-each";
  const rows: BarRow[] = chart.bars
    .filter((b) => b.cell)
    .map((b) => {
      const c = b.cell!;
      return {
        code: b.code,
        label: labelYear ? `${b.name} (${c.year})` : b.name,
        value: c.value,
        err:
          c.lower != null && c.upper != null
            ? [Math.max(0, c.value - c.lower), Math.max(0, c.upper - c.value)]
            : null,
        color: colorFor(b.code),
        cell: c,
      };
    });
  const missing = chart.bars.filter((b) => !b.cell);
  const national = chart.national;
  const allCells = [...chart.bars.map((b) => b.cell), national];

  const maxVal = Math.max(
    0,
    ...rows.map((r) => r.cell.upper ?? r.value),
    national?.value ?? 0,
  );
  const minVal = Math.min(0, ...rows.map((r) => r.cell.lower ?? r.value));
  const tick = (v: number) => formatValue(v, meta);
  const height = Math.max(120, rows.length * 44 + 48);

  const title =
    chart.mode === "common" && chart.year
      ? `${meta.name}, ${chart.year}`
      : chart.mode === "latest-each"
        ? `${meta.name}, latest year per place`
        : meta.name;

  const footnoteParts: string[] = [];
  if (chart.mode === "latest-each") {
    footnoteParts.push("The places have no year in common, so each shows its latest year (labelled). Values from different years are not directly comparable.");
  }
  if (rows.some((r) => r.err)) footnoteParts.push("Whiskers show the source's confidence interval.");
  if (national) {
    footnoteParts.push(
      `Dashed line: Nigeria ${national.year} = ${formatValue(national.value, meta)}${national.isEstimate ? " (estimate)" : ""}.`,
    );
  }
  if (missing.length) footnoteParts.push(`No data: ${missing.map((m) => m.name).join(", ")}.`);

  const table = (
    <div className="max-h-72 overflow-auto">
      <table className="w-full text-xs">
        <caption className="sr-only">{title}</caption>
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="py-1 pr-2 font-medium">Place</th>
            <th className="py-1 pr-2 font-medium">Year</th>
            <th className="py-1 pr-2 text-right font-medium">Value</th>
            <th className="py-1 pr-2 font-medium">Source</th>
          </tr>
        </thead>
        <tbody>
          {chart.bars.map((b) => (
            <tr key={b.code} className="border-b border-border/60">
              <td className="py-1 pr-2">
                <Link href={`/places/${encodeURIComponent(b.code)}`} className="underline-offset-2 hover:underline">
                  {b.name}
                </Link>
              </td>
              <td className="py-1 pr-2 tabular-nums">{b.cell?.year ?? "—"}</td>
              <td className={`py-1 pr-2 text-right tabular-nums ${b.cell ? "" : "text-muted-foreground"}`}>
                {fmtWithCI(b.cell, meta)}
              </td>
              <td className="py-1 pr-2 text-muted-foreground">
                {b.cell ? `${b.cell.source}${b.cell.isEstimate ? " · estimate" : ""}` : NO_DATA}
              </td>
            </tr>
          ))}
          <tr className="border-b border-border/60 bg-muted/40">
            <td className="py-1 pr-2 font-medium">Nigeria (reference)</td>
            <td className="py-1 pr-2 tabular-nums">{national?.year ?? "—"}</td>
            <td className={`py-1 pr-2 text-right tabular-nums ${national ? "" : "text-muted-foreground"}`}>
              {fmtWithCI(national, meta)}
            </td>
            <td className="py-1 pr-2 text-muted-foreground">
              {national ? `${national.source}${national.isEstimate ? " · estimate" : ""}` : NO_DATA}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );

  return (
    <ChartFrame
      title={title}
      table={table}
      footnote={footnoteParts.length ? footnoteParts.join(" ") : undefined}
      source={
        <SourceLine
          sourceName={sourcesOf(allCells)}
          year={yearsOf(allCells)}
          isEstimate={anyEstimate(allCells)}
        />
      }
    >
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {NO_DATA} for the selected places.
        </p>
      ) : (
        <div style={{ height }} className="w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={rows}
              layout="vertical"
              margin={{ top: 18, right: 16, bottom: 4, left: 4 }}
              barCategoryGap="22%"
            >
              <CartesianGrid stroke="currentColor" strokeOpacity={0.08} horizontal={false} />
              <XAxis
                type="number"
                domain={[minVal, maxVal * 1.08 || 1]}
                tickFormatter={tick}
                tick={{ fontSize: 11 }}
                allowDecimals
              />
              <YAxis
                type="category"
                dataKey="label"
                width={112}
                tick={{ fontSize: 11 }}
                interval={0}
              />
              <Tooltip
                cursor={{ fillOpacity: 0.06 }}
                content={({ active, payload }) => {
                  const r = active ? (payload?.[0]?.payload as BarRow | undefined) : undefined;
                  if (!r) return null;
                  return (
                    <div className="rounded-md border border-border bg-background p-2 text-xs shadow-sm">
                      <p className="font-medium">{r.label}</p>
                      <p className="tabular-nums">
                        {formatValue(r.value, meta)}
                        {unitSuffix(meta)} {formatCI(r.cell.lower, r.cell.upper, meta)}
                      </p>
                      <p className="text-muted-foreground">
                        {r.cell.source} · {r.cell.year}
                        {r.cell.isEstimate ? " · estimate" : ""}
                      </p>
                    </div>
                  );
                }}
              />
              {national && (
                <ReferenceLine
                  x={national.value}
                  stroke={REFERENCE_COLOR}
                  strokeDasharray="4 3"
                  ifOverflow="extendDomain"
                  label={{
                    value: `Nigeria ${formatValue(national.value, meta)}`,
                    position: "top",
                    fontSize: 10,
                    fill: REFERENCE_COLOR,
                  }}
                />
              )}
              <Bar dataKey="value" isAnimationActive={false} radius={[0, 3, 3, 0]}>
                {rows.map((r) => (
                  <Cell key={r.code} fill={r.color} />
                ))}
                <ErrorBar dataKey="err" direction="x" width={6} stroke="#111827" strokeWidth={1.2} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartFrame>
  );
}
