"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

/** ◀ year ▶ with a compact clickable timeline of the available years. */
export function YearStepper({
  years,
  value,
  onChange,
  disabled,
}: {
  years: number[];
  value: number | null;
  onChange: (year: number) => void;
  disabled?: boolean;
}) {
  const idx = value == null ? -1 : years.indexOf(value);
  const prev = idx > 0 ? years[idx - 1] : null;
  const next = idx >= 0 && idx < years.length - 1 ? years[idx + 1] : null;

  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">Year</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => prev != null && onChange(prev)}
          disabled={disabled || prev == null}
          aria-label={prev != null ? `Previous year (${prev})` : "No earlier year"}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <output
          className="min-w-[4.5rem] flex-1 text-center text-lg font-semibold tabular-nums"
          aria-live="polite"
        >
          {value ?? "—"}
        </output>
        <button
          type="button"
          onClick={() => next != null && onChange(next)}
          disabled={disabled || next == null}
          aria-label={next != null ? `Next year (${next})` : "No later year"}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border disabled:opacity-40"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      {years.length > 1 && (
        <div
          role="group"
          aria-label="Available years"
          className="flex gap-1 overflow-x-auto pb-1 [scrollbar-width:thin]"
        >
          {years.map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => onChange(y)}
              aria-pressed={y === value}
              disabled={disabled}
              className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] tabular-nums ${
                y === value
                  ? "bg-emerald-700 text-white"
                  : "border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {y}
            </button>
          ))}
        </div>
      )}
      {years.length === 0 && !disabled && (
        <p className="text-xs text-muted-foreground">No published years at this level.</p>
      )}
    </div>
  );
}
