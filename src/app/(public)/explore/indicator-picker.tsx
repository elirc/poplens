"use client";

import { useId, useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { ExplorerIndicator } from "./explorer";

/**
 * Indicator picker grouped by category with a search filter. Uses a native
 * <select> with <optgroup>s — the best picker on low-end Android phones.
 */

export const CATEGORY_LABELS: Record<string, string> = {
  population: "Population",
  health_outcomes: "Health outcomes",
  health_services: "Health services",
  living_conditions: "Living conditions",
  outbreaks: "Outbreaks",
};

const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS);

export function IndicatorPicker({
  indicators,
  value,
  onChange,
}: {
  indicators: ExplorerIndicator[];
  value: string | null;
  onChange: (code: string) => void;
}) {
  const [query, setQuery] = useState("");
  const id = useId();

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (i: ExplorerIndicator) =>
      !q ||
      i.code === value ||
      i.name.toLowerCase().includes(q) ||
      i.code.toLowerCase().includes(q) ||
      (CATEGORY_LABELS[i.category] ?? i.category).toLowerCase().includes(q);
    const byCat = new Map<string, ExplorerIndicator[]>();
    for (const i of indicators) {
      if (!match(i)) continue;
      const list = byCat.get(i.category) ?? [];
      list.push(i);
      byCat.set(i.category, list);
    }
    return [...byCat.entries()].sort(
      (a, b) =>
        (CATEGORY_ORDER.indexOf(a[0]) + 1 || 99) - (CATEGORY_ORDER.indexOf(b[0]) + 1 || 99),
    );
  }, [indicators, query, value]);

  const matches = groups.reduce((n, [, list]) => n + list.length, 0);

  return (
    <div className="space-y-1.5">
      <label htmlFor={`${id}-select`} className="text-xs font-medium text-muted-foreground">
        Indicator
      </label>
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search indicators…"
          aria-label="Search indicators"
          className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-2 text-sm"
        />
      </div>
      <select
        id={`${id}-select`}
        value={value ?? ""}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
      >
        {!value && <option value="">Choose an indicator…</option>}
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
      {query && (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {matches === 0 ? "No indicators match." : `${matches} match${matches === 1 ? "" : "es"}`}
        </p>
      )}
    </div>
  );
}
