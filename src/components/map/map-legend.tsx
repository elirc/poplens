"use client";

import type { ReactNode } from "react";
import type { BreakMethod } from "@/lib/class-breaks";
import type { LegendItem } from "./choropleth";

/**
 * Choropleth legend: colour swatches with formatted ranges (via
 * `legendItems`), an always-present "No data" row, and — when handlers are
 * passed — the class-break method + bucket-count choice required by the spec.
 */

export const METHOD_LABELS: Record<BreakMethod, string> = {
  quantile: "Quantile (equal counts)",
  equal: "Equal interval",
  jenks: "Natural breaks (Jenks)",
};

export interface MapLegendProps {
  title: string;
  subtitle?: string;
  items: LegendItem[];
  method?: BreakMethod;
  onMethodChange?: (m: BreakMethod) => void;
  classes?: number;
  onClassesChange?: (k: number) => void;
  /** Attribution (SourceLine) — keep it visible under the legend. */
  footer?: ReactNode;
  className?: string;
}

export function MapLegend({
  title,
  subtitle,
  items,
  method,
  onMethodChange,
  classes,
  onClassesChange,
  footer,
  className,
}: MapLegendProps) {
  return (
    <section
      aria-label="Map legend"
      className={`rounded-lg border border-border bg-background/95 p-3 text-sm shadow-sm ${className ?? ""}`}
    >
      <h2 className="text-sm font-medium leading-snug">{title}</h2>
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      <ul className="mt-2 space-y-1">
        {items.map((it, i) => (
          <li key={`${it.label}-${i}`} className="flex items-center gap-2 text-xs">
            <span
              aria-hidden
              className="inline-block h-3.5 w-5 shrink-0 rounded-sm border border-black/10"
              style={{ background: it.color }}
            />
            <span className="tabular-nums">{it.label}</span>
          </li>
        ))}
      </ul>
      {(onMethodChange || onClassesChange) && (
        <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
          {onMethodChange && method && (
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Class breaks
              <select
                className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
                value={method}
                onChange={(e) => onMethodChange(e.target.value as BreakMethod)}
              >
                {(Object.keys(METHOD_LABELS) as BreakMethod[]).map((m) => (
                  <option key={m} value={m}>
                    {METHOD_LABELS[m]}
                  </option>
                ))}
              </select>
            </label>
          )}
          {onClassesChange && classes != null && (
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Classes
              <select
                className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
                value={classes}
                onChange={(e) => onClassesChange(Number(e.target.value))}
              >
                {[3, 4, 5, 6, 7].map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
      {footer && <div className="mt-2">{footer}</div>}
    </section>
  );
}
