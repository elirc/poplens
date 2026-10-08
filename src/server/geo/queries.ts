import { and, asc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";

export type GeoLevel = "nation" | "zone" | "state" | "lga" | "ward";

export interface GeoUnitLite {
  id: number;
  level: GeoLevel;
  name: string;
  code: string;
  parentId: number | null;
  stateId: number | null;
  areaSqKm: number | null;
  boundaryVersion: string | null;
}

const liteColumns = {
  id: schema.geoUnits.id,
  level: schema.geoUnits.level,
  name: schema.geoUnits.name,
  code: schema.geoUnits.code,
  parentId: schema.geoUnits.parentId,
  stateId: schema.geoUnits.stateId,
  areaSqKm: schema.geoUnits.areaSqKm,
  boundaryVersion: schema.geoUnits.boundaryVersion,
};

export async function getGeoUnitByCode(
  code: string,
): Promise<GeoUnitLite | null> {
  const rows = await db
    .select(liteColumns)
    .from(schema.geoUnits)
    .where(eq(schema.geoUnits.code, code))
    .limit(1);
  return (rows[0] as GeoUnitLite | undefined) ?? null;
}

export async function getGeoUnitById(id: number): Promise<GeoUnitLite | null> {
  const rows = await db
    .select(liteColumns)
    .from(schema.geoUnits)
    .where(eq(schema.geoUnits.id, id))
    .limit(1);
  return (rows[0] as GeoUnitLite | undefined) ?? null;
}

/** All units of a level, optionally restricted to a parent (e.g. LGAs of a state). */
export async function listGeoUnits(
  level: GeoLevel,
  parentId?: number,
): Promise<GeoUnitLite[]> {
  const where = parentId
    ? and(eq(schema.geoUnits.level, level), eq(schema.geoUnits.parentId, parentId))
    : eq(schema.geoUnits.level, level);
  const rows = await db
    .select(liteColumns)
    .from(schema.geoUnits)
    .where(where)
    .orderBy(asc(schema.geoUnits.name));
  return rows as GeoUnitLite[];
}

/** Children of a unit (any level). */
export async function listChildren(parentId: number): Promise<GeoUnitLite[]> {
  const rows = await db
    .select(liteColumns)
    .from(schema.geoUnits)
    .where(eq(schema.geoUnits.parentId, parentId))
    .orderBy(asc(schema.geoUnits.name));
  return rows as GeoUnitLite[];
}

/** Ancestors from parent up to nation (for breadcrumbs). */
export async function getAncestors(unit: GeoUnitLite): Promise<GeoUnitLite[]> {
  const out: GeoUnitLite[] = [];
  let currentParent = unit.parentId;
  while (currentParent) {
    const parent = await getGeoUnitById(currentParent);
    if (!parent) break;
    out.unshift(parent);
    currentParent = parent.parentId;
  }
  return out;
}

/**
 * GeoJSON Feature for one unit (simplified boundary by default).
 * Returns null when the unit has no boundary.
 */
export async function getBoundaryGeoJSON(
  id: number,
  opts: { simplified?: boolean } = {},
): Promise<{ type: "Feature"; properties: Record<string, unknown>; geometry: unknown } | null> {
  const col = (opts.simplified ?? true) ? "boundary_simplified" : "boundary";
  const rows = await db.execute(sql`
    SELECT id, code, name, level,
           ST_AsGeoJSON(${sql.raw(col)}, 5) AS geom
    FROM geo_units WHERE id = ${id} AND ${sql.raw(col)} IS NOT NULL
  `);
  const r = rows.rows[0] as
    | { id: number; code: string; name: string; level: string; geom: string }
    | undefined;
  if (!r) return null;
  return {
    type: "Feature",
    properties: { id: r.id, code: r.code, name: r.name, level: r.level },
    geometry: JSON.parse(r.geom),
  };
}

/**
 * GeoJSON FeatureCollection for a whole level (simplified boundaries) —
 * used by the map explorer for states and LGAs. Ward shapes go through the
 * MVT tile route instead.
 */
export async function getLevelGeoJSON(
  level: GeoLevel,
  parentId?: number,
): Promise<{ type: "FeatureCollection"; features: unknown[] }> {
  const cond = parentId
    ? sql`level = ${level} AND parent_id = ${parentId}`
    : sql`level = ${level}`;
  const rows = await db.execute(sql`
    SELECT id, code, name,
           ST_AsGeoJSON(boundary_simplified, 5) AS geom
    FROM geo_units
    WHERE ${cond} AND boundary_simplified IS NOT NULL
    ORDER BY name
  `);
  return {
    type: "FeatureCollection",
    features: (rows.rows as Array<{ id: number; code: string; name: string; geom: string }>).map(
      (r) => ({
        type: "Feature",
        properties: { id: r.id, code: r.code, name: r.name },
        geometry: JSON.parse(r.geom),
      }),
    ),
  };
}

/** Centre point [lng, lat] of a unit, if known. */
export async function getCentre(id: number): Promise<[number, number] | null> {
  const rows = await db.execute(sql`
    SELECT ST_X(centre) AS lng, ST_Y(centre) AS lat
    FROM geo_units WHERE id = ${id} AND centre IS NOT NULL
  `);
  const r = rows.rows[0] as { lng: number; lat: number } | undefined;
  return r ? [r.lng, r.lat] : null;
}
