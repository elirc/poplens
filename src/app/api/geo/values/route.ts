import { z } from "zod";
import { limitOr429 } from "@/lib/rate-limit";
import {
  getAvailableYears,
  getIndicatorByCode,
  getValuesForLevel,
} from "@/server/indicators/queries";
import { resolveGeoUnit } from "@/server/tiles/geo-cache";
import {
  GEO_RATE,
  VALUES_CACHE_CONTROL,
  badRequest,
  clientIp,
  jsonResponse,
  notFound,
} from "@/server/tiles/http";
import type { PlaceValue, ValuesResponse, ValuesSource } from "@/components/map/types";

/**
 * GET /api/geo/values?indicator=<code>&level=state|lga|ward[&year=YYYY][&parent=<id|code>]
 * Published headline values for every place of a level in one year, for the
 * client-side choropleth join (shapes are fetched separately, so a year
 * change only re-fetches this small payload). Missing places are simply
 * absent — the map renders them as "No data", never 0.
 */
const Query = z.object({
  indicator: z.string().regex(/^[A-Za-z0-9_.-]{1,64}$/),
  level: z.enum(["state", "lga", "ward"]),
  year: z.coerce.number().int().min(1900).max(2100).optional(),
  parent: z.string().max(64).optional(),
});

export async function GET(req: Request) {
  const limited = limitOr429(`geo:${clientIp(req)}`, GEO_RATE.max, GEO_RATE.windowMs);
  if (limited) return limited;

  const sp = new URL(req.url).searchParams;
  const parsed = Query.safeParse({
    indicator: sp.get("indicator") ?? undefined,
    level: sp.get("level") ?? "state",
    year: sp.get("year") || undefined,
    parent: sp.get("parent") || undefined,
  });
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  }
  const q = parsed.data;

  const indicator = await getIndicatorByCode(q.indicator);
  if (!indicator) return notFound(`Unknown indicator '${q.indicator}'`);

  let parentId: number | undefined;
  if (q.parent) {
    const parent = await resolveGeoUnit(q.parent);
    if (!parent) return notFound(`Unknown parent '${q.parent}'`);
    parentId = parent.id;
  }

  const years = await getAvailableYears(indicator.id, q.level);
  const year =
    q.year != null && years.includes(q.year) ? q.year : (years[years.length - 1] ?? null);

  const rows = year != null ? await getValuesForLevel(indicator.id, q.level, year, { parentId }) : [];

  const sources: Record<string, ValuesSource> = {};
  const values: PlaceValue[] = [];
  for (const r of rows) {
    const value = r.value == null ? null : Number(r.value);
    if (value == null || !Number.isFinite(value)) continue;
    sources[String(r.sourceId)] ??= {
      id: r.sourceId,
      key: r.sourceKey,
      publisher: r.sourcePublisher,
      title: r.sourceTitle,
      isSynthetic: Boolean(r.isSynthetic),
    };
    values.push({
      id: Number(r.geoUnitId),
      code: r.code,
      name: r.name,
      value,
      lower: r.lower == null ? null : Number(r.lower),
      upper: r.upper == null ? null : Number(r.upper),
      isEstimate: Boolean(r.isEstimate),
      sourceId: r.sourceId,
    });
  }

  const body: ValuesResponse = {
    indicator: {
      code: indicator.code,
      name: indicator.name,
      category: indicator.category,
      unit: indicator.unit,
      valueType: indicator.valueType,
      decimals: indicator.decimals,
      higherIsBetter: indicator.higherIsBetter,
    },
    level: q.level,
    year,
    years,
    sources,
    values,
  };
  return jsonResponse(body, { cacheControl: VALUES_CACHE_CONTROL });
}
