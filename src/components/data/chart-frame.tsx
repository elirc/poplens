"use client";

import { useId, useState, type ReactNode } from "react";

/**
 * Wrapper every chart must use (spec: every chart has a table view).
 * Pass the chart as children and the equivalent data table via `table`.
 * The source line is required so no chart ships without attribution.
 */
export function ChartFrame({
  title,
  children,
  table,
  source,
  footnote,
}: {
  title?: string;
  children: ReactNode;
  table: ReactNode;
  source: ReactNode;
  footnote?: ReactNode;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const id = useId();
  return (
    <figure className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        {title ? (
          <figcaption className="text-sm font-medium">{title}</figcaption>
        ) : (
          <span />
        )}
        <div
          role="tablist"
          aria-label="Chart or table view"
          className="flex rounded-md border border-border text-xs"
        >
          {(["chart", "table"] as const).map((v) => (
            <button
              key={v}
              role="tab"
              id={`${id}-${v}`}
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={`px-2.5 py-1 capitalize ${
                view === v
                  ? "bg-muted font-medium"
                  : "text-muted-foreground hover:text-foreground"
              } ${v === "chart" ? "rounded-l-md" : "rounded-r-md"}`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      <div role="tabpanel" aria-labelledby={`${id}-${view}`}>
        {view === "chart" ? children : table}
      </div>
      {footnote && (
        <p className="mt-2 text-xs text-muted-foreground">{footnote}</p>
      )}
      <div className="mt-2">{source}</div>
    </figure>
  );
}
