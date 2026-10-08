import { limitOr429 } from "@/lib/rate-limit";
import {
  CARE_LEVELS,
  OWNERSHIPS,
  getFacilitiesGeoJSONString,
  resolveGeoUnit,
  type CareLevel,
  type Ownership,
} from "@/server/tiles/geo-cache";
import {
  GEO_RATE,
  SHAPE_CACHE_CONTROL,
  badRequest,
  clientIp,
  jsonResponse,
  notFound,
} from "@/server/tiles/http";

/**
 * GET /api/geo/facilities[?state=<id|code>][&lga=<id|code>][&care=primary,secondary]
 *                        [&own=public,private][&type=<exact type>]
 * Health facilities as a point FeatureCollection for FacilityLayer
 * (clustered client-side). Facility lists are versioned per state, so the
 * same shape-level caching applies.
 */
function parseList<T extends string>(raw: string | null, allowed: readonly T[]): T[] | null {
  if (!raw) return [];
  const items = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (!items.every((s) => (allowed as readonly string[]).includes(s))) return null;
  return items as T[];
}

export async function GET(req: Request) {
  const limited = limitOr429(`geo:${clientIp(req)}`, GEO_RATE.max, GEO_RATE.windowMs);
  if (limited) return limited;

  const sp = new URL(req.url).searchParams;
  const careLevels = parseList<CareLevel>(sp.get("care"), CARE_LEVELS);
  if (!careLevels) return badRequest(`care must be a list of: ${CARE_LEVELS.join(", ")}`);
  const ownerships = parseList<Ownership>(sp.get("own"), OWNERSHIPS);
  if (!ownerships) return badRequest(`own must be a list of: ${OWNERSHIPS.join(", ")}`);
  const type = sp.get("type")?.trim() || undefined;
  if (type && type.length > 120) return badRequest("type too long");

  let stateId: number | undefined;
  let lgaId: number | undefined;
  const stateRaw = sp.get("state");
  if (stateRaw) {
    const s = await resolveGeoUnit(stateRaw);
    if (!s || s.level !== "state") return notFound(`Unknown state '${stateRaw}'`);
    stateId = s.id;
  }
  const lgaRaw = sp.get("lga");
  if (lgaRaw) {
    const l = await resolveGeoUnit(lgaRaw);
    if (!l || l.level !== "lga") return notFound(`Unknown LGA '${lgaRaw}'`);
    lgaId = l.id;
  }

  const body = await getFacilitiesGeoJSONString({ stateId, lgaId, careLevels, ownerships, type });
  return jsonResponse(body, { cacheControl: SHAPE_CACHE_CONTROL });
}
