import Link from "next/link";
import type { GeoUnitLite } from "@/server/geo/queries";
import {
  getSourcesForPlace,
  getTrendSeries,
  type IndicatorMetaRow,
} from "@/server/indicators/queries";
import { getAgeSexBreakdown } from "@/server/search/profile-extra";
import { KEY_INDICATORS } from "@/server/indicators/catalogue-data";
import { TrendChart } from "@/components/indicators/trend-chart";
import { OKABE_ITO, toTrendPoints } from "@/components/indicators/to-points";
import { SourceLine } from "@/components/data/source-line";
import { compactNumber, NO_DATA } from "@/lib/format";
import { AgeSexPyramid } from "./age-sex-pyramid";
import { buildPyramid } from "./pyramid-data";
import { getOutbreakHistory, type FacilitySummary } from "./profile-data";
import { OutbreakCharts } from "./outbreak-charts";

/** Async server sections of the place profile, each streamed behind Suspense. */

export function NoDataBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
      {children}
    </div>
  );
}

export async function AgeSexSection({ unit }: { unit: GeoUnitLite }) {
  const breakdown = await getAgeSexBreakdown(unit.id);
  const pyramid = breakdown ? buildPyramid(breakdown.rows) : null;
  if (!breakdown || !pyramid) {
    return (
      <NoDataBox>
        {NO_DATA}: no age and sex breakdown is published for {unit.name}.
      </NoDataBox>
    );
  }
  return (
    <AgeSexPyramid
      data={pyramid}
      sourceName={breakdown.sourceName}
      year={breakdown.year}
      isEstimate={breakdown.isEstimate}
    />
  );
}

export async function TrendsSection({
  unit,
  nation,
  indicators,
}: {
  unit: GeoUnitLite;
  nation: GeoUnitLite | null;
  indicators: IndicatorMetaRow[];
}) {
  const byCode = new Map(indicators.map((i) => [i.code, i]));
  const keyMetas = KEY_INDICATORS.map((c) => byCode.get(c)).filter(
    (m): m is IndicatorMetaRow => Boolean(m),
  );
  const ids = nation && nation.id !== unit.id ? [unit.id, nation.id] : [unit.id];
  const loaded = await Promise.all(
    keyMetas.map(async (meta) => ({ meta, rows: await getTrendSeries(meta.id, ids) })),
  );
  const charts = loaded
    .filter((l) => l.rows.some((r) => r.geoUnitId === unit.id))
    .slice(0, 6);

  if (charts.length === 0) {
    return <NoDataBox>{NO_DATA}: no published time series for {unit.name}.</NoDataBox>;
  }
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {charts.map(({ meta, rows }) => (
        <TrendChart
          key={meta.code}
          title={`${meta.name} (${meta.unit})`}
          meta={{ unit: meta.unit, valueType: meta.valueType, decimals: meta.decimals }}
          height={180}
          series={[
            {
              key: "place",
              label: unit.name,
              color: OKABE_ITO[0],
              points: toTrendPoints(rows, unit.id),
            },
            ...(nation && nation.id !== unit.id
              ? [
                  {
                    key: "nation",
                    label: nation.name,
                    color: OKABE_ITO[1],
                    points: toTrendPoints(rows, nation.id),
                  },
                ]
              : []),
          ]}
        />
      ))}
    </div>
  );
}

const CARE_LABEL = { primary: "Primary", secondary: "Secondary", tertiary: "Tertiary" } as const;
const OWNERSHIP_LABEL: Record<string, string> = {
  public: "Public",
  private: "Private",
  faith_based: "Faith-based",
  ngo: "NGO",
  unknown: "Unknown",
};

export function FacilitiesSection({
  unit,
  summary: f,
}: {
  unit: GeoUnitLite;
  summary: FacilitySummary;
}) {
  const filterParam =
    unit.level === "lga"
      ? `?lga=${encodeURIComponent(unit.code)}`
      : unit.level === "state"
        ? `?state=${encodeURIComponent(unit.code)}`
        : "";
  if (f.total === 0) {
    return (
      <NoDataBox>
        {NO_DATA}: no health facilities are listed for {unit.name} in the published facility list.
      </NoDataBox>
    );
  }
  const source = f.sourceName ?? "Health facility list";
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-3 gap-3 text-center">
        {(["tertiary", "secondary", "primary"] as const).map((lvl) => (
          <div key={lvl} className="rounded-lg border border-border bg-card p-3">
            <dt className="text-xs text-muted-foreground">{CARE_LABEL[lvl]}</dt>
            <dd className="text-xl font-semibold tabular-nums">
              {f.byLevel[lvl].toLocaleString("en-NG")}
            </dd>
          </div>
        ))}
      </dl>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <caption className="sr-only">
            Up to 15 facilities in {unit.name}, highest level of care first
          </caption>
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="p-2 font-medium">Facility</th>
              <th className="p-2 font-medium">Type</th>
              <th className="p-2 font-medium">Level</th>
              <th className="hidden p-2 font-medium sm:table-cell">Ownership</th>
              {unit.level !== "lga" && unit.level !== "ward" && (
                <th className="hidden p-2 font-medium md:table-cell">LGA</th>
              )}
            </tr>
          </thead>
          <tbody>
            {f.top.map((x) => (
              <tr key={x.id} className="border-b border-border/60 last:border-0">
                <td className="p-2">{x.name}</td>
                <td className="p-2 text-muted-foreground">{x.type}</td>
                <td className="p-2">{CARE_LABEL[x.careLevel]}</td>
                <td className="hidden p-2 sm:table-cell">{OWNERSHIP_LABEL[x.ownership] ?? x.ownership}</td>
                {unit.level !== "lga" && unit.level !== "ward" && (
                  <td className="hidden p-2 md:table-cell">{x.lgaName ?? "—"}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SourceLine sourceName={source} year={f.sourceVersion} />
        <Link
          href={`/facilities${filterParam}`}
          className="text-sm font-medium text-emerald-700 hover:underline"
        >
          All {compactNumber(f.total)} facilities on the map →
        </Link>
      </div>
    </div>
  );
}

export async function OutbreakSection({
  unit,
  stateUnit,
}: {
  unit: GeoUnitLite;
  stateUnit: GeoUnitLite | null;
}) {
  // Outbreak data is state-level: LGAs and wards show their parent state's history.
  const isNational = unit.level === "nation";
  if (!isNational && !stateUnit) {
    return (
      <NoDataBox>
        Outbreak reports are published per state; open a state profile to see them.
      </NoDataBox>
    );
  }
  const history = await getOutbreakHistory(
    isNational ? null : stateUnit!.id,
    isNational
      ? "All states combined"
      : unit.id === stateUnit!.id
        ? `${stateUnit!.name} State`
        : `State-level figures for ${stateUnit!.name} (outbreak reports are not published below state level)`,
  );
  if (!history) {
    return <NoDataBox>{NO_DATA}: no published outbreak reports for this area.</NoDataBox>;
  }
  return <OutbreakCharts history={history} />;
}

export async function SourcesSection({ unit }: { unit: GeoUnitLite }) {
  const sources = await getSourcesForPlace(unit.id);
  if (sources.length === 0) {
    return <NoDataBox>No published datasets include {unit.name} yet.</NoDataBox>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="p-2 font-medium">Publisher</th>
            <th className="p-2 font-medium">Dataset</th>
            <th className="p-2 font-medium">Years</th>
            <th className="p-2 font-medium">Licence</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((s, i) => (
            <tr key={`${s.datasetTitle}-${i}`} className="border-b border-border/60 last:border-0">
              <td className="p-2">{s.publisher}</td>
              <td className="p-2">{s.datasetTitle}</td>
              <td className="p-2 tabular-nums">{s.year ?? "—"}</td>
              <td className="p-2 text-muted-foreground">{s.licence}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
