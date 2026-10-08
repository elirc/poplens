"use client";

import { useId, useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { IndicatorOption } from "./types";

/**
 * Single-indicator picker shared by the analytics pages: native <select>
 * grouped by category (best on low-end Android) plus an optional text filter.
 */

export const CATEGORY_LABELS: Record<string, string> = {
  population: "Population",
  health_outcomes: "Health outcomes",
  health_services: "Health services",
  living_conditions: "Living conditions",
  outbreaks: "Outbreaks",
};
const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS);

export function groupIndicators(indicators: IndicatorOption[]): Array<[string, IndicatorOption[]]> {
  const byCat = new Map<string, IndicatorOption[]>();
  for (const i of indicators) {
    const list = byCat.get(i.category) ?? [];
    list.push(i);
    byCat.set(i.category, list);
  }
  return [...byCat.entries()].sort(
    (a, b) => (CATEGORY_ORDER.indexOf(a[0]) + 1 || 99) - (CATEGORY_ORDER.indexOf(b[0]) + 1 || 99),
  );
}

export function IndicatorSelect({
  indicators,
  value,
  onChange,
  label = "Indicator",
  searchable = true,
  disabled,
  exclude = [],
  placeholder = "Choose an indicator…",
}: {
  indicators: IndicatorOption[];
  value: string | null;
  onChange: (code: string) => void;
  label?: string;
  searchable?: boolean;
  disabled?: boolean;
  /** Codes to hide (e.g. indicators already selected elsewhere). */
  exclude?: string[];
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const id = useId();

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const visible = indicators.filter(
      (i) =>
        (i.code === value || !exclude.includes(i.code)) &&
        (!q ||
          i.code === value ||
          i.name.toLowerCase().includes(q) ||
          i.code.toLowerCase().includes(q) ||
          (CATEGORY_LABELS[i.category] ?? i.category).toLowerCase().includes(q)),
    );
    return groupIndicators(visible);
  }, [indicators, query, value, exclude]);

  const matches = groups.reduce((n, [, list]) => n + list.length, 0);

  return (
    <div className="min-w-0 space-y-1">
      <label htmlFor={`${id}-select`} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {searchable && (
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter indicators…"
            aria-label={`Filter ${label.toLowerCase()} list`}
            className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-2 text-sm"
          />
        </div>
      )}
      <select
        id={`${id}-select`}
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm disabled:opacity-60"
      >
        {!value && <option value="">{placeholder}</option>}
        {groups.map(([cat, list]) => (
          <optgroup key={cat} label={CATEGORY_LABELS[cat] ?? cat}>
            {list.map((i) => (
              <option key={i.code} value={i.code}>
                {i.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {searchable && query && (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {matches === 0 ? "No indicators match." : `${matches} match${matches === 1 ? "" : "es"}`}
        </p>
      )}
    </div>
  );
}
