import { z } from "zod";
import { codeParam, pageParam, queryObject, withApiKey } from "../_lib/http";
import { getValuesApi } from "../_lib/data";

export const dynamic = "force-dynamic";

const query = z.object({
  indicator: codeParam,
  level: z.enum(["nation", "zone", "state", "lga", "ward"]).optional(),
  year: z.coerce.number().int().min(1950).max(2100).optional(),
  place: codeParam.optional(),
  page: pageParam,
});

/**
 * GET /api/v1/values?indicator=&level=&year=&place=&page=
 * Published headline values with source, CI and estimate flags. Values from
 * sources whose licence does not allow redistribution are excluded (the
 * count is reported in meta.excludedByLicence).
 */
export const GET = withApiKey(async ({ url }) => {
  const q = query.parse(queryObject(url));
  const r = await getValuesApi(q);
  return {
    data: r.rows,
    meta: {
      count: r.rows.length,
      total: r.total,
      page: q.page,
      pageSize: r.pageSize,
      indicator: r.indicator,
      level: r.level,
      year: r.year,
      source: r.sources,
      excludedByLicence: r.excludedByLicence,
      synthetic: r.anySynthetic,
    },
  };
});
