import { z } from "zod";
import { codeParam, pageParam, queryObject, withApiKey } from "../_lib/http";
import { listPlaces } from "../_lib/data";

export const dynamic = "force-dynamic";

const query = z.object({
  level: z.enum(["nation", "zone", "state", "lga", "ward"]).optional(),
  parent: codeParam.optional(),
  q: z.string().trim().min(2).max(80).optional(),
  page: pageParam,
});

/** GET /api/v1/places?level=&parent=&q=&page= */
export const GET = withApiKey(async ({ url }) => {
  const q = query.parse(queryObject(url));
  const r = await listPlaces(q);
  return { data: r.rows, meta: { count: r.rows.length, total: r.total, page: q.page, pageSize: r.pageSize } };
});
