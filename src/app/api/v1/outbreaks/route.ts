import { z } from "zod";
import { codeParam, pageParam, queryObject, withApiKey } from "../_lib/http";
import { DISEASES, listOutbreaksApi } from "../_lib/data";

export const dynamic = "force-dynamic";

const query = z.object({
  disease: z.enum(DISEASES).optional(),
  state: codeParam.optional(),
  year: z.coerce.number().int().min(1950).max(2100).optional(),
  page: pageParam,
});

/** GET /api/v1/outbreaks?disease=&state=&year=&page= (weekly state lines, licence-gated). */
export const GET = withApiKey(async ({ url }) => {
  const q = query.parse(queryObject(url));
  const r = await listOutbreaksApi(q);
  const sources = [...new Map(r.rows.map((x) => [x.source.key, x.source])).values()];
  return {
    data: r.rows,
    meta: { count: r.rows.length, total: r.total, page: q.page, pageSize: r.pageSize, source: sources },
  };
});
