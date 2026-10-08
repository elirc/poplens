import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseYaml, type YamlValue } from "./yaml";

/**
 * Load openapi/poplens-v1.yaml and shape it for the docs page. The page is
 * rendered FROM this file, so the docs cannot drift from the spec.
 */

export type Obj = { [k: string]: YamlValue };

export const OPENAPI_PATH = path.join(process.cwd(), "openapi", "poplens-v1.yaml");
export const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;

export async function loadOpenApiText(): Promise<string> {
  return readFile(OPENAPI_PATH, "utf8");
}

export async function loadOpenApi(): Promise<Obj> {
  const doc = parseYaml(await loadOpenApiText());
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) throw new Error("OpenAPI file is not a mapping");
  return doc as Obj;
}

export function isObj(v: YamlValue | undefined): v is Obj {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

export function str(v: YamlValue | undefined): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

/** Resolve a local "#/a/b/c" $ref (one level; callers recurse as needed). */
export function deref(doc: Obj, v: YamlValue | undefined): YamlValue | undefined {
  if (!isObj(v) || typeof v.$ref !== "string") return v;
  const ref = v.$ref;
  if (!ref.startsWith("#/")) return v;
  let cur: YamlValue | undefined = doc;
  for (const part of ref.slice(2).split("/")) {
    cur = isObj(cur) ? cur[part] : undefined;
  }
  return cur;
}

export function refName(v: YamlValue | undefined): string | null {
  if (isObj(v) && typeof v.$ref === "string") return v.$ref.split("/").pop() ?? null;
  return null;
}

/** Short human type for a schema: "string", "integer", "Place[]", "enum(a|b)". */
export function typeLabel(schema: YamlValue | undefined): string {
  const name = refName(schema);
  if (name) return name;
  if (!isObj(schema)) return "any";
  if (Array.isArray(schema.enum)) return `${str(schema.type) || "string"} (${schema.enum.map(str).join(" | ")})`;
  if (schema.type === "array") return `${typeLabel(schema.items)}[]`;
  return str(schema.type) || "object";
}
