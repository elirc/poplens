import { ApiProblem, codeParam, withApiKey } from "../../_lib/http";
import { getIndicatorApi } from "../../_lib/data";

export const dynamic = "force-dynamic";

/** GET /api/v1/indicators/{code} — definition plus published coverage. */
export const GET = withApiKey<{ code: string }>(async ({ params }) => {
  const code = codeParam.parse(params.code);
  const ind = await getIndicatorApi(code);
  if (!ind) throw new ApiProblem(404, "not_found", `Unknown indicator '${code}'`);
  return { data: ind, meta: { count: 1 } };
});
