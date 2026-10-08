import { loadOpenApiText } from "../_lib/openapi";

export const revalidate = 3600;

/** The raw OpenAPI file the docs page is generated from. */
export async function GET(): Promise<Response> {
  return new Response(await loadOpenApiText(), {
    headers: {
      "Content-Type": "application/yaml; charset=utf-8",
      "Content-Disposition": 'inline; filename="poplens-v1.yaml"',
    },
  });
}
