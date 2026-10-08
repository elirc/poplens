import type { Metadata } from "next";
import Link from "next/link";
import { asc, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { isDemoDataLoaded } from "@/server/demo";
import { Badge } from "@/components/ui/badge";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "About the data",
  description:
    "Where PopLens figures come from, how each source is licensed, and how to read estimates, survey years and missing data.",
};

async function loadSources() {
  return db
    .select({
      id: schema.sources.id,
      key: schema.sources.key,
      publisher: schema.sources.publisher,
      title: schema.sources.title,
      url: schema.sources.url,
      licence: schema.sources.licence,
      licenceUrl: schema.sources.licenceUrl,
      allowsRedistribution: schema.sources.allowsRedistribution,
      notes: schema.sources.notes,
      publishedDatasets: sql<number>`(
        SELECT COUNT(*)::int FROM datasets d
        WHERE d.source_id = ${schema.sources.id} AND d.status = 'published'
      )`,
    })
    .from(schema.sources)
    .orderBy(asc(schema.sources.publisher));
}

const NOTES: Array<{ title: string; body: string }> = [
  {
    title: "Population figures are modelled estimates",
    body: "Nigeria's last census was in 2006. Every current population figure on PopLens is a modelled estimate (for example GRID3's bottom-up estimates from satellite imagery and household surveys) and is labelled “estimate” with its source and year.",
  },
  {
    title: "The finest level a source provides — nothing finer",
    body: "Many health indicators exist only at state level and only for survey years (for example the Demographic and Health Surveys). PopLens shows the finest level each source publishes and never estimates finer values itself, so an LGA or ward profile may show “No data” for survey indicators.",
  },
  {
    title: "Missing data is “No data”, never zero",
    body: "When a source has no value for a place or year, PopLens shows “No data”. A zero only ever appears when a source actually reports zero.",
  },
  {
    title: "Every figure carries its source, year and estimate flag",
    body: "Each value, chart and map shows where it came from, which year it describes and whether it is an estimate, with a confidence interval where the source gives one.",
  },
  {
    title: "Sources are never silently mixed",
    body: "When the same indicator comes from different sources over time, trend lines break at the change and the change is marked.",
  },
  {
    title: "Boundaries and facility lists have versions",
    body: "Ward boundaries and health facility lists are newer for some states than others. Each place profile records the boundary version used.",
  },
  {
    title: "Outbreak figures come from published reports",
    body: "Weekly outbreak figures are entered by staff from NCDC situation reports through an upload template. Nothing is scraped automatically, and this is not live surveillance.",
  },
  {
    title: "Publishing is deliberate",
    body: "New data lands as a draft and only appears publicly after a data editor reviews and publishes it. Every published version is kept and can be rolled back; the data updates page lists each change.",
  },
];

export default async function AboutDataPage() {
  const [sources, isDemo] = await Promise.all([loadSources(), isDemoDataLoaded()]);
  return (
    <div className="mx-auto max-w-5xl space-y-10 px-4 py-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">About the data</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          PopLens collects no new data. It curates open sources on Nigeria&apos;s population and
          health and shows them consistently, by place. It holds no personal, patient or
          clinic-level records — only aggregated figures by area.
        </p>
        {isDemo && (
          <p className="max-w-3xl rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
            Synthetic demo data is currently loaded. Values marked as coming from the synthetic
            source are made up for demonstration and are not real statistics.
          </p>
        )}
      </header>

      <section aria-labelledby="sources" className="space-y-3">
        <h2 id="sources" className="text-lg font-semibold">
          Sources and licences
        </h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Each source has its own licence. Downloads and API access are offered only for data
          whose licence allows redistribution.
        </p>
        {sources.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sources have been registered yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="p-2 font-medium">Publisher</th>
                  <th className="p-2 font-medium">Licence</th>
                  <th className="p-2 font-medium">Redistribution</th>
                  <th className="p-2 font-medium">Published datasets</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => (
                  <tr key={s.id} className="border-b border-border/60 align-top last:border-0">
                    <td className="p-2">
                      {s.url ? (
                        <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">
                          {s.publisher}
                        </a>
                      ) : (
                        <span className="font-medium">{s.publisher}</span>
                      )}
                      <span className="block text-xs text-muted-foreground">{s.title}</span>
                      {s.notes && <span className="mt-1 block text-xs text-muted-foreground">{s.notes}</span>}
                    </td>
                    <td className="p-2">
                      {s.licenceUrl ? (
                        <a href={s.licenceUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
                          {s.licence}
                        </a>
                      ) : (
                        s.licence
                      )}
                    </td>
                    <td className="p-2">
                      {s.allowsRedistribution ? (
                        <Badge variant="success">Allowed</Badge>
                      ) : (
                        <Badge variant="secondary">Not allowed</Badge>
                      )}
                    </td>
                    <td className="p-2 tabular-nums">{Number(s.publishedDatasets)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="reading" className="space-y-4">
        <h2 id="reading" className="text-lg font-semibold">
          How to read the numbers
        </h2>
        <dl className="grid gap-4 md:grid-cols-2">
          {NOTES.map((n) => (
            <div key={n.title} className="rounded-lg border border-border bg-card p-4">
              <dt className="font-medium">{n.title}</dt>
              <dd className="mt-1 text-sm text-muted-foreground">{n.body}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm">
          See each <Link href="/indicators" className="text-emerald-700 hover:underline">indicator page</Link>{" "}
          for definitions, methods and the levels and years available.
        </p>
      </section>
    </div>
  );
}
