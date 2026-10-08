/**
 * Tile coordinate parsing/validation and cache keys (pure; unit-tested).
 */

export const TILE_LAYERS = ["wards", "lgas"] as const;
export type TileLayer = (typeof TILE_LAYERS)[number];

/** Zoom guard for served tiles (brief: z 4–12). */
export const MIN_TILE_ZOOM = 4;
export const MAX_TILE_ZOOM = 12;

export interface TileCoord {
  z: number;
  x: number;
  y: number;
}

const INT_RE = /^\d{1,7}$/;

/**
 * Parse z/x/y path segments. `y` may carry a ".pbf"/".mvt" suffix.
 * Returns null for anything malformed, out of the zoom guard, or outside
 * the 2^z tile grid.
 */
export function parseTileCoord(
  zRaw: string,
  xRaw: string,
  yRaw: string,
): TileCoord | null {
  const yClean = yRaw.replace(/\.(pbf|mvt)$/i, "");
  if (!INT_RE.test(zRaw) || !INT_RE.test(xRaw) || !INT_RE.test(yClean)) return null;
  const z = Number(zRaw);
  const x = Number(xRaw);
  const y = Number(yClean);
  if (z < MIN_TILE_ZOOM || z > MAX_TILE_ZOOM) return null;
  const n = 2 ** z;
  if (x >= n || y >= n) return null;
  return { z, x, y };
}

/** Cache key for one tile of one layer, e.g. "wards/8/135/122". */
export function tileCacheKey(layer: TileLayer, c: TileCoord): string {
  return `${layer}/${c.z}/${c.x}/${c.y}`;
}

export function isTileLayer(s: string): s is TileLayer {
  return (TILE_LAYERS as readonly string[]).includes(s);
}

/** Cache key for a level GeoJSON payload, e.g. "geojson/lga/parent=12". */
export function geojsonCacheKey(level: string, parentId?: number | null): string {
  return `geojson/${level}/parent=${parentId ?? "*"}`;
}
