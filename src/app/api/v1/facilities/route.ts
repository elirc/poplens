import { z } from "zod";
import { codeParam, pageParam, queryObject, withApiKey } from "../_lib/http";
import { CARE_LEVELS, listFacilitiesApi, OWNERSHIPS } from "../_lib/data";

export const dynamic = "force-dynamic";

const query = z.object({
  lga: codeParam.optional(),
  state: codeParam.optional(),
  care_level: z.enum(CARE_LEVELS).optional(),
  ownership: z.enum(OWNERSHIPS).optional(),
  page: pageParam,
});

/** GET /api/v1/facilities?lga=&state=&care_level=&ownership=&page= (licence-gated). */
export const GET = withApiKey(async ({ url }) => {
  const q = query.parse(queryObject(url));
  const r = await listFacilitiesApi({
    lga: q.lga,
    state: q.state,
    careLevel: q.care_level,
    ownership: q.ownership,
    page: q.page,
  });
  const sources = [...new Map(r.rows.map((x) => [x.source.key, x.source])).values()];
  return {
    data: r.rows,
    meta: { count: r.rows.length, total: r.total, page: q.page, pageSize: r.pageSize, source: sources },
  };
});
