import { z } from "zod";
import { queryObject, withApiKey } from "../_lib/http";
import { listIndicatorsApi } from "../_lib/data";

export const dynamic = "force-dynamic";

const query = z.object({
  category: z.enum(["population", "health_outcomes", "health_services", "living_conditions", "outbreaks"]).optional(),
});

/** GET /api/v1/indicators?category= */
export const GET = withApiKey(async ({ url }) => {
  const q = query.parse(queryObject(url));
  const rows = await listIndicatorsApi(q.category);
  return { data: rows, meta: { count: rows.length } };
});
