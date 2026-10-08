import { inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { getBoundaryGeoJSON, getGeoUnitByCode, getGeoUnitById, type GeoUnitLite } from "@/server/geo/queries";
import { getIndicatorByCode, getTrendSeries } from "@/server/indicators/queries";
import { assembleReport, type ReportIndicator, type ReportModel, type ReportPlace } from "./assemble";
import type { GeoFeatureLike } from "./geo-svg";
import type { ReportParams } from "./params";

/**
 * Database side of report building. Values come ONLY through the shared
 * published-value queries (getTrendSeries); boundaries through
 * getBoundaryGeoJSON. Usable from the worker (no server-only imports).
 */

export interface ReportMapFrame {
  place: ReportPlace;
  /** Context outline (the place's state for LGAs/wards, else the nation). */
  context: GeoFeatureLike | null;
  nation: GeoFeatureLike | null;
  feature: GeoFeatureLike | null;
}

export interface ReportData {
  model: ReportModel;
  maps: ReportMapFrame[];
  licences: Map<number, { licence: string; url: string | null; allowsRedistribution: boolean }>;
  missing: { places: string[]; indicators: string[] };
}

export async function resolveReportPlaces(codes: string[]): Promise<{ found: GeoUnitLite[]; missing: string[] }> {
  const found: GeoUnitLite[] = [];
  const missing: string[] = [];
  for (const c of codes) {
    const u = await getGeoUnitByCode(c);
    if (u) found.push(u);
    else missing.push(c);
  }
  return { found, missing };
}

export async function loadReportData(params: ReportParams): Promise<ReportData> {
  const { found: units, missing: missingPlaces } = await resolveReportPlaces(params.placeCodes);
  const indicators: ReportIndicator[] = [];
  const missingIndicators: string[] = [];
  for (const code of params.indicatorCodes) {
    const ind = await getIndicatorByCode(code);
    if (!ind) {
      missingIndicators.push(code);
      continue;
    }
    indicators.push({
      id: ind.id,
      code: ind.code,
      name: ind.name,
      definition: ind.definition,
      unit: ind.unit,
      valueType: ind.valueType,
      decimals: ind.decimals,
      higherIsBetter: ind.higherIsBetter,
    });
  }
  const places: ReportPlace[] = units.map((u) => ({ id: u.id, code: u.code, name: u.name, level: u.level }));
  const placeIds = places.map((p) => p.id);

  const valuesByIndicator = new Map<number, Awaited<ReturnType<typeof getTrendSeries>>>();
  for (const ind of indicators) valuesByIndicator.set(ind.id, await getTrendSeries(ind.id, placeIds));

  const model = assembleReport({ places, indicators, valuesByIndicator, year: params.year ?? null });

  // Maps: nation outline, plus the place's state as context for sub-state units.
  const nationUnit = await getGeoUnitByCode("NG");
  const nation = nationUnit ? await getBoundaryGeoJSON(nationUnit.id) : null;
  const stateCache = new Map<number, GeoFeatureLike | null>();
  const maps: ReportMapFrame[] = [];
  for (const u of units) {
    const feature = await getBoundaryGeoJSON(u.id);
    let context: GeoFeatureLike | null = nation;
    if ((u.level === "lga" || u.level === "ward") && u.stateId) {
      if (!stateCache.has(u.stateId)) {
        const st = await getGeoUnitById(u.stateId);
        stateCache.set(u.stateId, st ? await getBoundaryGeoJSON(st.id) : null);
      }
      context = stateCache.get(u.stateId) ?? nation;
    }
    maps.push({
      place: { id: u.id, code: u.code, name: u.name, level: u.level },
      context,
      nation,
      feature,
    });
  }

  const sourceIds = [...new Set(model.sources.map((s) => s.sourceId))];
  const licenceRows = sourceIds.length
    ? await db
        .select({
          id: schema.sources.id,
          licence: schema.sources.licence,
          url: schema.sources.licenceUrl,
          allowsRedistribution: schema.sources.allowsRedistribution,
        })
        .from(schema.sources)
        .where(inArray(schema.sources.id, sourceIds))
    : [];
  const licences = new Map(licenceRows.map((r) => [r.id, r]));

  return { model, maps, licences, missing: { places: missingPlaces, indicators: missingIndicators } };
}
