import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/misc";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deref, HTTP_METHODS, isObj, loadOpenApi, refName, str, typeLabel, type Obj } from "./_lib/openapi";
import type { YamlValue } from "./_lib/yaml";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "API documentation",
  description: "PopLens public API v1: places, indicators, values, facilities and outbreaks. Generated from the OpenAPI file.",
};

function slug(s: string): string {
  return s.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
}

function SchemaLink({ schema }: { schema: YamlValue | undefined }) {
  const label = typeLabel(schema);
  const name = refName(isObj(schema) && schema.type === "array" ? schema.items : schema);
  return name ? (
    <a href={`#schema-${slug(name)}`} className="font-mono text-xs underline">
      {label}
    </a>
  ) : (
    <span className="font-mono text-xs">{label}</span>
  );
}

function Operation({ doc, path, method, op }: { doc: Obj; path: string; method: string; op: Obj }) {
  const params = (Array.isArray(op.parameters) ? op.parameters : []).map((p) => deref(doc, p)).filter(isObj);
  const responses = isObj(op.responses) ? op.responses : {};
  const id = slug(`${method}-${path}`);
  return (
    <section id={id} className="scroll-mt-20 rounded-lg border border-border p-4">
      <h3 className="flex flex-wrap items-center gap-2 font-mono text-sm">
        <Badge variant="success">{method.toUpperCase()}</Badge>
        <span className="break-all font-semibold">/api/v1{path}</span>
      </h3>
      <p className="mt-2 font-medium">{str(op.summary)}</p>
      {op.description != null && <p className="mt-1 text-sm text-muted-foreground">{str(op.description)}</p>}

      {params.length > 0 && (
        <>
          <h4 className="mt-4 text-xs font-semibold uppercase text-muted-foreground">Parameters</h4>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>In</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {params.map((p) => (
                <TableRow key={`${str(p.in)}-${str(p.name)}`}>
                  <TableCell className="font-mono text-xs">
                    {str(p.name)}
                    {p.required === true && <span className="text-red-700"> *</span>}
                  </TableCell>
                  <TableCell className="text-xs">{str(p.in)}</TableCell>
                  <TableCell>
                    <SchemaLink schema={p.schema} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{str(p.description)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}

      <h4 className="mt-4 text-xs font-semibold uppercase text-muted-foreground">Responses</h4>
      <ul className="mt-1 space-y-1 text-sm">
        {Object.entries(responses).map(([code, r0]) => {
          const r = deref(doc, r0);
          const content = isObj(r) && isObj(r.content) ? r.content["application/json"] : undefined;
          const schema = isObj(content) ? content.schema : undefined;
          return (
            <li key={code} className="flex flex-wrap gap-2">
              <span className={`font-mono text-xs ${code.startsWith("2") ? "text-emerald-700" : "text-red-700"}`}>{code}</span>
              <span className="text-muted-foreground">{isObj(r) ? str(r.description) : ""}</span>
              {schema !== undefined && <SchemaLink schema={schema} />}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SchemaBlock({ name, schema }: { name: string; schema: Obj }) {
  const props = isObj(schema.properties) ? schema.properties : {};
  const required = Array.isArray(schema.required) ? schema.required.map(str) : [];
  return (
    <section id={`schema-${slug(name)}`} className="scroll-mt-20">
      <h3 className="font-mono text-sm font-semibold">{name}</h3>
      {schema.description != null && <p className="text-sm text-muted-foreground">{str(schema.description)}</p>}
      {Object.keys(props).length === 0 ? (
        <p className="text-sm text-muted-foreground">{typeLabel(schema)}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Field</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Object.entries(props).map(([field, s]) => (
              <TableRow key={field}>
                <TableCell className="font-mono text-xs">
                  {field}
                  {required.includes(field) && <span className="text-red-700"> *</span>}
                </TableCell>
                <TableCell>
                  <SchemaLink schema={s} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {isObj(s) ? str(s.description) : ""}
                  {isObj(s) && isObj(s.properties) ? ` { ${Object.keys(s.properties).join(", ")} }` : ""}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

export default async function ApiDocsPage() {
  let doc: Obj;
  try {
    doc = await loadOpenApi();
  } catch (e) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="text-2xl font-semibold">API documentation</h1>
        <Alert variant="destructive" className="mt-4">
          The OpenAPI file could not be read: {e instanceof Error ? e.message : String(e)}
        </Alert>
      </div>
    );
  }
  const info = isObj(doc.info) ? doc.info : {};
  const notes = isObj(doc["x-poplens"]) ? doc["x-poplens"] : {};
  const paths = isObj(doc.paths) ? doc.paths : {};
  const tags = (Array.isArray(doc.tags) ? doc.tags : []).filter(isObj);
  const schemas = isObj(doc.components) && isObj(doc.components.schemas) ? doc.components.schemas : {};

  const ops: Array<{ path: string; method: string; op: Obj; tag: string }> = [];
  for (const [p, item] of Object.entries(paths)) {
    if (!isObj(item)) continue;
    for (const m of HTTP_METHODS) {
      const op = item[m];
      if (isObj(op)) ops.push({ path: p, method: m, op, tag: Array.isArray(op.tags) ? str(op.tags[0]) : "Other" });
    }
  }
  const tagNames = [...new Set([...tags.map((t) => str(t.name)), ...ops.map((o) => o.tag)])];

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <p className="text-xs uppercase text-muted-foreground">Version {str(info.version)}</p>
      <h1 className="text-2xl font-semibold">{str(info.title)}</h1>
      <p className="mt-2 max-w-3xl text-muted-foreground">{str(info.description)}</p>
      <p className="mt-2 text-sm">
        Base URL: <code className="font-mono">/api/v1</code> ·{" "}
        <a href="/docs/api/openapi.yaml" className="underline">
          Download the OpenAPI file
        </a>{" "}
        ·{" "}
        <Link href="/account/api-keys" className="underline">
          Get an API key
        </Link>
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {[
          ["Authentication", notes.authentication],
          ["Rate limits", notes.rateLimits],
          ["Licensing", notes.licensing],
          ["Response format", notes.envelope],
        ].map(([title, text]) => (
          <div key={str(title)} className="rounded-lg border border-border p-4">
            <h2 className="mb-1 font-semibold">{str(title)}</h2>
            <p className="text-sm text-muted-foreground">{str(text as YamlValue)}</p>
          </div>
        ))}
      </div>

      <nav aria-label="Endpoints" className="mt-8 rounded-lg bg-muted/40 p-4 text-sm">
        <p className="mb-2 font-medium">Endpoints</p>
        <ul className="grid gap-1 sm:grid-cols-2">
          {ops.map((o) => (
            <li key={`${o.method}${o.path}`}>
              <a href={`#${slug(`${o.method}-${o.path}`)}`} className="font-mono text-xs underline">
                {o.method.toUpperCase()} {o.path}
              </a>{" "}
              <span className="text-muted-foreground">{str(o.op.summary)}</span>
            </li>
          ))}
        </ul>
      </nav>

      {tagNames.map((t) => {
        const tagInfo = tags.find((x) => str(x.name) === t);
        const list = ops.filter((o) => o.tag === t);
        if (list.length === 0) return null;
        return (
          <div key={t} className="mt-10">
            <h2 className="text-xl font-semibold">{t}</h2>
            {tagInfo?.description != null && <p className="mb-3 text-sm text-muted-foreground">{str(tagInfo.description)}</p>}
            <div className="space-y-4">
              {list.map((o) => (
                <Operation key={`${o.method}${o.path}`} doc={doc} path={o.path} method={o.method} op={o.op} />
              ))}
            </div>
          </div>
        );
      })}

      <h2 className="mt-12 text-xl font-semibold">Schemas</h2>
      <div className="mt-4 space-y-6">
        {Object.entries(schemas)
          .filter(([, s]) => isObj(s))
          .map(([name, s]) => (
            <SchemaBlock key={name} name={name} schema={s as Obj} />
          ))}
      </div>
    </div>
  );
}
