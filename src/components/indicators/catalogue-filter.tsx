"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CATEGORY_LABEL } from "./labels";

export interface CatalogueItem {
  code: string;
  name: string;
  category: string;
  unit: string;
  definition: string;
}

/**
 * Indicator catalogue grouped by category with an instant text filter.
 * The full list is server-rendered, so it works before JS loads.
 */
export function CatalogueFilter({
  items,
  categories,
}: {
  items: CatalogueItem[];
  categories: string[];
}) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      needle
        ? items.filter((i) =>
            `${i.name} ${i.code} ${i.definition} ${CATEGORY_LABEL[i.category] ?? ""}`
              .toLowerCase()
              .includes(needle),
          )
        : items,
    [items, needle],
  );

  return (
    <div className="space-y-8">
      <div>
        <label htmlFor="ind-filter" className="mb-1 block text-sm font-medium">
          Filter indicators
        </label>
        <input
          id="ind-filter"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. mortality, water, anc4"
          className="h-10 w-full max-w-md rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <p className="mt-1 text-xs text-muted-foreground" aria-live="polite">
          {filtered.length} of {items.length} indicators
        </p>
      </div>
      {categories.map((cat) => {
        const list = filtered.filter((i) => i.category === cat);
        if (list.length === 0) return null;
        return (
          <section key={cat} aria-labelledby={`c-${cat}`}>
            <h2 id={`c-${cat}`} className="mb-3 text-lg font-semibold">
              {CATEGORY_LABEL[cat] ?? cat}{" "}
              <span className="text-sm font-normal text-muted-foreground">({list.length})</span>
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((i) => (
                <li key={i.code}>
                  <Link
                    href={`/indicators/${i.code}`}
                    className="block h-full rounded-lg border border-border bg-card p-3 transition-shadow hover:shadow-sm"
                  >
                    <span className="block font-medium">{i.name}</span>
                    <span className="block text-xs text-muted-foreground">{i.unit}</span>
                    <span className="mt-1 line-clamp-2 block text-xs text-muted-foreground">
                      {i.definition}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {filtered.length === 0 && (
        <p className="text-sm text-muted-foreground">No indicators match “{q}”.</p>
      )}
    </div>
  );
}
