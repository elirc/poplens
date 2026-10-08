import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  getGeoUnitByCode,
  getGeoUnitById,
  listGeoUnits,
  type GeoUnitLite,
} from "@/server/geo/queries";
import {
  getAvailableYears,
  getIndicatorByCode,
  getValuesForLevel,
} from "@/server/indicators/queries";
import { LruCache } from "@/server/tiles/lru";
import {
  FACILITY_PAGE_SIZE,
  type CareLevel,
  type FacilityQuery,
  type Ownership,
} from "@/app/(public)/facilities/_lib/filters";
import type {
  FacilityListRow,
  FacilitySource,
  NearestFacility,
  PeoplePerFacilityByLga,
  PpfRow,
  PpfSource,
} from "@/app/(public)/facilities/_lib/types";

export type {
  FacilityListRow,
  FacilitySource,
  NearestFacility,
  PeoplePerFacilityByLga,
  PpfRow,
  PpfSource,
};

/**
 * Facilities explorer data access. Facilities are public geography data:
 * no dataset-status join is required for visibility in general, but rows
 * attached to a dataset are shown only once that dataset is published
 * (draft facility lists stay invisible), and rows with no dataset are shown.
 */

export interface ResolvedFacilityFilters {
  stateId?: number;
  lgaId?: number;
  care: CareLevel[];
  own: Ownership[];
  type: string | null;
}

export interface ResolvedScope {
  filters: ResolvedFacilityFilters;
  state: GeoUnitLite | null;
  lga: GeoUnitLite | null;
  /** Codes in the URL that matched nothing (shown as a notice). */
  unknown: string[];
}

/** Resolve state/LGA codes to units. An LGA implies its state. */
export async function resolveFacilityScope(q: FacilityQuery): Promise<ResolvedScope> {
  const unknown: string[] = [];
  let lga: GeoUnitLite | null = null;
  let state: GeoUnitLite | null = null;
  if (q.lga) {
    const u = await getGeoUnitByCode(q.lga);
    if (u && u.level === "lga") lga = u;
    else unknown.push(q.lga);
  }
  if (q.state) {
    const u = await getGeoUnitByCode(q.state);
    if (u && u.level === "state") state = u;
    else unknown.push(q.state);
  }
  // An LGA from another state than ?state= wins (deep links carry only lga).
  if (lga && (!state || lga.stateId !== state.id) && lga.stateId) {
    state = await getGeoUnitById(lga.stateId);
  }
  return {
    filters: {
      stateId: state?.id,
      lgaId: lga?.id,
      care: q.care,
      own: q.own,
      type: q.type,
    },
    state,
    lga,
    unknown,
  };
}

/** WHERE clause over `health_facilities f LEFT JOIN datasets fd`. */
function facilityWhere(f: ResolvedFacilityFilters): SQL {
  const conds: SQL[] = [sql`(f.dataset_id IS NULL OR fd.status = 'published')`];
  if (f.stateId) conds.push(sql`f.state_id = ${f.stateId}`);
  if (f.lgaId) conds.push(sql`f.lga_id = ${f.lgaId}`);
  if (f.care.length) {
    conds.push(sql`f.care_level::text IN (${sql.join(f.care.map((c) => sql`${c}`), sql`, `)})`);
  }
  if (f.own.length) {
    conds.push(sql`f.ownership::text IN (${sql.join(f.own.map((o) => sql`${o}`), sql`, `)})`);
  }
  if (f.type) conds.push(sql`f.type = ${f.type}`);
  return sql.join(conds, sql` AND `);
}

const FROM_FACILITIES = sql`health_facilities f LEFT JOIN datasets fd ON fd.id = f.dataset_id`;

/** Distinct facility types (for the filter's options), most common first. */
export async function listFacilityTypes(): Promise<string[]> {
  const res = await db.execute(sql`
    SELECT f.type, COUNT(*)::int AS n
    FROM ${FROM_FACILITIES}
    WHERE (f.dataset_id IS NULL OR fd.status = 'published')
    GROUP BY f.type
    ORDER BY n DESC, f.type
  `);
  return (res.rows as Array<{ type: string }>).map((r) => r.type);
}

/** One server-side page of the filtered list (ordered by state, LGA, name). */
export async function listFacilitiesPage(
  f: ResolvedFacilityFilters,
  page: number,
  pageSize = FACILITY_PAGE_SIZE,
): Promise<{ rows: FacilityListRow[]; total: number; page: number }> {
  const where = facilityWhere(f);
  const countRes = await db.execute(sql`SELECT COUNT(*)::int AS n FROM ${FROM_FACILITIES} WHERE ${where}`);
  const total = Number((countRes.rows[0] as { n: number } | undefined)?.n ?? 0);
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const p = Math.min(Math.max(1, page), lastPage);
  const res = await db.execute(sql`
    SELECT f.id, f.name, f.type, f.care_level::text AS "careLevel", f.ownership::text AS ownership,
           l.code AS "lgaCode", l.name AS "lgaName", w.name AS "wardName", s.name AS "stateName",
           f.source_version AS "sourceVersion"
    FROM ${FROM_FACILITIES}
    LEFT JOIN geo_units l ON l.id = f.lga_id
    LEFT JOIN geo_units w ON w.id = f.ward_id
    LEFT JOIN geo_units s ON s.id = f.state_id
    WHERE ${where}
    ORDER BY s.name NULLS LAST, l.name NULLS LAST, f.name, f.id
    LIMIT ${pageSize} OFFSET ${(p - 1) * pageSize}
  `);
  return { rows: res.rows as unknown as FacilityListRow[], total, page: p };
}

/** Distinct sources/versions behind the filtered facilities (for the source line). */
export async function facilitySources(f: ResolvedFacilityFilters): Promise<FacilitySource[]> {
  const res = await db.execute(sql`
    SELECT DISTINCT COALESCE(s.publisher, 'Facility list') AS publisher,
           fd.title AS "datasetTitle", f.source_version AS "sourceVersion",
           fd.years_covered AS year, COALESCE(fd.is_synthetic, false) AS "isSynthetic"
    FROM ${FROM_FACILITIES}
    LEFT JOIN sources s ON s.id = fd.source_id
    WHERE ${facilityWhere(f)}
    ORDER BY 1, 3
    LIMIT 5
  `);
  return res.rows as unknown as FacilitySource[];
}

/* ── Map payload ─────────────────────────────────────────────────────── */

const geojsonCache = new LruCache<string>(64, 10 * 60 * 1000);

/**
 * Point FeatureCollection for FacilityLayer (properties = FacilityProps).
 * Serialised in SQL, coordinates rounded to 5 dp, cached in-process.
 */
export async function getFacilitiesGeoJSON(f: ResolvedFacilityFilters): Promise<string> {
  const key = JSON.stringify([f.stateId ?? null, f.lgaId ?? null, f.care, f.own, f.type]);
  const hit = geojsonCache.get(key);
  if (hit) return hit;
  const res = await db.execute(sql`
    SELECT json_build_object(
      'type', 'FeatureCollection',
      'features', COALESCE(json_agg(json_build_object(
        'type', 'Feature',
        'id', f.id,
        'geometry', ST_AsGeoJSON(f.point, 5)::json,
        'properties', json_build_object(
          'id', f.id, 'name', f.name, 'type', f.type,
          'careLevel', f.care_level, 'ownership', f.ownership,
          'sourceVersion', f.source_version
        )
      ) ORDER BY f.id), '[]'::json)
    )::text AS fc
    FROM ${FROM_FACILITIES}
    WHERE ${facilityWhere(f)}
  `);
  const json =
    (res.rows[0] as { fc: string } | undefined)?.fc ?? '{"type":"FeatureCollection","features":[]}';
  geojsonCache.set(key, json);
  return json;
}

/* ── Nearest facilities ──────────────────────────────────────────────── */

/**
 * The `n` nearest visible facilities to a point. KNN (`<->`, GiST) picks a
 * generous candidate set in planar degrees; the exact geodesic distance
 * (ST_Distance on geography) then orders the final list.
 */
export async function getNearestFacilities(
  lng: number,
  lat: number,
  n: number,
  f: ResolvedFacilityFilters = { care: [], own: [], type: null },
): Promise<NearestFacility[]> {
  const pt = sql`ST_SetSRID(ST_MakePoint(${lng}::float8, ${lat}::float8), 4326)`;
  const candidates = n * 4 + 20;
  const res = await db.execute(sql`
    SELECT * FROM (
      SELECT f.id, f.name, f.type, f.care_level::text AS "careLevel", f.ownership::text AS ownership,
             l.code AS "lgaCode", l.name AS "lgaName",
             ST_X(f.point) AS lng, ST_Y(f.point) AS lat,
             ST_Distance(f.point::geography, ${pt}::geography) AS meters
      FROM ${FROM_FACILITIES}
      LEFT JOIN geo_units l ON l.id = f.lga_id
      WHERE ${facilityWhere(f)}
      ORDER BY f.point <-> ${pt}
      LIMIT ${candidates}
    ) c
    ORDER BY c.meters, c.id
    LIMIT ${n}
  `);
  return (res.rows as unknown as NearestFacility[]).map((r) => ({
    ...r,
    lng: Number(r.lng),
    lat: Number(r.lat),
    meters: Number(r.meters),
  }));
}

/* ── People per facility by LGA ──────────────────────────────────────── */

/**
 * Published people_per_facility values for LGAs (latest year with data),
 * optionally within one state — through the published-dataset join only.
 */
export async function getPeoplePerFacilityByLga(
  stateId?: number,
): Promise<PeoplePerFacilityByLga | null> {
  const ind = await getIndicatorByCode("people_per_facility");
  if (!ind) return null;
  const years = await getAvailableYears(ind.id, "lga");
  const year = years.length ? years[years.length - 1]! : null;
  const indicator = {
    code: ind.code,
    name: ind.name,
    unit: ind.unit,
    valueType: ind.valueType,
    decimals: ind.decimals,
    definition: ind.definition,
  };
  if (year == null) return { indicator, year: null, rows: [], sources: [] };

  const [values, states, lgas] = await Promise.all([
    getValuesForLevel(ind.id, "lga", year, stateId ? { parentId: stateId } : {}),
    listGeoUnits("state"),
    stateId ? listGeoUnits("lga", stateId) : listGeoUnits("lga"),
  ]);
  const stateName = new Map(states.map((s) => [s.id, s.name]));
  const lgaState = new Map(lgas.map((l) => [l.id, l.stateId ?? l.parentId]));
  const sources = new Map<number, PpfSource>();
  const rows: PpfRow[] = values.map((v) => {
    if (!sources.has(v.sourceId)) {
      sources.set(v.sourceId, {
        id: v.sourceId,
        publisher: v.sourcePublisher,
        title: v.sourceTitle,
        isSynthetic: v.isSynthetic,
      });
    }
    const sid = lgaState.get(v.geoUnitId);
    return {
      id: v.geoUnitId,
      code: v.code,
      name: v.name,
      stateName: sid ? (stateName.get(sid) ?? null) : null,
      value: Number(v.value),
      isEstimate: v.isEstimate,
      sourceId: v.sourceId,
    };
  });
  rows.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  return { indicator, year, rows, sources: [...sources.values()] };
}
