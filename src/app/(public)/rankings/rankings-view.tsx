"use client";

import Link from "next/link";
import { Alert } from "@/components/ui/misc";
import { ControlPanel, Segmented, SelectField } from "@/components/analytics/controls";
import { IndicatorSelect } from "@/components/analytics/indicator-select";
import { rankingsHref, type RankingLevel } from "@/components/analytics/params";
import { rankDirectionText } from "@/components/analytics/rank-format";
import type { IndicatorOption, RankingsData } from "@/components/analytics/types";
import { useUrlNav } from "@/components/analytics/use-url-nav";
import { NO_DATA } from "@/lib/format";
import { RankingsChart } from "./rankings-chart";
import { RankingsTable } from "./rankings-table";

const LEVELS: Array<{ value: RankingLevel; label: string }> = [
  { value: "state", label: "States" },
  { value: "lga", label: "LGAs" },
];
const PLURAL: Record<RankingLevel, string> = { state: "states", lga: "LGAs" };
const SINGULAR: Record<RankingLevel, string> = { state: "State", lga: "LGA" };

export function RankingsView({
  data,
  indicators,
  requestedYear,
}: {
  data: RankingsData;
  indicators: IndicatorOption[];
  requestedYear: number | null;
}) {
  const { go, pending } = useUrlNav();
  const { indicator, level, year } = data;
  // Changing indicator or level drops the year (it may not exist there) → latest.
  const nav = (patch: { indicator?: string; level?: RankingLevel; year?: number | null }) =>
    go(rankingsHref({ indicator: indicator.code, level, year, ...patch }));

  return (
    <div className="space-y-4">
      <ControlPanel pending={pending}>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_auto_minmax(0,1fr)] sm:items-end">
          <IndicatorSelect
            indicators={indicators}
            value={indicator.code}
            onChange={(code) => nav({ indicator: code, year: null })}
            disabled={pending}
          />
          <Segmented
            label="Level"
            value={level}
            options={LEVELS}
            onChange={(l) => nav({ level: l, year: null })}
            disabled={pending}
          />
          <SelectField
            label="Year"
            value={year}
            options={[...data.years].reverse().map((y) => ({ value: y, label: String(y) }))}
            onChange={(y) => nav({ year: y })}
            disabled={pending}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {rankDirectionText(indicator.higherIsBetter)} Wards are not ranked.
        </p>
      </ControlPanel>

      {data.yearFallback && (
        <Alert variant="warning">
          {requestedYear ? `No ${PLURAL[level]} data for ${requestedYear}. ` : ""}
          {year ? `Showing ${year}, the latest year available.` : ""}
        </Alert>
      )}

      {year == null || data.rows.length === 0 ? (
        <Alert>
          {NO_DATA}: {indicator.name} has no published values for {PLURAL[level]}
          {year ? ` in ${year}` : ""}.{" "}
          {level === "lga" && (
            <button type="button" className="underline" onClick={() => nav({ level: "state", year: null })}>
              Try states instead
            </button>
          )}
        </Alert>
      ) : (
        <div className={`space-y-4 ${pending ? "opacity-70 transition-opacity" : ""}`}>
          <RankingsChart rows={data.rows} indicator={indicator} year={year} levelPlural={PLURAL[level]} />
          <section aria-labelledby="rank-table" className="space-y-2">
            <h2 id="rank-table" className="text-base font-semibold">
              All ranked {PLURAL[level]} ({data.rows.length})
            </h2>
            <RankingsTable
              rows={data.rows}
              meta={indicator}
              levelLabel={SINGULAR[level]}
              showParent={level === "lga"}
              caption={`${indicator.name} ranking of ${PLURAL[level]}, ${year}`}
            />
          </section>
        </div>
      )}

      {data.noData.length > 0 && (
        <section aria-labelledby="no-data" className="space-y-2">
          <h2 id="no-data" className="text-base font-semibold">
            {NO_DATA} ({data.noData.length} {data.noData.length === 1 ? SINGULAR[level].toLowerCase() : PLURAL[level]})
          </h2>
          <p className="text-xs text-muted-foreground">
            No published value{year ? ` for ${year}` : ""} — these places are not ranked.
          </p>
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
            {data.noData.map((p) => (
              <li key={p.code}>
                <Link href={`/places/${encodeURIComponent(p.code)}`} className="text-muted-foreground underline-offset-2 hover:underline">
                  {p.name}
                  {p.parent ? ` (${p.parent})` : ""}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
