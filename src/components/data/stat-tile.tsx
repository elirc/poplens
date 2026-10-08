import { formatCI, formatValue, NO_DATA, type IndicatorMeta } from "@/lib/format";
import { SourceLine } from "./source-line";

/**
 * Indicator tile: value + unit + source line, with optional national figure
 * and rank beside it (place profiles). Renders "No data" when value is null —
 * never zero (spec).
 */
export function StatTile({
  label,
  value,
  lower,
  upper,
  meta,
  sourceName,
  year,
  isEstimate,
  national,
  rank,
  href,
}: {
  label: string;
  value: number | null;
  lower?: number | null;
  upper?: number | null;
  meta: IndicatorMeta;
  sourceName?: string;
  year?: number | string | null;
  isEstimate?: boolean;
  /** Formatted national comparison, e.g. "Nigeria: 132" */
  national?: string | null;
  /** Formatted rank, e.g. "3rd of 36 states" */
  rank?: string | null;
  href?: string;
}) {
  const noData = value === null || value === undefined;
  const body = (
    <div className="flex h-full flex-col rounded-lg border border-border bg-card p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold tabular-nums ${noData ? "text-muted-foreground" : ""}`}
      >
        {noData ? NO_DATA : formatValue(value, meta)}
        {!noData && meta.valueType !== "percent" && (
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            {meta.unit}
          </span>
        )}
      </p>
      {!noData && (lower != null || upper != null) && (
        <p className="text-xs text-muted-foreground">
          {formatCI(lower, upper, meta)}
        </p>
      )}
      {(national || rank) && (
        <p className="mt-1 text-xs text-muted-foreground">
          {[national, rank].filter(Boolean).join(" · ")}
        </p>
      )}
      {sourceName && !noData && (
        <SourceLine
          sourceName={sourceName}
          year={year}
          isEstimate={isEstimate}
          className="mt-auto pt-2"
        />
      )}
    </div>
  );
  if (href) {
    return (
      <a href={href} className="block transition-shadow hover:shadow-sm">
        {body}
      </a>
    );
  }
  return body;
}
