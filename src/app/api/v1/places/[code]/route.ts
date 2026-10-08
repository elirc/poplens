import { ApiProblem, codeParam, withApiKey } from "../../_lib/http";
import { getPlace } from "../../_lib/data";

export const dynamic = "force-dynamic";

/** GET /api/v1/places/{code} */
export const GET = withApiKey<{ code: string }>(async ({ params }) => {
  const code = codeParam.parse(params.code);
  const place = await getPlace(code);
  if (!place) throw new ApiProblem(404, "not_found", `Unknown place '${code}'`);
  return { data: place, meta: { count: 1 } };
});
