import {
  getAvailableYears,
  getIndicatorByCode,
  getPublishedValue,
  getTrendSeries,
  getValuesForLevel,
  type PublicValue,
} from "@/server/indicators/queries";
import { computeRanks, ordinal, rankOf } from "@/server/indicators/ranks";
import { getGeoUnitByCode, getGeoUnitById, type GeoUnitLite } from "@/server/geo/queries";
import { formatValue, NO_DATA, sourceLine } from "@/lib/format";
import { LEVEL_PLURAL, exploreHref } from "@/components/indicators/labels";
import type { CardData, CardSpec } from "@/components/content/types";
import { defaultCardTitle } from "./card-spec";
import { toChartIndicator } from "./charts";

/**
 * Assemble an insight card from LIVE published values via its spec. Used by
 * the OG image routes, the share page and the generator preview — so the
 * image always matches the current published data.
 */

export type CardResult = { ok: true; data: CardData } | { ok: false; message: string };

function publisherLine(rows: Array<Pick<PublicValue, "sourcePublisher">>): string {
  const names = [...new Set(rows.map((r) => r.sourcePublisher))];
  return names.join("; ") || "No source";
}

async function rankLineFor(
  indicatorId: number,
  higherIsBetter: boolean | null,
  unit: GeoUnitLite,
  year: number,
): Promise<string | null> {
  if (unit.level !== "state" && unit.level !== "lga") return null;
  const rows = await getValuesForLevel(indicatorId, unit.level, year);
  const ranked = computeRanks(
    rows.map((r) => ({ geoUnitId: Number(r.geoUnitId), value: Number(r.value) })),
    higherIsBetter,
  );
  const mine = rankOf(ranked, unit.id);
  if (!mine) return null;
  const dir = higherIsBetter === null ? "by value" : higherIsBetter ? "1st = highest" : "1st = lowest";
  return `Ranks ${ordinal(mine.rank)} of ${mine.outOf} ${LEVEL_PLURAL[unit.level]} (${dir})`;
}

async function parentStateCode(unit: GeoUnitLite): Promise<string | null> {
  if (unit.level !== "lga" || !unit.stateId) return null;
  return (await getGeoUnitById(unit.stateId))?.code ?? null;
}

export async function buildCardData(spec: CardSpec, titleOverride?: string | null): Promise<CardResult> {
  try {
    return await build(spec, titleOverride ?? null);
  } catch (e) {
    console.error("[content] card data failed", spec, e);
    return { ok: false, message: "This card could not be built right now." };
  }
}

async function build(spec: CardSpec, titleOverride: string | null): Promise<CardResult> {
  const ind = await getIndicatorByCode(spec.indicatorCode);
  if (!ind) return { ok: false, message: `Unknown indicator "${spec.indicatorCode}"` };
  const indicator = toChartIndicator(ind);
  const fmt = (v: number | null) => formatValue(v, indicator);

  const base = {
    kind: spec.kind,
    indicator,
    national: null,
    rankLine: null,
    rows: [],
    points: [],
    sourcesDiffer: false,
  } satisfies Partial<CardData>;

  if (spec.kind === "top5") {
    const level = spec.level ?? "state";
    const years = await getAvailableYears(ind.id, level);
    const year = spec.year ?? years[years.length - 1] ?? null;
    const values = year == null ? [] : await getValuesForLevel(ind.id, level, year);
    const ranked = computeRanks(
      values.map((r) => ({ geoUnitId: Number(r.geoUnitId), value: Number(r.value) })),
      null,
    ).slice(0, 5);
    const byId = new Map(values.map((r) => [Number(r.geoUnitId), r]));
    const rows = ranked.map((rk) => {
      const r = byId.get(rk.geoUnitId)!;
      return { rank: rk.rank, name: r.name, formatted: fmt(Number(r.value)), raw: Number(r.value) };
    });
    const used = ranked.map((rk) => byId.get(rk.geoUnitId)!);
    return {
      ok: true,
      data: {
        ...base,
        rows,
        title: titleOverride || defaultCardTitle(spec, { indicator: ind.name, year }),
        year,
        place: null,
        headline: rows[0]?.formatted ?? NO_DATA,
        headlineRaw: rows[0]?.raw ?? null,
        rankLine: values.length > 0 ? `Top 5 of ${values.length} ${LEVEL_PLURAL[level]} by value` : null,
        sourceLine: sourceLine({
          sourceName: publisherLine(used),
          year,
          isEstimate: used.some((r) => r.isEstimate),
        }),
        isSynthetic: used.some((r) => r.isSynthetic),
        isEstimate: used.some((r) => r.isEstimate),
        exploreHref: exploreHref(ind.code, year, level),
        profileHref: null,
      },
    };
  }

  const placeCode = spec.placeCodes?.[0] ?? "NG";
  const unit = await getGeoUnitByCode(placeCode);
  if (!unit) return { ok: false, message: `Unknown place code "${placeCode}"` };
  const place = { code: unit.code, name: unit.name, level: unit.level };
  const parent = await parentStateCode(unit);
  const mapLevel = unit.level === "lga" ? "lga" : "state";
  const profileHref = `/places/${encodeURIComponent(unit.code)}`;

  if (spec.kind === "trend") {
    const series = await getTrendSeries(ind.id, [unit.id]);
    // One point per year (latest-published dataset wins for a year); sources
    // are never silently joined — the card flags a source change.
    const byYear = new Map<number, PublicValue>();
    for (const r of series) byYear.set(Number(r.year), r);
    const pts = [...byYear.values()].sort((a, b) => Number(a.year) - Number(b.year));
    const last = pts[pts.length - 1] ?? null;
    const year = last ? Number(last.year) : null;
    const first = pts[0] ?? null;
    return {
      ok: true,
      data: {
        ...base,
        title: titleOverride || defaultCardTitle(spec, { indicator: ind.name, place: unit.name }),
        year,
        place,
        headline: fmt(last ? Number(last.value) : null),
        headlineRaw: last ? Number(last.value) : null,
        rankLine:
          first && last && first !== last
            ? `${first.year}: ${fmt(Number(first.value))}, ${last.year}: ${fmt(Number(last.value))}`
            : null,
        points: pts.map((p) => ({
          year: Number(p.year),
          raw: Number(p.value),
          formatted: fmt(Number(p.value)),
          sourceId: Number(p.sourceId),
        })),
        sourcesDiffer: new Set(pts.map((p) => p.sourceId)).size > 1,
        sourceLine: sourceLine({
          sourceName: publisherLine(pts),
          year: first && last && first !== last ? `${first.year}–${last.year}` : year,
          isEstimate: pts.some((p) => p.isEstimate),
        }),
        isSynthetic: pts.some((p) => p.isSynthetic),
        isEstimate: pts.some((p) => p.isEstimate),
        exploreHref: exploreHref(ind.code, year, mapLevel, parent),
        profileHref,
      },
    };
  }

  // single_stat and vs_national: the place's value for the year (or latest).
  const v = await getPublishedValue(ind.id, unit.id, spec.year ? { year: spec.year } : {});
  const year = v ? Number(v.year) : (spec.year ?? null);
  let national: CardData["national"] = null;
  const used: PublicValue[] = v ? [v] : [];
  if (spec.kind === "vs_national") {
    const ng = await getGeoUnitByCode("NG");
    const nv = ng && year != null ? await getPublishedValue(ind.id, ng.id, { year }) : null;
    national = { formatted: fmt(nv ? Number(nv.value) : null), raw: nv ? Number(nv.value) : null };
    if (nv) used.push(nv);
  }
  const rankLine = v && year != null ? await rankLineFor(ind.id, ind.higherIsBetter, unit, year) : null;
  return {
    ok: true,
    data: {
      ...base,
      title: titleOverride || defaultCardTitle(spec, { indicator: ind.name, place: unit.name, year }),
      year,
      place,
      headline: fmt(v ? Number(v.value) : null),
      headlineRaw: v ? Number(v.value) : null,
      national,
      rankLine,
      sourceLine: sourceLine({
        sourceName: publisherLine(used),
        year,
        isEstimate: used.some((r) => r.isEstimate),
      }),
      isSynthetic: used.some((r) => r.isSynthetic),
      isEstimate: used.some((r) => r.isEstimate),
      exploreHref: exploreHref(ind.code, year, mapLevel, parent),
      profileHref,
    },
  };
}
