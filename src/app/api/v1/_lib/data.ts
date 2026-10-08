import { and, asc, eq, ilike, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, schema } from "@/db";
import { getCentre, getGeoUnitByCode, type GeoLevel } from "@/server/geo/queries";
import {
  getAvailableYears,
  getCoverage,
  getIndicatorByCode,
  getTrendSeries,
  getValuesForLevel,
  listIndicators,
  type IndicatorMetaRow,
  type PublicValue,
} from "@/server/indicators/queries";
import { ApiProblem } from "./http";

/**
 * Data access for the public API. Indicator values come ONLY through the
 * shared published-value queries; facilities/outbreaks are read here with
 * the same published-dataset rule. LICENCE GATE: anything whose source does
 * not allow redistribution is excluded — values are filtered by the set of
 * redistributable source ids (selected in SQL), facilities and outbreaks by
 * a SQL join condition on sources.allows_redistribution.
 */

export const PAGE_SIZE = {
  places: 100,
  values: 500,
  facilities: 100,
  outbreaks: 200,
} as const;

/* ── Places ──────────────────────────────────────────────────────────────── */

const parent = alias(schema.geoUnits, "parent");

const placeColumns = {
  id: schema.geoUnits.id,
  code: schema.geoUnits.code,
  name: schema.geoUnits.name,
  level: schema.geoUnits.level,
  parentCode: parent.code,
  parentName: parent.name,
};

type PlaceRow = { id: number; code: string; name: string; level: string; parentCode: string | null; parentName: string | null };

function placeOut(r: PlaceRow) {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    level: r.level,
    parent: r.parentCode ? { code: r.parentCode, name: r.parentName } : null,
  };
}

export async function listPlaces(q: { level?: GeoLevel; parent?: string; q?: string; page: number }) {
  const conds: SQL[] = [];
  if (q.level) conds.push(eq(schema.geoUnits.level, q.level));
  if (q.parent) {
    const p = await getGeoUnitByCode(q.parent);
    if (!p) throw new ApiProblem(404, "not_found", `Unknown parent place '${q.parent}'`);
    conds.push(eq(schema.geoUnits.parentId, p.id));
  }
  if (q.q) conds.push(ilike(schema.geoUnits.name, `%${q.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`));
  const where = conds.length ? and(...conds) : undefined;
  const size = PAGE_SIZE.places;
  const [rows, total] = await Promise.all([
    db
      .select(placeColumns)
      .from(schema.geoUnits)
      .leftJoin(parent, eq(parent.id, schema.geoUnits.parentId))
      .where(where)
      .orderBy(asc(schema.geoUnits.level), asc(schema.geoUnits.name), asc(schema.geoUnits.id))
      .limit(size)
      .offset((q.page - 1) * size),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.geoUnits).where(where),
  ]);
  return { rows: (rows as PlaceRow[]).map(placeOut), total: total[0]?.n ?? 0, pageSize: size };
}

export async function getPlace(code: string) {
  const [r] = await db
    .select({
      ...placeColumns,
      areaSqKm: schema.geoUnits.areaSqKm,
      boundaryVersion: schema.geoUnits.boundaryVersion,
    })
    .from(schema.geoUnits)
    .leftJoin(parent, eq(parent.id, schema.geoUnits.parentId))
    .where(eq(schema.geoUnits.code, code))
    .limit(1);
  if (!r) return null;
  const [children] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.geoUnits)
    .where(eq(schema.geoUnits.parentId, r.id));
  const centre = await getCentre(r.id);
  return {
    ...placeOut(r as PlaceRow),
    areaSqKm: r.areaSqKm,
    boundaryVersion: r.boundaryVersion,
    centre: centre ? { lng: centre[0], lat: centre[1] } : null,
    childCount: children?.n ?? 0,
  };
}

/* ── Indicators ──────────────────────────────────────────────────────────── */

function indicatorOut(i: IndicatorMetaRow) {
  return {
    code: i.code,
    name: i.name,
    category: i.category,
    definition: i.definition,
    unit: i.unit,
    valueType: i.valueType,
    higherIsBetter: i.higherIsBetter,
    decimals: i.decimals,
  };
}

export async function listIndicatorsApi(category?: string) {
  const all = await listIndicators();
  return all.filter((i) => !category || i.category === category).map(indicatorOut);
}

export async function getIndicatorApi(code: string) {
  const i = await getIndicatorByCode(code);
  if (!i) return null;
  const coverage = await getCoverage(i.id);
  return {
    ...indicatorOut(i),
    methodNotes: i.methodNotes,
    coverage: coverage.map((c) => ({
      level: c.level,
      minYear: Number(c.minYear),
      maxYear: Number(c.maxYear),
      places: Number(c.places),
    })),
  };
}

/* ── Values (licence-gated) ──────────────────────────────────────────────── */

export async function redistributableSourceIds(): Promise<Set<number>> {
  const rows = await db
    .select({ id: schema.sources.id })
    .from(schema.sources)
    .where(eq(schema.sources.allowsRedistribution, true));
  return new Set(rows.map((r) => r.id));
}

function valueOut(v: PublicValue, place: { code: string; name: string }, indicatorCode: string) {
  return {
    indicator: indicatorCode,
    place,
    year: v.year,
    periodLabel: v.periodLabel,
    value: v.value,
    lower: v.lower,
    upper: v.upper,
    isEstimate: v.isEstimate,
    note: v.note,
    source: { key: v.sourceKey, publisher: v.sourcePublisher, title: v.sourceTitle },
    dataset: { id: v.datasetId, title: v.datasetTitle, isSynthetic: v.isSynthetic },
  };
}

export async function getValuesApi(q: {
  indicator: string;
  level?: GeoLevel;
  year?: number;
  place?: string;
  page: number;
}) {
  const ind = await getIndicatorByCode(q.indicator);
  if (!ind) throw new ApiProblem(404, "not_found", `Unknown indicator '${q.indicator}'`);
  const allowed = await redistributableSourceIds();

  let all: Array<ReturnType<typeof valueOut>> = [];
  let excluded = 0;
  let year: number | null = q.year ?? null;
  let level: GeoLevel | null = q.level ?? null;

  if (q.place) {
    const unit = await getGeoUnitByCode(q.place);
    if (!unit) throw new ApiProblem(404, "not_found", `Unknown place '${q.place}'`);
    if (level && unit.level !== level) {
      throw new ApiProblem(400, "invalid_parameter", `Place '${q.place}' is a ${unit.level}, not a ${level}`);
    }
    level = unit.level;
    const rows = (await getTrendSeries(ind.id, [unit.id])).filter((r) => year === null || r.year === year);
    for (const r of rows) {
      if (allowed.has(r.sourceId)) all.push(valueOut(r, { code: unit.code, name: unit.name }, ind.code));
      else excluded++;
    }
  } else {
    level = level ?? "state";
    if (year === null) {
      const years = await getAvailableYears(ind.id, level);
      year = years.length ? years[years.length - 1] : null;
    }
    if (year !== null) {
      // Licence gate in SQL: each place falls back to its newest allowed
      // value for the year; excludedByLicence counts places that had a value
      // but none from a redistributable source.
      const [rows, unfiltered] = await Promise.all([
        getValuesForLevel(ind.id, level, year, { redistributableOnly: true }),
        getValuesForLevel(ind.id, level, year),
      ]);
      const allowedPlaces = new Set(rows.map((r) => r.geoUnitId));
      excluded = unfiltered.filter((r) => !allowedPlaces.has(r.geoUnitId)).length;
      for (const r of rows) {
        all.push(valueOut(r, { code: r.code, name: r.name }, ind.code));
      }
      all = all.sort((a, b) => a.place.name.localeCompare(b.place.name));
    }
  }

  const size = PAGE_SIZE.values;
  const pageRows = all.slice((q.page - 1) * size, q.page * size);
  const sources = [...new Map(all.map((r) => [r.source.key, r.source])).values()];
  return {
    rows: pageRows,
    total: all.length,
    pageSize: size,
    year,
    level,
    excludedByLicence: excluded,
    sources,
    anySynthetic: all.some((r) => r.dataset.isSynthetic),
    indicator: { code: ind.code, name: ind.name, unit: ind.unit, valueType: ind.valueType },
  };
}

/* ── Facilities (licence-gated) ──────────────────────────────────────────── */

const lga = alias(schema.geoUnits, "lga");
const state = alias(schema.geoUnits, "state");

export const CARE_LEVELS = ["primary", "secondary", "tertiary"] as const;
export const OWNERSHIPS = ["public", "private", "faith_based", "ngo", "unknown"] as const;

export async function listFacilitiesApi(q: {
  lga?: string;
  state?: string;
  careLevel?: (typeof CARE_LEVELS)[number];
  ownership?: (typeof OWNERSHIPS)[number];
  page: number;
}) {
  const conds: SQL[] = [
    eq(schema.datasets.status, "published"),
    eq(schema.sources.allowsRedistribution, true),
  ];
  if (q.lga) {
    const u = await getGeoUnitByCode(q.lga);
    if (!u || u.level !== "lga") throw new ApiProblem(404, "not_found", `Unknown LGA '${q.lga}'`);
    conds.push(eq(schema.healthFacilities.lgaId, u.id));
  }
  if (q.state) {
    const u = await getGeoUnitByCode(q.state);
    if (!u || u.level !== "state") throw new ApiProblem(404, "not_found", `Unknown state '${q.state}'`);
    conds.push(eq(schema.healthFacilities.stateId, u.id));
  }
  if (q.careLevel) conds.push(eq(schema.healthFacilities.careLevel, q.careLevel));
  if (q.ownership) conds.push(eq(schema.healthFacilities.ownership, q.ownership));
  const where = and(...conds);
  const size = PAGE_SIZE.facilities;

  const base = () =>
    db
      .select({
        id: schema.healthFacilities.id,
        name: schema.healthFacilities.name,
        type: schema.healthFacilities.type,
        careLevel: schema.healthFacilities.careLevel,
        ownership: schema.healthFacilities.ownership,
        lng: sql<number>`ST_X(${schema.healthFacilities.point})`,
        lat: sql<number>`ST_Y(${schema.healthFacilities.point})`,
        lgaCode: lga.code,
        lgaName: lga.name,
        stateCode: state.code,
        stateName: state.name,
        sourceVersion: schema.healthFacilities.sourceVersion,
        sourceKey: schema.sources.key,
        sourcePublisher: schema.sources.publisher,
        datasetTitle: schema.datasets.title,
        isSynthetic: schema.datasets.isSynthetic,
      })
      .from(schema.healthFacilities)
      .innerJoin(schema.datasets, eq(schema.datasets.id, schema.healthFacilities.datasetId))
      .innerJoin(schema.sources, eq(schema.sources.id, schema.datasets.sourceId))
      .leftJoin(lga, eq(lga.id, schema.healthFacilities.lgaId))
      .leftJoin(state, eq(state.id, schema.healthFacilities.stateId));

  const [rows, total] = await Promise.all([
    base()
      .where(where)
      .orderBy(asc(schema.healthFacilities.name), asc(schema.healthFacilities.id))
      .limit(size)
      .offset((q.page - 1) * size),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.healthFacilities)
      .innerJoin(schema.datasets, eq(schema.datasets.id, schema.healthFacilities.datasetId))
      .innerJoin(schema.sources, eq(schema.sources.id, schema.datasets.sourceId))
      .where(where),
  ]);
  return {
    rows: rows.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      careLevel: r.careLevel,
      ownership: r.ownership,
      location: { lng: Number(r.lng), lat: Number(r.lat) },
      lga: r.lgaCode ? { code: r.lgaCode, name: r.lgaName } : null,
      state: r.stateCode ? { code: r.stateCode, name: r.stateName } : null,
      sourceVersion: r.sourceVersion,
      source: { key: r.sourceKey, publisher: r.sourcePublisher },
      dataset: { title: r.datasetTitle, isSynthetic: r.isSynthetic },
    })),
    total: total[0]?.n ?? 0,
    pageSize: size,
  };
}

/* ── Outbreaks (licence-gated) ───────────────────────────────────────────── */

export const DISEASES = ["cholera", "lassa_fever", "meningitis", "measles"] as const;

export async function listOutbreaksApi(q: {
  disease?: (typeof DISEASES)[number];
  state?: string;
  year?: number;
  page: number;
}) {
  const conds: SQL[] = [
    eq(schema.datasets.status, "published"),
    eq(schema.sources.allowsRedistribution, true),
  ];
  if (q.disease) conds.push(eq(schema.outbreakReports.disease, q.disease));
  if (q.year) conds.push(eq(schema.outbreakReports.year, q.year));
  if (q.state) {
    const u = await getGeoUnitByCode(q.state);
    if (!u || u.level !== "state") throw new ApiProblem(404, "not_found", `Unknown state '${q.state}'`);
    conds.push(eq(schema.outbreakReports.stateId, u.id));
  }
  const where = and(...conds);
  const size = PAGE_SIZE.outbreaks;
  const [rows, total] = await Promise.all([
    db
      .select({
        disease: schema.outbreakReports.disease,
        year: schema.outbreakReports.year,
        week: schema.outbreakReports.week,
        suspected: schema.outbreakReports.suspected,
        confirmed: schema.outbreakReports.confirmed,
        deaths: schema.outbreakReports.deaths,
        stateCode: schema.geoUnits.code,
        stateName: schema.geoUnits.name,
        sourceKey: schema.sources.key,
        sourcePublisher: schema.sources.publisher,
        datasetTitle: schema.datasets.title,
        isSynthetic: schema.datasets.isSynthetic,
      })
      .from(schema.outbreakReports)
      .innerJoin(schema.datasets, eq(schema.datasets.id, schema.outbreakReports.datasetId))
      .innerJoin(schema.sources, eq(schema.sources.id, schema.datasets.sourceId))
      .innerJoin(schema.geoUnits, eq(schema.geoUnits.id, schema.outbreakReports.stateId))
      .where(where)
      .orderBy(
        sql`${schema.outbreakReports.year} DESC`,
        sql`${schema.outbreakReports.week} DESC`,
        asc(schema.outbreakReports.disease),
        asc(schema.geoUnits.name),
      )
      .limit(size)
      .offset((q.page - 1) * size),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.outbreakReports)
      .innerJoin(schema.datasets, eq(schema.datasets.id, schema.outbreakReports.datasetId))
      .innerJoin(schema.sources, eq(schema.sources.id, schema.datasets.sourceId))
      .where(where),
  ]);
  return {
    rows: rows.map((r) => ({
      disease: r.disease,
      state: { code: r.stateCode, name: r.stateName },
      year: r.year,
      week: r.week,
      suspected: r.suspected,
      confirmed: r.confirmed,
      deaths: r.deaths,
      source: { key: r.sourceKey, publisher: r.sourcePublisher },
      dataset: { title: r.datasetTitle, isSynthetic: r.isSynthetic },
    })),
    total: total[0]?.n ?? 0,
    pageSize: size,
  };
}
