import { limitOr429 } from "@/lib/rate-limit";
import { isTileLayer, parseTileCoord, MIN_TILE_ZOOM, MAX_TILE_ZOOM } from "@/server/tiles/keys";
import { getTile } from "@/server/tiles/mvt";
import { SHAPE_CACHE_CONTROL, TILE_RATE, badRequest, clientIp } from "@/server/tiles/http";

/**
 * GET /api/tiles/wards/{z}/{x}/{y}  (also /api/tiles/lgas/…)
 * Mapbox Vector Tile built with PostGIS ST_AsMVT; source-layer name equals
 * the layer segment. 204 for empty tiles. z guarded to 4–12. Tiles are
 * LRU-cached in process and HTTP-cached by browsers/CDNs.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ layer: string; z: string; x: string; y: string }> },
) {
  const limited = limitOr429(`tiles:${clientIp(req)}`, TILE_RATE.max, TILE_RATE.windowMs);
  if (limited) return limited;

  const { layer, z, x, y } = await params;
  if (!isTileLayer(layer)) return badRequest(`Unknown tile layer '${layer}'`);
  const coord = parseTileCoord(z, x, y);
  if (!coord) {
    return badRequest(`Invalid tile; z must be ${MIN_TILE_ZOOM}–${MAX_TILE_ZOOM} and x/y inside the grid`);
  }

  const { data, cacheHit } = await getTile(layer, coord);
  const headers: Record<string, string> = {
    "Cache-Control": SHAPE_CACHE_CONTROL,
    "X-Tile-Cache": cacheHit ? "HIT" : "MISS",
    "Access-Control-Allow-Origin": "*",
  };
  if (data.length === 0) return new Response(null, { status: 204, headers });
  return new Response(new Uint8Array(data), {
    status: 200,
    headers: { ...headers, "Content-Type": "application/x-protobuf" },
  });
}
