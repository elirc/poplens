import {
  getGeoUnitByCode,
  getGeoUnitById,
  listGeoUnits,
  type GeoUnitLite,
} from "@/server/geo/queries";
import {
  getAvailableYears,
  getIndicatorByCode,
  getPublishedValue,
  getTrendSeries,
  getValuesForLevel,
  listIndicators,
  type IndicatorMetaRow,
} from "@/server/indicators/queries";
import type { Disease, RankingLevel } from "@/components/analytics/params";
import { DISEASES } from "@/components/analytics/params";
import type {
  CompareBar,
  CompareChartData,
  CompareData,
  IndicatorOption,
  OutbreaksData,
  PlaceOption,
  RankingsData,
  RelationshipsData,
  TrendsData,
} from "@/components/analytics/types";
import { getOutbreakWeekly, listOutbreakDiseases, listOutbreakYears } from "./outbreaks";
import {
  buildRankings,
  commonYears,
  dedupeTrendRows,
  pairValues,
  pickCompareYear,
  resolveYear,
  sourceLabel,
  toCell,
} from "./shape";
import { describeCorrelation, relationshipStats, skipReasonText } from "./stats";

/**
 * Data loaders for the analytics pages. Values come ONLY through
 * src/server/indicators/queries.ts (published-dataset join); outbreak rows
 * through ./outbreaks.ts (same rule). Every result is a small, plain,
 * JSON-serialisable payload for the client views (see ./cached.ts).
 */

export function toIndicatorOption(m: IndicatorMetaRow): IndicatorOption {
  return {
    code: m.code,
    name: m.name,
    category: m.category,
    unit: m.unit,
    valueType: m.valueType,
    decimals: m.decimals,
    higherIsBetter: m.higherIsBetter,
  };
}

export async function loadIndicatorOptions(): Promise<IndicatorOption[]> {
  return (await listIndicators()).map(toIndicatorOption);
}

/** Quick-pick places for the pickers: Nigeria + every state. */
export async function loadPlaceOptions(): Promise<PlaceOption[]> {
  const [nations, states] = await Promise.all([listGeoUnits("nation"), listGeoUnits("state")]);
  return [...nations, ...states].map((u) => ({ code: u.code, name: u.name, level: u.level }));
}

async function resolveUnit(code: string): Promise<GeoUnitLite | null> {
  return (await getGeoUnitByCode(code)) ?? (await getGeoUnitByCode(code.toUpperCase()));
}

/** PlaceOption with a short context ("LGA, Kano" / "Ward, Gwale LGA"). */
async function toPlaceOption(u: GeoUnitLite): Promise<PlaceOption> {
  let context: string | null = null;
  if (u.level === "lga" || u.level === "ward") {
    const parent = u.parentId ? await getGeoUnitById(u.parentId) : null;
    if (u.level === "lga") context = parent ? `LGA, ${parent.name}` : "LGA";
    else context = parent ? `Ward, ${parent.name} LGA` : "Ward";
  }
  return { code: u.code, name: u.name, level: u.level, context };
}

async function resolvePlaces(
  codes: string[],
): Promise<{ units: GeoUnitLite[]; options: PlaceOption[]; unknown: string[] }> {
  const resolved = await Promise.all(codes.map(resolveUnit));
  const units: GeoUnitLite[] = [];
  const unknown: string[] = [];
  resolved.forEach((u, i) => {
    if (u && !units.some((x) => x.id === u.id)) units.push(u);
    else if (!u) unknown.push(codes[i]!);
  });
  const options = await Promise.all(units.map(toPlaceOption));
  return { units, options, unknown };
}

async function nationUnit(): Promise<GeoUnitLite | null> {
  return (await listGeoUnits("nation"))[0] ?? null;
}

/* ── compare ─────────────────────────────────────────────────────────── */

export async function loadCompare(placeCodes: string[], indicatorCodes: string[]): Promise<CompareData> {
  const [{ units, options, unknown }, nation] = await Promise.all([
    resolvePlaces(placeCodes),
    nationUnit(),
  ]);
  const metas = await Promise.all(indicatorCodes.map((c) => getIndicatorByCode(c)));
  const unknownIndicators = indicatorCodes.filter((_, i) => !metas[i]);

  const chartFor = async (meta: IndicatorMetaRow): Promise<CompareChartData> => {
    const series = units.length ? await getTrendSeries(meta.id, units.map((u) => u.id)) : [];
    const yearsByPlace = new Map<string, number[]>(
      units.map((u) => [
        u.code,
        [...new Set(series.filter((r) => r.geoUnitId === u.id).map((r) => Number(r.year)))],
      ]),
    );
    const choice = pickCompareYear(yearsByPlace);
    const bars: CompareBar[] = await Promise.all(
      units.map(async (u) => {
        const year =
          choice.mode === "common"
            ? choice.year
            : choice.mode === "latest-each"
              ? (choice.years.get(u.code) ?? null)
              : null;
        const v = year != null ? await getPublishedValue(meta.id, u.id, { year }) : null;
        return { code: u.code, name: u.name, level: u.level, cell: v ? toCell(v) : null };
      }),
    );
    let national: CompareChartData["national"] = null;
    if (nation) {
      const v =
        choice.mode === "common"
          ? await getPublishedValue(meta.id, nation.id, { year: choice.year })
          : await getPublishedValue(meta.id, nation.id);
      national = v ? toCell(v) : null;
    }
    return {
      indicator: toIndicatorOption(meta),
      mode: choice.mode,
      year: choice.mode === "common" ? choice.year : null,
      bars,
      national,
    };
  };
  const charts = await Promise.all(
    metas.filter((m): m is IndicatorMetaRow => m != null).map(chartFor),
  );
  return { places: options, unknownPlaces: unknown, unknownIndicators, charts };
}

/* ── rankings ────────────────────────────────────────────────────────── */

export async function loadRankings(
  indicatorCode: string,
  level: RankingLevel,
  requestedYear: number | null,
): Promise<RankingsData | null> {
  const meta = await getIndicatorByCode(indicatorCode);
  if (!meta) return null;
  const [years, units, states] = await Promise.all([
    getAvailableYears(meta.id, level),
    listGeoUnits(level),
    level === "lga" ? listGeoUnits("state") : Promise.resolve([] as GeoUnitLite[]),
  ]);
  const { year, fallback } = resolveYear(requestedYear, years.map(Number));
  const stateName = new Map(states.map((s) => [s.id, s.name]));
  const places = units.map((u) => ({
    id: u.id,
    code: u.code,
    name: u.name,
    parent: level === "lga" ? (stateName.get(u.stateId ?? u.parentId ?? -1) ?? null) : null,
  }));
  const values = year != null ? await getValuesForLevel(meta.id, level, year) : [];
  const { rows, noData } = buildRankings(places, values, meta.higherIsBetter);
  return {
    indicator: toIndicatorOption(meta),
    level,
    years: years.map(Number),
    year,
    yearFallback: fallback,
    rows,
    noData,
  };
}

/* ── trends ──────────────────────────────────────────────────────────── */

export async function loadTrends(indicatorCode: string, placeCodes: string[]): Promise<TrendsData | null> {
  const meta = await getIndicatorByCode(indicatorCode);
  if (!meta) return null;
  const { units, options, unknown } = await resolvePlaces(placeCodes);
  const rows = units.length ? dedupeTrendRows(await getTrendSeries(meta.id, units.map((u) => u.id))) : [];
  return {
    indicator: toIndicatorOption(meta),
    places: options,
    unknownPlaces: unknown,
    series: units.map((u) => ({
      code: u.code,
      name: u.name,
      level: u.level,
      points: rows.filter((r) => r.geoUnitId === u.id).map(toCell),
    })),
  };
}

/* ── relationships ───────────────────────────────────────────────────── */

export async function loadRelationships(
  xCode: string,
  yCode: string,
  requestedYear: number | null,
): Promise<RelationshipsData | null> {
  const [xm, ym] = await Promise.all([getIndicatorByCode(xCode), getIndicatorByCode(yCode)]);
  if (!xm || !ym) return null;
  const [xYears, yYears, states] = await Promise.all([
    getAvailableYears(xm.id, "state"),
    getAvailableYears(ym.id, "state"),
    listGeoUnits("state"),
  ]);
  const common = commonYears(xYears.map(Number), yYears.map(Number));
  const { year, fallback } = resolveYear(requestedYear, common);
  const [xs, ys] =
    year != null
      ? await Promise.all([
          getValuesForLevel(xm.id, "state", year),
          getValuesForLevel(ym.id, "state", year),
        ])
      : [[], []];
  const { points, missing } = pairValues(
    states.map((s) => ({ id: s.id, code: s.code, name: s.name })),
    xs,
    ys,
  );
  const s = relationshipStats(points.map((p) => ({ x: p.x, y: p.y })));
  return {
    x: toIndicatorOption(xm),
    y: toIndicatorOption(ym),
    commonYears: common,
    year,
    yearFallback: fallback,
    points,
    missing,
    totalStates: states.length,
    stats: {
      n: s.n,
      r: s.r,
      slope: s.fit?.slope ?? null,
      intercept: s.fit?.intercept ?? null,
      r2: s.fit?.r2 ?? null,
      skipped: s.skipped,
      description: describeCorrelation(s.r),
      skipText: skipReasonText(s.skipped, s.n),
    },
  };
}

/* ── outbreaks ───────────────────────────────────────────────────────── */

export async function loadOutbreaks(disease: Disease, requestedYear: number | null): Promise<OutbreaksData> {
  const [withData, years] = await Promise.all([listOutbreakDiseases(), listOutbreakYears(disease)]);
  const { year } = resolveYear(requestedYear, years);
  const weekly = year != null ? await getOutbreakWeekly(disease, year) : { rows: [], sources: [] };
  const lastWeek = weekly.rows.length ? Math.max(...weekly.rows.map((r) => r.week)) : null;
  return {
    disease,
    diseasesWithData: DISEASES.filter((d) => withData.includes(d)),
    years,
    year,
    rows: weekly.rows,
    lastWeek,
    sources: weekly.sources.map((s) => sourceLabel(s.publisher, s.isSynthetic)),
  };
}
