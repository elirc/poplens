import { limitOr429 } from "@/lib/rate-limit";
import { getBoundaryGeoJSON, getGeoUnitByCode } from "@/server/geo/queries";
import {
  GEO_RATE,
  SHAPE_CACHE_CONTROL,
  badRequest,
  clientIp,
  jsonResponse,
  notFound,
} from "@/server/tiles/http";

/**
 * GET /api/geo/unit/[code] → one simplified-boundary Feature
 * (properties: id, code, name, level, parentId, boundaryVersion).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const limited = limitOr429(`geo:${clientIp(req)}`, GEO_RATE.max, GEO_RATE.windowMs);
  if (limited) return limited;

  const { code: raw } = await params;
  const code = decodeURIComponent(raw);
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(code)) return badRequest("Invalid place code");

  const unit = await getGeoUnitByCode(code);
  if (!unit) return notFound(`Unknown place '${code}'`);
  const feature = await getBoundaryGeoJSON(unit.id, { simplified: true });
  if (!feature) return notFound(`No boundary for '${code}'`);

  return jsonResponse(
    {
      ...feature,
      id: unit.id,
      properties: {
        ...feature.properties,
        parentId: unit.parentId,
        boundaryVersion: unit.boundaryVersion,
      },
    },
    { cacheControl: SHAPE_CACHE_CONTROL },
  );
}
