import { limitOr429 } from "@/lib/rate-limit";
import { parseFacilityQuery } from "@/app/(public)/facilities/_lib/filters";
import { getFacilitiesGeoJSON, resolveFacilityScope } from "@/server/facilities/queries";
import { GEO_RATE, clientIp, jsonResponse, notFound } from "@/server/tiles/http";

/**
 * GET /api/facilities[?state=<code>][&lga=<code>][&care=primary,secondary]
 *                    [&own=public,private][&type=<exact type>]
 * Visible health facilities (published dataset or none) as a point
 * FeatureCollection for the /facilities map (clustered client-side by
 * FacilityLayer). Same query-string vocabulary as the /facilities page.
 */
export async function GET(req: Request) {
  const limited = limitOr429(`facilities:${clientIp(req)}`, GEO_RATE.max, GEO_RATE.windowMs);
  if (limited) return limited;

  const q = parseFacilityQuery(new URL(req.url).searchParams);
  const scope = await resolveFacilityScope(q);
  if (scope.unknown.length) return notFound(`Unknown place '${scope.unknown.join("', '")}'`);

  const body = await getFacilitiesGeoJSON(scope.filters);
  return jsonResponse(body, {
    cacheControl: "public, max-age=600, stale-while-revalidate=86400",
  });
}
