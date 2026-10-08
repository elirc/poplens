import { sql } from "drizzle-orm";
import { db } from "@/db";
import { LruCache } from "./lru";
import { tileCacheKey, type TileCoord, type TileLayer } from "./keys";

/**
 * Vector tiles (MVT) for ward / LGA shapes, built in PostGIS with
 * ST_AsMVT(ST_AsMVTGeom(boundary_simplified, ST_TileEnvelope(z,x,y))).
 *
 * Each feature carries feature id = geo_units.id plus properties
 * id / code / name, and lives in a source-layer named after the layer
 * ("wards" or "lgas") so map styles can reference it.
 */

const LEVEL_FOR_LAYER: Record<TileLayer, "ward" | "lga"> = {
  wards: "ward",
  lgas: "lga",
};

/** ~500 tiles in process; 1 h TTL so re-seeded boundaries show up. */
const tileCache = new LruCache<Buffer>(500, 60 * 60 * 1000);

/** Run the MVT SQL for one tile (uncached). Returns an empty buffer for empty tiles. */
export async function renderTile(layer: TileLayer, c: TileCoord): Promise<Buffer> {
  const level = LEVEL_FOR_LAYER[layer];
  const res = await db.execute(sql`
    WITH bounds AS (
      SELECT ST_TileEnvelope(${c.z}::int, ${c.x}::int, ${c.y}::int) AS env3857
    ),
    mvtgeom AS (
      SELECT g.id AS fid, g.id, g.code, g.name,
             ST_AsMVTGeom(
               ST_Transform(g.boundary_simplified, 3857),
               bounds.env3857, 4096, 64, true
             ) AS geom
      FROM geo_units g, bounds
      WHERE g.level = ${level}
        AND g.boundary_simplified IS NOT NULL
        AND g.boundary_simplified && ST_Transform(bounds.env3857, 4326)
    )
    SELECT ST_AsMVT(mvtgeom.*, ${layer}, 4096, 'geom', 'fid') AS mvt
    FROM mvtgeom
    WHERE geom IS NOT NULL
  `);
  const row = res.rows[0] as { mvt: Buffer | null } | undefined;
  const buf = row?.mvt;
  return buf && buf.length > 0 ? Buffer.from(buf) : Buffer.alloc(0);
}

/** Cached tile lookup (in-process LRU). */
export async function getTile(
  layer: TileLayer,
  c: TileCoord,
): Promise<{ data: Buffer; cacheHit: boolean }> {
  const key = tileCacheKey(layer, c);
  const hit = tileCache.get(key);
  if (hit) return { data: hit, cacheHit: true };
  const data = await renderTile(layer, c);
  tileCache.set(key, data);
  return { data, cacheHit: false };
}

/** Test/admin hook: drop all cached tiles (e.g. after a boundary reload). */
export function clearTileCache(): void {
  tileCache.clear();
}
