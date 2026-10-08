"use client";

import { ArrowLeftRight, Info } from "lucide-react";
import { Alert } from "@/components/ui/misc";
import { ControlPanel, SelectField } from "@/components/analytics/controls";
import { IndicatorSelect } from "@/components/analytics/indicator-select";
import { relationshipsHref } from "@/components/analytics/params";
import type { IndicatorOption, RelationshipsData } from "@/components/analytics/types";
import { useUrlNav } from "@/components/analytics/use-url-nav";
import { NO_DATA } from "@/lib/format";
import { CAUSATION_NOTE, RelationshipScatter } from "./scatter-chart";

function formatR(r: number): string {
  return (r < 0 ? "−" : "") + Math.abs(r).toFixed(2);
}

export function RelationshipsView({
  data,
  indicators,
  requestedYear,
}: {
  data: RelationshipsData;
  indicators: IndicatorOption[];
  requestedYear: number | null;
}) {
  const { go, pending } = useUrlNav();
  const { x, y, stats, year } = data;
  const nav = (patch: { x?: string; y?: string; year?: number | null }) =>
    go(relationshipsHref({ x: x.code, y: y.code, year, ...patch }));

  return (
    <div className="space-y-4">
      <ControlPanel pending={pending}>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_minmax(0,9rem)] sm:items-end">
          <IndicatorSelect
            label="Horizontal axis (x)"
            indicators={indicators}
            value={x.code}
            exclude={[y.code]}
            onChange={(code) => nav({ x: code, year: null })}
            disabled={pending}
          />
          <button
            type="button"
            onClick={() => nav({ x: y.code, y: x.code })}
            disabled={pending}
            aria-label="Swap x and y indicators"
            title="Swap axes"
            className="inline-flex h-9 items-center justify-center gap-1 rounded-md border border-border px-2.5 text-xs hover:bg-muted"
          >
            <ArrowLeftRight className="h-4 w-4" />
            <span className="sm:sr-only">Swap</span>
          </button>
          <IndicatorSelect
            label="Vertical axis (y)"
            indicators={indicators}
            value={y.code}
            exclude={[x.code]}
            onChange={(code) => nav({ y: code, year: null })}
            disabled={pending}
          />
          <SelectField
            label="Year"
            value={year}
            options={[...data.commonYears].reverse().map((v) => ({ value: v, label: String(v) }))}
            onChange={(v) => nav({ year: v })}
            disabled={pending}
          />
        </div>
      </ControlPanel>

      {data.yearFallback && year != null && (
        <Alert variant="warning">
          {requestedYear ? `Both indicators are not available for ${requestedYear}. ` : ""}
          Showing {year}, the latest year both have state values.
        </Alert>
      )}

      {year == null ? (
        <Alert>
          {NO_DATA}: {x.name} and {y.name} have no year in common at state level, so they cannot be
          plotted together. Pick a different pair.
        </Alert>
      ) : (
        <div className={`space-y-3 ${pending ? "opacity-70 transition-opacity" : ""}`}>
          <section
            aria-label="Correlation"
            className="grid gap-3 rounded-lg border border-border bg-card p-3 sm:grid-cols-[auto_1fr] sm:items-center"
          >
            <div>
              <p className="text-xs font-medium text-muted-foreground">Pearson correlation (r)</p>
              <p className="text-3xl font-semibold tabular-nums">
                {stats.r != null ? formatR(stats.r) : "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                {stats.n} of {data.totalStates} states plotted
              </p>
            </div>
            <div className="space-y-1 text-sm">
              {stats.r != null ? (
                <p>
                  Across states in {year}: <strong className="font-medium">{stats.description}</strong>
                  {stats.r2 != null && (
                    <span className="text-muted-foreground"> (r² = {stats.r2.toFixed(2)})</span>
                  )}
                  .
                </p>
              ) : (
                <p className="text-muted-foreground">{stats.skipText}</p>
              )}
              <p className="flex items-start gap-1.5 rounded-md bg-amber-50 p-2 text-amber-950">
                <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{CAUSATION_NOTE}</span>
              </p>
            </div>
          </section>

          <RelationshipScatter data={data} />

          {data.missing.length > 0 && (
            <section aria-labelledby="not-plotted" className="space-y-1">
              <h2 id="not-plotted" className="text-sm font-semibold">
                Not plotted ({data.missing.length})
              </h2>
              <p className="text-xs text-muted-foreground">
                Only states with both values in {year} are plotted.{" "}
                {data.missing
                  .map(
                    (m) =>
                      `${m.name} (${m.lacks === "both" ? "no data" : `no ${m.lacks === "x" ? x.name : y.name}`})`,
                  )
                  .join(", ")}
                .
              </p>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
