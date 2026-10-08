import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { listGeoUnits, type GeoLevel } from "@/server/geo/queries";
import {
  getAvailableYears,
  getCoverage,
  getIndicatorByCode,
  getTrendSeries,
  getValuesForLevel,
} from "@/server/indicators/queries";
import { computeRanks, ordinal } from "@/server/indicators/ranks";
import { getDatasetsForIndicator } from "@/server/search/profile-extra";
import { SourceLine } from "@/components/data/source-line";
import { Badge } from "@/components/ui/badge";
import { TrendChart } from "@/components/indicators/trend-chart";
import { OKABE_ITO, toTrendPoints } from "@/components/indicators/to-points";
import {
  AGGREGATION_LABEL,
  CATEGORY_LABEL,
  LEVEL_LABEL,
  VALUE_TYPE_LABEL,
  directionLabel,
  exploreHref,
} from "@/components/indicators/labels";
import { formatCI, formatValue, NO_DATA } from "@/lib/format";

export const revalidate = 600;
export const dynamicParams = true;

type Params = { params: Promise<{ code: string }> };

const LEVEL_ORDER: GeoLevel[] = ["nation", "zone", "state", "lga", "ward"];

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { code } = await params;
  const meta = await getIndicatorByCode(decodeURIComponent(code));
  if (!meta) return { title: "Indicator not found" };
  return {
    title: `${meta.name} — Nigeria by state and LGA`,
    description: meta.definition.slice(0, 200),
  };
}

export default async function IndicatorPage({ params }: Params) {
  const { code } = await params;
  const meta = await getIndicatorByCode(decodeURIComponent(code));
  if (!meta) notFound();

  const [coverageRaw, nations, datasets] = await Promise.all([
    getCoverage(meta.id),
    listGeoUnits("nation"),
    getDatasetsForIndicator(meta.id),
  ]);
  const nation = nations[0] ?? null;
  const coverage = [...coverageRaw]
    .map((c) => ({ ...c, places: Number(c.places), minYear: Number(c.minYear), maxYear: Number(c.maxYear) }))
    .sort((a, b) => LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level));

  const [yearsByLevel, nationalRows] = await Promise.all([
    Promise.all(coverage.map(async (c) => ({ level: c.level, years: await getAvailableYears(meta.id, c.level) }))),
    nation ? getTrendSeries(meta.id, [nation.id]) : Promise.resolve([]),
  ]);
  const stateYears = yearsByLevel.find((y) => y.level === "state")?.years ?? [];
  const latestStateYear = stateYears.length ? stateYears[stateYears.length - 1]! : null;

  const stateValues = latestStateYear
    ? await getValuesForLevel(meta.id, "state", latestStateYear)
    : [];
  const ranked = computeRanks(
    stateValues.map((v) => ({ geoUnitId: v.geoUnitId, value: Number(v.value) })),
    meta.higherIsBetter,
  );
  const byId = new Map(stateValues.map((v) => [v.geoUnitId, v]));
  const top = ranked.slice(0, 5);
  // Bottom list never repeats a place already in the top list.
  const bottom = ranked.slice(Math.max(5, ranked.length - 5)).reverse();
  const rankSources = [...new Set(stateValues.map((v) => v.sourcePublisher))].join("; ");
  const rankEstimate = stateValues.some((v) => v.isEstimate);
  const fmtMeta = { unit: meta.unit, valueType: meta.valueType, decimals: meta.decimals };
  const topLabel = meta.higherIsBetter === null ? "Highest" : "Best";
  const bottomLabel = meta.higherIsBetter === null ? "Lowest" : "Worst";

  const rankTable = (title: string, rows: typeof ranked) => (
    <div className="rounded-lg border border-border">
      <h3 className="border-b border-border px-3 py-2 text-sm font-medium">{title}</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="px-3 py-1 font-medium">Rank</th>
            <th className="px-3 py-1 font-medium">State</th>
            <th className="px-3 py-1 text-right font-medium">Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const v = byId.get(r.geoUnitId)!;
            return (
              <tr key={r.geoUnitId} className="border-t border-border/60">
                <td className="px-3 py-1.5 tabular-nums">{ordinal(r.rank)}</td>
                <td className="px-3 py-1.5">
                  <Link href={`/places/${v.code}`} className="hover:underline">
                    {v.name}
                  </Link>
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {formatValue(r.value, fmtMeta)}
                  <span className="block text-xs text-muted-foreground">
                    {formatCI(v.lower, v.upper, fmtMeta)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-6">
      <header className="space-y-3">
        <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
          <Link href="/indicators" className="hover:underline">
            Indicators
          </Link>{" "}
          / {CATEGORY_LABEL[meta.category] ?? meta.category}
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{meta.name}</h1>
          <Badge variant="secondary">{CATEGORY_LABEL[meta.category] ?? meta.category}</Badge>
        </div>
        <p className="max-w-3xl text-base">{meta.definition}</p>
        <dl className="grid max-w-3xl grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">Unit</dt>
            <dd>{meta.unit}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Type</dt>
            <dd>{VALUE_TYPE_LABEL[meta.valueType] ?? meta.valueType}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Direction</dt>
            <dd>{directionLabel(meta.higherIsBetter)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Code</dt>
            <dd className="font-mono text-xs">{meta.code}</dd>
          </div>
        </dl>
      </header>

      <section aria-labelledby="method" className="space-y-2">
        <h2 id="method" className="text-lg font-semibold">
          Method and caveats
        </h2>
        <ul className="max-w-3xl list-disc space-y-1 pl-5 text-sm">
          {meta.methodNotes && <li>{meta.methodNotes}</li>}
          <li>Aggregation: {AGGREGATION_LABEL[meta.aggregation] ?? meta.aggregation}.</li>
          <li>
            PopLens shows the finest level each source publishes and never estimates finer
            values itself. Missing values are shown as “{NO_DATA}”, never as zero.
          </li>
          <li>
            Values from different sources are never joined into one trend line without a
            visible marker.
          </li>
        </ul>
      </section>

      <section aria-labelledby="coverage" className="space-y-3">
        <h2 id="coverage" className="text-lg font-semibold">
          Levels and years available
        </h2>
        {coverage.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {NO_DATA}: no published values for this indicator yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="p-2 font-medium">Level</th>
                  <th className="p-2 font-medium">Places</th>
                  <th className="p-2 font-medium">Years</th>
                  <th className="p-2 font-medium">Map</th>
                </tr>
              </thead>
              <tbody>
                {coverage.map((c) => {
                  const years = yearsByLevel.find((y) => y.level === c.level)?.years ?? [];
                  return (
                    <tr key={c.level} className="border-b border-border/60 last:border-0">
                      <td className="p-2">{LEVEL_LABEL[c.level] ?? c.level}</td>
                      <td className="p-2 tabular-nums">{c.places.toLocaleString("en-NG")}</td>
                      <td className="p-2 tabular-nums">
                        {years.length ? years.join(", ") : `${c.minYear}–${c.maxYear}`}
                      </td>
                      <td className="p-2">
                        {c.level === "state" || c.level === "lga" || c.level === "ward" ? (
                          <Link
                            href={exploreHref(meta.code, c.maxYear, c.level)}
                            className="text-emerald-700 hover:underline"
                          >
                            Open map
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="national-trend" className="space-y-3">
        <h2 id="national-trend" className="text-lg font-semibold">
          National trend
        </h2>
        {nation && nationalRows.length > 0 ? (
          <TrendChart
            title={`${meta.name}, ${nation.name} (${meta.unit})`}
            meta={fmtMeta}
            height={240}
            series={[
              {
                key: "nation",
                label: nation.name,
                color: OKABE_ITO[0],
                points: toTrendPoints(nationalRows),
              },
            ]}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            {NO_DATA}: no published national values.
          </p>
        )}
      </section>

      <section aria-labelledby="states" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="states" className="text-lg font-semibold">
            States{latestStateYear ? `, ${latestStateYear}` : ""}
          </h2>
          {latestStateYear && (
            <Link
              href={exploreHref(meta.code, latestStateYear, "state")}
              className="text-sm font-medium text-emerald-700 hover:underline"
            >
              See all states on the map →
            </Link>
          )}
        </div>
        {ranked.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {NO_DATA}: no published state-level values.
          </p>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              {rankTable(`${topLabel} ${Math.min(5, top.length)} states`, top)}
              {bottom.length > 0 && rankTable(`${bottomLabel} ${bottom.length} states`, bottom)}
            </div>
            <SourceLine
              sourceName={rankSources}
              year={latestStateYear}
              isEstimate={rankEstimate}
            />
            <p className="text-xs text-muted-foreground">
              Ranked among {ranked.length} states with data
              {meta.higherIsBetter === null
                ? " (1st = highest value; neither direction is better)."
                : " (1st = best)."}
            </p>
          </>
        )}
      </section>

      <section aria-labelledby="sources" className="space-y-3">
        <h2 id="sources" className="text-lg font-semibold">
          Sources and datasets
        </h2>
        {datasets.length === 0 ? (
          <p className="text-sm text-muted-foreground">No published datasets feed this indicator yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="p-2 font-medium">Source</th>
                  <th className="p-2 font-medium">Dataset</th>
                  <th className="p-2 font-medium">Levels</th>
                  <th className="p-2 font-medium">Years</th>
                  <th className="p-2 font-medium">Licence</th>
                </tr>
              </thead>
              <tbody>
                {datasets.map((d) => (
                  <tr key={d.datasetId} className="border-b border-border/60 last:border-0">
                    <td className="p-2">
                      {d.sourceUrl ? (
                        <a href={d.sourceUrl} className="hover:underline" rel="noopener noreferrer" target="_blank">
                          {d.publisher}
                        </a>
                      ) : (
                        d.publisher
                      )}
                    </td>
                    <td className="p-2">
                      {d.datasetTitle}{" "}
                      <span className="text-xs text-muted-foreground">v{d.version}</span>
                      {d.isSynthetic && (
                        <Badge variant="warning" className="ml-1">
                          Synthetic demo
                        </Badge>
                      )}
                    </td>
                    <td className="p-2">
                      {LEVEL_ORDER.filter((l) => d.levels.includes(l))
                        .map((l) => LEVEL_LABEL[l])
                        .join(", ")}
                    </td>
                    <td className="p-2 tabular-nums">
                      {d.minYear === d.maxYear ? d.minYear : `${d.minYear}–${d.maxYear}`}
                    </td>
                    <td className="p-2 text-muted-foreground">
                      {d.licence}
                      {d.allowsRedistribution ? "" : " · no redistribution"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
