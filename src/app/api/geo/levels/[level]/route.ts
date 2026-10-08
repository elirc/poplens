import { limitOr429 } from "@/lib/rate-limit";
import type { GeoLevel } from "@/server/geo/queries";
import { getLevelGeoJSONString, resolveGeoUnit } from "@/server/tiles/geo-cache";
import {
  GEO_RATE,
  SHAPE_CACHE_CONTROL,
  badRequest,
  clientIp,
  jsonResponse,
  notFound,
} from "@/server/tiles/http";

/**
 * GET /api/geo/levels/[level][?parent=<id|code>]
 * Simplified-boundary FeatureCollection for states / LGAs (and nation/zone).
 * Ward shapes are served as vector tiles: /api/tiles/wards/{z}/{x}/{y}.
 */
const GEOJSON_LEVELS: readonly GeoLevel[] = ["nation", "zone", "state", "lga"];

export async function GET(
  req: Request,
  { params }: { params: Promise<{ level: string }> },
) {
  const limited = limitOr429(`geo:${clientIp(req)}`, GEO_RATE.max, GEO_RATE.windowMs);
  if (limited) return limited;

  const { level } = await params;
  if (level === "ward") {
    return badRequest("Ward shapes are served as vector tiles at /api/tiles/wards/{z}/{x}/{y}");
  }
  if (!(GEOJSON_LEVELS as readonly string[]).includes(level)) {
    return badRequest(`Unknown level '${level}'. Use one of: ${GEOJSON_LEVELS.join(", ")}`);
  }

  const parentRaw = new URL(req.url).searchParams.get("parent");
  let parentId: number | undefined;
  if (parentRaw) {
    const parent = await resolveGeoUnit(parentRaw);
    if (!parent) return notFound(`Unknown parent '${parentRaw}'`);
    parentId = parent.id;
  }

  const body = await getLevelGeoJSONString(level as GeoLevel, parentId);
  return jsonResponse(body, { cacheControl: SHAPE_CACHE_CONTROL });
}
