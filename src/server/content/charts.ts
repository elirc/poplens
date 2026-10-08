import {
  getAvailableYears,
  getIndicatorByCode,
  getPublishedValue,
  getTrendSeries,
  getValuesForLevel,
  type IndicatorMetaRow,
  type PublicValue,
} from "@/server/indicators/queries";
import { computeRanks } from "@/server/indicators/ranks";
import { getGeoUnitByCode, type GeoUnitLite } from "@/server/geo/queries";
import { LEVEL_PLURAL } from "@/components/indicators/labels";
import { OKABE_ITO, toTrendPoints } from "@/components/indicators/to-points";
import type {
  BarRow,
  ChartIndicator,
  ChartResult,
  ChartSpec,
} from "@/components/content/types";

/**
 * Live chart data for a story shortcode / embed. Values come ONLY from the
 * published-value queries (src/server/indicators/queries.ts). Never throws
 * for bad input: unknown indicators/places come back as { ok: false }.
 */

export function toChartIndicator(i: IndicatorMetaRow): ChartIndicator {
  return {
    code: i.code,
    name: i.name,
    unit: i.unit,
    valueType: i.valueType,
    decimals: i.decimals,
    higherIsBetter: i.higherIsBetter,
  };
}

/** Attribution label for a published value's source. */
export function sourceNameOf(r: Pick<PublicValue, "sourcePublisher" | "isSynthetic">): string {
  return r.isSynthetic ? `${r.sourcePublisher} — SYNTHETIC demo data` : r.sourcePublisher;
}

export async function resolvePlaces(
  codes: string[],
): Promise<{ ok: true; units: GeoUnitLite[] } | { ok: false; message: string }> {
  const units: GeoUnitLite[] = [];
  const unknown: string[] = [];
  for (const c of codes) {
    const u = await getGeoUnitByCode(c);
    if (u) units.push(u);
    else unknown.push(c);
  }
  if (unknown.length > 0) {
    return { ok: false, message: `Unknown place code${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}` };
  }
  return { ok: true, units };
}

function toBarRow(r: PublicValue, unit: { code: string; name: string }): BarRow {
  return {
    code: unit.code,
    name: unit.name,
    value: Number(r.value),
    lower: r.lower == null ? null : Number(r.lower),
    upper: r.upper == null ? null : Number(r.upper),
    year: Number(r.year),
    isEstimate: Boolean(r.isEstimate),
    sourceName: sourceNameOf(r),
  };
}

export async function loadChartData(spec: ChartSpec): Promise<ChartResult> {
  try {
    return await loadChartDataInner(spec);
  } catch (e) {
    console.error("[content] chart data failed", spec, e);
    return { ok: false, message: "This chart could not be loaded right now." };
  }
}

async function loadChartDataInner(spec: ChartSpec): Promise<ChartResult> {
  const ind = await getIndicatorByCode(spec.indicator);
  if (!ind) return { ok: false, message: `Unknown indicator "${spec.indicator}"` };
  const indicator = toChartIndicator(ind);

  if (spec.type === "top5") {
    const years = await getAvailableYears(ind.id, spec.level);
    const year = spec.year ?? years[years.length - 1] ?? null;
    const rows = year == null ? [] : await getValuesForLevel(ind.id, spec.level, year);
    // Top 5 = the five HIGHEST values (rank 1 = largest), whatever the direction;
    // ranks come from the shared ranking module.
    const ranked = computeRanks(
      rows.map((r) => ({ geoUnitId: Number(r.geoUnitId), value: Number(r.value) })),
      null,
    );
    const byId = new Map(rows.map((r) => [Number(r.geoUnitId), r]));
    const top = ranked.slice(0, 5).map((rk) => {
      const r = byId.get(rk.geoUnitId)!;
      return { ...toBarRow(r, r), rank: rk.rank, outOf: rk.outOf };
    });
    return {
      ok: true,
      data: {
        type: "top5",
        spec,
        title:
          spec.title ??
          `Highest ${ind.name.toLowerCase()} — ${LEVEL_PLURAL[spec.level] ?? spec.level}${year != null ? ` (${year})` : ""}`,
        indicator,
        rows: top,
        missing: [],
        year,
        isSynthetic: rows.some((r) => r.isSynthetic),
      },
    };
  }

  const places = await resolvePlaces(spec.places);
  if (!places.ok) return places;
  const units = places.units;

  if (spec.type === "trend") {
    const rows = await getTrendSeries(ind.id, units.map((u) => u.id));
    const series = units.map((u, i) => ({
      key: u.code,
      label: u.name,
      color: OKABE_ITO[i % OKABE_ITO.length]!,
      points: toTrendPoints(
        rows.map((r) => ({ ...r, sourcePublisher: sourceNameOf(r) })),
        u.id,
      ),
    }));
    return {
      ok: true,
      data: {
        type: "trend",
        spec,
        title: spec.title ?? `${ind.name}: ${units.map((u) => u.name).join(", ")}`,
        indicator,
        series,
        missing: series.filter((s) => s.points.length === 0).map((s) => ({ code: s.key, name: s.label })),
        isSynthetic: rows.some((r) => r.isSynthetic),
      },
    };
  }

  // bar: one value per place, for the given year (or each place's latest).
  const out: BarRow[] = [];
  const missing: Array<{ code: string; name: string }> = [];
  let anySynthetic = false;
  for (const u of units) {
    const v = await getPublishedValue(ind.id, u.id, spec.year ? { year: spec.year } : {});
    if (v) {
      out.push(toBarRow(v, u));
      anySynthetic ||= v.isSynthetic;
    } else {
      missing.push({ code: u.code, name: u.name });
    }
  }
  const years = [...new Set(out.map((r) => r.year))];
  const year = spec.year ?? (years.length === 1 ? years[0]! : null);
  return {
    ok: true,
    data: {
      type: "bar",
      spec,
      title: spec.title ?? `${ind.name}${year != null ? `, ${year}` : " — latest year for each place"}`,
      indicator,
      rows: out,
      missing,
      year,
      isSynthetic: anySynthetic,
    },
  };
}
