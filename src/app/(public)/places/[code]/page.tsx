import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import {
  getAncestors,
  getGeoUnitByCode,
  listChildren,
  listGeoUnits,
  type GeoUnitLite,
} from "@/server/geo/queries";
import { listIndicators } from "@/server/indicators/queries";
import { StatTile } from "@/components/data/stat-tile";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/misc";
import { LEVEL_LABEL, LEVEL_PLURAL, exploreHref } from "@/components/indicators/labels";
import { loadPlaceIndicators } from "@/components/profile/place-indicators";
import { IndicatorTiles } from "@/components/profile/indicator-tiles";
import { getFacilitySummary } from "@/components/profile/profile-data";
import {
  AgeSexSection,
  FacilitiesSection,
  OutbreakSection,
  SourcesSection,
  TrendsSection,
} from "@/components/profile/sections";

export const revalidate = 300;
export const dynamicParams = true;

type Params = { params: Promise<{ code: string }> };

async function resolveUnit(raw: string): Promise<GeoUnitLite | null> {
  const code = decodeURIComponent(raw);
  return (await getGeoUnitByCode(code)) ?? (await getGeoUnitByCode(code.toUpperCase()));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { code } = await params;
  const unit = await resolveUnit(code);
  if (!unit) return { title: "Place not found" };
  const label = unit.level === "nation" ? "" : ` ${LEVEL_LABEL[unit.level]}`;
  return {
    title: `${unit.name}${label} — population & health profile`,
    description: `Population, health indicators, trends, facilities and outbreak history for ${unit.name}${label}, Nigeria — every figure with its source and year.`,
  };
}

const CHILD_LABEL: Record<string, string> = {
  nation: "States",
  zone: "States",
  state: "LGAs",
  lga: "Wards",
};

const COUNT_META = { unit: "", valueType: "count" as const, decimals: 0 };
const AREA_META = { unit: "km²", valueType: "ratio" as const, decimals: 0 };

function Section({
  id,
  title,
  children,
  aside,
}: {
  id: string;
  title: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={id} className="text-lg font-semibold tracking-tight">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

const fallback = <Skeleton className="h-40 w-full" />;

export default async function PlaceProfilePage({ params }: Params) {
  const { code } = await params;
  const unit = await resolveUnit(code);
  if (!unit) notFound();

  const [ancestors, indicators, nations] = await Promise.all([
    getAncestors(unit),
    listIndicators(),
    unit.level === "nation" ? Promise.resolve([unit]) : listGeoUnits("nation"),
  ]);
  const nation = nations[0] ?? null;
  const parent = ancestors[ancestors.length - 1] ?? null;
  const stateUnit =
    unit.level === "state" ? unit : (ancestors.find((a) => a.level === "state") ?? null);

  const [items, childUnits, facilities] = await Promise.all([
    loadPlaceIndicators(unit, nation, indicators, parent?.name ?? null),
    unit.level === "nation"
      ? listGeoUnits("state")
      : unit.level === "ward"
        ? Promise.resolve([])
        : listChildren(unit.id),
    getFacilitySummary(unit),
  ]);

  const byCode = new Map(items.map((i) => [i.meta.code, i]));
  const pop = byCode.get("pop_total");
  const density = byCode.get("pop_density");
  const childLabel = CHILD_LABEL[unit.level];

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-6">
      <header className="space-y-2">
        <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
          <ol className="flex flex-wrap items-center gap-1">
            <li>
              <Link href="/" className="hover:underline">
                Home
              </Link>
            </li>
            {ancestors.map((a) => (
              <li key={a.id} className="flex items-center gap-1">
                <span aria-hidden>/</span>
                <Link href={`/places/${a.code}`} className="hover:underline">
                  {a.name}
                </Link>
              </li>
            ))}
            <li className="flex items-center gap-1" aria-current="page">
              <span aria-hidden>/</span>
              <span className="text-foreground">{unit.name}</span>
            </li>
          </ol>
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{unit.name}</h1>
          <Badge variant="secondary">{LEVEL_LABEL[unit.level]}</Badge>
        </div>
        {parent && parent.level !== "nation" && (
          <p className="text-sm text-muted-foreground">
            {LEVEL_LABEL[unit.level]} in{" "}
            <Link href={`/places/${parent.code}`} className="underline-offset-2 hover:underline">
              {parent.name}
              {parent.level === "lga" ? " LGA" : ""}
            </Link>
          </p>
        )}
      </header>

      <Section id="key-facts" title="Key facts">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          <StatTile
            label="Population"
            value={pop?.value?.value ?? null}
            lower={pop?.value?.lower}
            upper={pop?.value?.upper}
            meta={pop?.meta ?? COUNT_META}
            sourceName={pop?.value?.sourcePublisher}
            year={pop?.value?.year}
            isEstimate={pop?.value?.isEstimate}
            national={pop?.nationalLabel}
            href="/indicators/pop_total"
          />
          <StatTile
            label="Population density"
            value={density?.value?.value ?? null}
            meta={density?.meta ?? { unit: "people per km²", valueType: "ratio", decimals: 0 }}
            sourceName={density?.value?.sourcePublisher}
            year={density?.value?.year}
            isEstimate={density?.value?.isEstimate}
            national={density?.nationalLabel}
            rank={density?.rankLabel}
            href="/indicators/pop_density"
          />
          <StatTile
            label="Area"
            value={unit.areaSqKm ?? null}
            meta={AREA_META}
            sourceName={unit.boundaryVersion ? `Boundary ${unit.boundaryVersion}` : undefined}
          />
          {childLabel && (
            <StatTile
              label={childLabel}
              value={childUnits.length > 0 ? childUnits.length : null}
              meta={COUNT_META}
              sourceName="PopLens geography"
            />
          )}
          <StatTile
            label="Health facilities"
            value={facilities.total > 0 ? facilities.total : null}
            meta={COUNT_META}
            sourceName={facilities.sourceName ?? "Facility list"}
            year={facilities.sourceVersion}
          />
        </div>
        {childUnits.length > 0 && childUnits.length <= 60 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">
              {childUnits.length} {LEVEL_PLURAL[childUnits[0]!.level]} in {unit.name}
            </summary>
            <ul className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-3 md:grid-cols-4">
              {childUnits.map((c) => (
                <li key={c.id}>
                  <Link href={`/places/${c.code}`} className="hover:underline">
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        )}
      </Section>

      <Section id="age-sex" title="Age and sex">
        <Suspense fallback={fallback}>
          <AgeSexSection unit={unit} />
        </Suspense>
      </Section>

      <Section
        id="indicators"
        title="Indicators"
        aside={
          unit.level !== "nation" ? (
            <Link
              href={exploreHref("pop_total", pop?.value?.year, unit.level, stateUnit?.code)}
              className="text-sm text-emerald-700 hover:underline"
            >
              See on the map →
            </Link>
          ) : undefined
        }
      >
        <IndicatorTiles items={items} />
      </Section>

      <Section id="trends" title="Trends">
        <Suspense fallback={fallback}>
          <TrendsSection unit={unit} nation={nation} indicators={indicators} />
        </Suspense>
      </Section>

      <Section id="facilities" title="Health facilities">
        <FacilitiesSection unit={unit} summary={facilities} />
      </Section>

      <Section id="outbreaks" title="Outbreak history">
        <Suspense fallback={fallback}>
          <OutbreakSection unit={unit} stateUnit={stateUnit} />
        </Suspense>
      </Section>

      <Section id="sources" title="Sources used">
        <Suspense fallback={fallback}>
          <SourcesSection unit={unit} />
        </Suspense>
      </Section>

      <footer className="border-t border-border pt-4 text-xs text-muted-foreground">
        Boundary version: {unit.boundaryVersion ?? "not recorded"}. Population figures are
        modelled estimates — Nigeria&apos;s last census was in 2006. PopLens shows the finest
        level each source publishes and never estimates finer values itself.
      </footer>
    </div>
  );
}
