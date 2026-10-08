"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartFrame } from "@/components/data/chart-frame";
import { SourceLine } from "@/components/data/source-line";
import { compactNumber, NO_DATA } from "@/lib/format";
import type { PyramidData } from "./pyramid-data";

const MALE = "#0072B2";
const FEMALE = "#E69F00";
const BOTH = "#009E73";

const fmt = (v: number | null | undefined) =>
  v == null ? NO_DATA : compactNumber(Math.abs(v));

/**
 * Age-sex pyramid: males to the left, females to the right (two horizontal
 * bar series on a signed axis). Falls back to a single both-sexes
 * distribution when only total-by-age rows are published.
 */
export function AgeSexPyramid({
  data,
  sourceName,
  year,
  isEstimate,
}: {
  data: PyramidData;
  sourceName: string;
  year: number;
  isEstimate: boolean;
}) {
  // Oldest at the top, youngest at the bottom.
  const rows = [...data.rows].reverse().map((r) => ({
    ...r,
    maleNeg: r.male == null ? null : -r.male,
  }));
  const isSex = data.mode === "sex";

  const table = (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-border text-left text-muted-foreground">
          <th className="py-1 pr-2 font-medium">Age group</th>
          {isSex && <th className="py-1 pr-2 text-right font-medium">Male</th>}
          {isSex && <th className="py-1 pr-2 text-right font-medium">Female</th>}
          <th className="py-1 pr-2 text-right font-medium">Total</th>
        </tr>
      </thead>
      <tbody>
        {data.rows.map((r) => (
          <tr key={r.ageGroup} className="border-b border-border/60">
            <td className="py-1 pr-2">{r.ageGroup}</td>
            {isSex && <td className="py-1 pr-2 text-right tabular-nums">{fmt(r.male)}</td>}
            {isSex && <td className="py-1 pr-2 text-right tabular-nums">{fmt(r.female)}</td>}
            <td className="py-1 pr-2 text-right tabular-nums">{fmt(r.total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <ChartFrame
      title={isSex ? `Population by age and sex, ${year}` : `Population by age, ${year}`}
      table={table}
      source={<SourceLine sourceName={sourceName} year={year} isEstimate={isEstimate} />}
      footnote={
        isSex
          ? undefined
          : "Only both-sexes figures by age are published for this place."
      }
    >
      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            layout="vertical"
            stackOffset="sign"
            barCategoryGap={1}
            margin={{ top: 4, right: 12, bottom: 0, left: 0 }}
          >
            <CartesianGrid stroke="currentColor" strokeOpacity={0.08} horizontal={false} />
            <XAxis
              type="number"
              tick={{ fontSize: 11 }}
              tickFormatter={(v: number) => compactNumber(Math.abs(v))}
            />
            <YAxis
              type="category"
              dataKey="ageGroup"
              tick={{ fontSize: 10 }}
              width={44}
              interval={0}
            />
            <Tooltip
              formatter={(v, name) => [
                fmt(typeof v === "number" ? v : null),
                name === "maleNeg" ? "Male" : name === "female" ? "Female" : "Total",
              ]}
            />
            {isSex ? (
              <>
                <Bar dataKey="maleNeg" stackId="p" fill={MALE} isAnimationActive={false} />
                <Bar dataKey="female" stackId="p" fill={FEMALE} isAnimationActive={false} />
              </>
            ) : (
              <Bar dataKey="total" fill={BOTH} isAnimationActive={false} />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
      {isSex && (
        <ul className="mt-1 flex gap-4 text-xs text-muted-foreground">
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-2.5 w-2.5" style={{ background: MALE }} />
            Male (left)
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-2.5 w-2.5" style={{ background: FEMALE }} />
            Female (right)
          </li>
        </ul>
      )}
    </ChartFrame>
  );
}
