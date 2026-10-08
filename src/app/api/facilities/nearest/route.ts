import { limitOr429 } from "@/lib/rate-limit";
import { parseFacilityQuery, parseNearestParams } from "@/app/(public)/facilities/_lib/filters";
import { getNearestFacilities, resolveFacilityScope } from "@/server/facilities/queries";
import { badRequest, clientIp, jsonResponse } from "@/server/tiles/http";

/**
 * GET /api/facilities/nearest?lng=&lat=[&n=10][&care=][&own=][&type=]
 * The n (1–25, default 10) nearest visible facilities to a point, by
 * geodesic distance (metres). Optional care/ownership/type filters match the
 * /facilities page; place scoping (state/lga) is deliberately ignored —
 * the nearest facility may be across an LGA border.
 * Rate-limited per IP (30 requests / minute).
 */
const NEAREST_RATE = { max: 30, windowMs: 60_000 } as const;

export async function GET(req: Request) {
  const limited = limitOr429(`nearest:${clientIp(req)}`, NEAREST_RATE.max, NEAREST_RATE.windowMs);
  if (limited) return limited;

  const sp = new URL(req.url).searchParams;
  const p = parseNearestParams(sp);
  if (!p.ok) return badRequest(p.message);

  const q = parseFacilityQuery(sp);
  const { filters } = await resolveFacilityScope({ ...q, state: null, lga: null });
  const facilities = await getNearestFacilities(p.lng, p.lat, p.n, filters);
  return jsonResponse(
    { point: { lng: p.lng, lat: p.lat }, facilities },
    { cacheControl: "public, max-age=300" },
  );
}
