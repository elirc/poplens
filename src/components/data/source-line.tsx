import { sourceLine } from "@/lib/format";

/**
 * The standard attribution line under every value, chart and map (spec:
 * every value shows its source, year and whether it is an estimate).
 */
export function SourceLine({
  sourceName,
  year,
  isEstimate,
  className,
}: {
  sourceName: string;
  year?: number | string | null;
  isEstimate?: boolean;
  className?: string;
}) {
  return (
    <p className={`text-xs text-muted-foreground ${className ?? ""}`}>
      Source: {sourceLine({ sourceName, year, isEstimate })}
    </p>
  );
}
