import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseScalar, parseYaml } from "./yaml";

describe("parseYaml (subset)", () => {
  it("parses nested maps, sequences, flow lists and scalars", () => {
    const doc = parseYaml(`
# comment
a: 1
b: "two: 2"
c:
  d: true
  e: [x, "y z", 3]
  f: {}
list:
  - plain
  - name: n
    in: query
  - "quoted"
same:
- one
- two
"200":
  description: ok # trailing comment
`);
    expect(doc).toEqual({
      a: 1,
      b: "two: 2",
      c: { d: true, e: ["x", "y z", 3], f: {} },
      list: ["plain", { name: "n", in: "query" }, "quoted"],
      same: ["one", "two"],
      "200": { description: "ok" },
    });
  });

  it("keeps version-like strings as strings", () => {
    expect(parseScalar("3.1.0")).toBe("3.1.0");
    expect(parseScalar("1.5")).toBe(1.5);
    expect(parseScalar("#/x")).toBe("#/x");
  });

  it("rejects malformed lines", () => {
    expect(() => parseYaml("a: 1\n  b: 2")).toThrow();
  });
});

describe("openapi/poplens-v1.yaml", () => {
  const doc = parseYaml(readFileSync(path.join(process.cwd(), "openapi", "poplens-v1.yaml"), "utf8")) as Record<
    string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
  >;

  it("parses and documents every implemented v1 route", () => {
    expect(doc.openapi).toBe("3.1.0");
    expect(Object.keys(doc.paths).sort()).toEqual(
      ["/facilities", "/indicators", "/indicators/{code}", "/outbreaks", "/places", "/places/{code}", "/values"].sort(),
    );
  });

  it("documents the query parameters the handlers accept", () => {
    const names = (p: string) =>
      (doc.paths[p].get.parameters as Array<Record<string, string>>).map((x) => x.name ?? x.$ref).sort();
    expect(names("/places")).toEqual(["#/components/parameters/page", "level", "parent", "q"].sort());
    expect(names("/values")).toEqual(["#/components/parameters/page", "indicator", "level", "place", "year"].sort());
    expect(names("/facilities")).toEqual(["#/components/parameters/page", "care_level", "lga", "ownership", "state"].sort());
    expect(names("/outbreaks")).toEqual(["#/components/parameters/page", "disease", "state", "year"].sort());
  });

  it("resolves every $ref", () => {
    const refs: string[] = [];
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") {
        for (const [k, x] of Object.entries(v)) {
          if (k === "$ref" && typeof x === "string") refs.push(x);
          else walk(x);
        }
      }
    };
    walk(doc);
    expect(refs.length).toBeGreaterThan(10);
    for (const r of refs) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const target = r.slice(2).split("/").reduce((o: any, k) => o?.[k], doc);
      expect(target, r).toBeTruthy();
    }
  });
});
