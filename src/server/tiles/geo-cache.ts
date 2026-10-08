import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  getGeoUnitByCode,
  getGeoUnitById,
  getLevelGeoJSON,
  type GeoLevel,
  type GeoUnitLite,
} from "@/server/geo/queries";
import { LruCache } from "./lru";
import { geojsonCacheKey } from "./keys";

/**
 * Server-side caches for the GeoJSON routes. Shapes are pre-serialised to a
 * JSON string once and served from memory (states/LGAs are requested by
 * every explorer visit; re-running ST_AsGeoJSON each time is wasteful).
 */

const geojsonCache = new LruCache<string>(64, 60 * 60 * 1000);

/** Resolve a `?parent=` style param given as a numeric id or an official code. */
export async function resolveGeoUnit(raw: string | null): Promise<GeoUnitLite | null> {
  if (!raw) return null;
  const s = raw.trim();
  if (/^\d{1,9}$/.test(s)) return getGeoUnitById(Number(s));
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(s)) return null;
  return getGeoUnitByCode(s);
}

export async function getLevelGeoJSONString(
  level: GeoLevel,
  parentId?: number,
): Promise<string> {
  const key = geojsonCacheKey(level, parentId);
  const hit = geojsonCache.get(key);
  if (hit) return hit;
  const fc = await getLevelGeoJSON(level, parentId);
  const json = JSON.stringify(fc);
  geojsonCache.set(key, json);
  return json;
}

export function clearGeoJSONCache(): void {
  geojsonCache.clear();
}

/* ── Facilities (point layer) ─────────────────────────────────────────── */

export const CARE_LEVELS = ["primary", "secondary", "tertiary"] as const;
export const OWNERSHIPS = ["public", "private", "faith_based", "ngo", "unknown"] as const;
export type CareLevel = (typeof CARE_LEVELS)[number];
export type Ownership = (typeof OWNERSHIPS)[number];

export interface FacilityFilters {
  stateId?: number;
  lgaId?: number;
  careLevels?: CareLevel[];
  ownerships?: Ownership[];
  type?: string;
}

const facilityCache = new LruCache<string>(64, 30 * 60 * 1000);

/**
 * Facilities as a point FeatureCollection (properties: id, name, type,
 * careLevel, ownership, sourceVersion). Coordinates rounded to 5 dp (~1 m) to keep the
 * payload small. Built in SQL so large lists stay cheap to serialise.
 */
export async function getFacilitiesGeoJSONString(f: FacilityFilters): Promise<string> {
  const key = `facilities/${JSON.stringify([
    f.stateId ?? null,
    f.lgaId ?? null,
    [...(f.careLevels ?? [])].sort(),
    [...(f.ownerships ?? [])].sort(),
    f.type ?? null,
  ])}`;
  const hit = facilityCache.get(key);
  if (hit) return hit;

  const conds: SQL[] = [];
  // Visibility rule (same as /facilities): facilities belong to a published
  // dataset, or predate dataset tracking (NULL).
  conds.push(
    sql`(f.dataset_id IS NULL OR EXISTS (SELECT 1 FROM datasets d WHERE d.id = f.dataset_id AND d.status = 'published'))`,
  );
  if (f.stateId) conds.push(sql`f.state_id = ${f.stateId}`);
  if (f.lgaId) conds.push(sql`f.lga_id = ${f.lgaId}`);
  if (f.careLevels?.length) {
    conds.push(sql`f.care_level::text IN (${sql.join(f.careLevels.map((c) => sql`${c}`), sql`, `)})`);
  }
  if (f.ownerships?.length) {
    conds.push(sql`f.ownership::text IN (${sql.join(f.ownerships.map((o) => sql`${o}`), sql`, `)})`);
  }
  if (f.type) conds.push(sql`f.type = ${f.type}`);
  const where = conds.length ? sql`WHERE ${sql.join(conds, sql` AND `)}` : sql``;

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
    FROM health_facilities f
    ${where}
  `);
  const json =
    (res.rows[0] as { fc: string } | undefined)?.fc ??
    '{"type":"FeatureCollection","features":[]}';
  facilityCache.set(key, json);
  return json;
}
