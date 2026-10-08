import { TrendChart } from "@/components/indicators/trend-chart";
import { LEVEL_PLURAL } from "@/components/indicators/labels";
import { BarChartView } from "./bar-chart";
import type { ChartData } from "./types";
import { ChartErrorBox } from "./chart-error";

export { ChartErrorBox };

/**
 * Renders live chart data with the shared chart components (TrendChart for
 * trends, BarChartView for bar/top5) — every chart in a ChartFrame with a
 * table view and source line. Usable from server and client components.
 */
export function ChartView({ data, compact }: { data: ChartData; compact?: boolean }) {
  const synthetic = data.isSynthetic ? (
    <p className="mt-1 text-xs font-medium text-amber-800">
      Demo data — SYNTHETIC values, not real statistics.
    </p>
  ) : null;

  if (data.type === "trend") {
    const hasAny = data.series.some((s) => s.points.length > 0);
    return (
      <div>
        {hasAny ? (
          <TrendChart title={data.title} meta={data.indicator} series={data.series} height={compact ? 180 : 220} />
        ) : (
          <ChartErrorBox title={data.title} message="No data for these places." tone="muted" />
        )}
        {hasAny && data.missing.length > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            No data: {data.missing.map((m) => m.name).join(", ")}.
          </p>
        )}
        {synthetic}
      </div>
    );
  }

  const outOf = data.rows[0]?.outOf;
  return (
    <div>
      <BarChartView
        title={data.title}
        indicator={data.indicator}
        rows={data.rows}
        missing={data.missing}
        year={data.year}
        ranked={data.type === "top5"}
        compact={compact}
        footnote={
          data.type === "top5" && outOf
            ? `Five highest values among ${outOf} ${LEVEL_PLURAL[data.spec.level] ?? data.spec.level}.`
            : null
        }
      />
      {synthetic}
    </div>
  );
}
