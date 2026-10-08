import { eq } from "drizzle-orm";
import { db, pool, schema } from "@/db";
import { seedAccounts, seedPlans } from "./accounts";
import { seedCatalogue } from "./catalogue";
import { seedContent } from "./content";
import { wipeSyntheticData } from "./datasets";
import { seedDemoData } from "./demo-data";
import { seedGeography } from "./geography";
import { seedSources } from "./sources";

/**
 * Full idempotent seed: accounts & plans → sources → indicator catalogue →
 * geography (+aliases) → wipe previous synthetic datasets → synthetic demo
 * datasets (published) → stories & cards → import_runs 'seed' row.
 */

export interface SeedOptions {
  forcePlaceholderGeo?: boolean;
  log?: (m: string) => void;
}

export interface SeedSummary {
  geographyPath: string;
  boundaryVersion: string;
  geographyReason?: string;
  accountMethods: Record<string, string>;
  tableCounts: Array<{ table: string; rows: number }>;
  seconds: number;
}

const SUMMARY_TABLES = [
  "geo_units",
  "geo_aliases",
  "sources",
  "indicators",
  "datasets",
  "indicator_values",
  "health_facilities",
  "population_cells",
  "outbreak_reports",
  "users",
  "plans",
  "stories",
  "insight_cards",
  "import_runs",
] as const;

export async function runSeed(opts: SeedOptions = {}): Promise<SeedSummary> {
  const log = opts.log ?? ((m: string) => console.log(m));
  const t0 = Date.now();
  const step = (name: string) => log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${name}`);
  const timings: Record<string, number> = {};
  let last = Date.now();
  const mark = (k: string) => {
    timings[k] = Date.now() - last;
    last = Date.now();
  };

  step("accounts + plans");
  const accounts = await seedAccounts(log);
  await seedPlans();
  mark("accounts");

  const [run] = await db
    .insert(schema.importRuns)
    .values({ kind: "seed", status: "running", triggeredBy: accounts.ids.admin, log: "seed started" })
    .returning({ id: schema.importRuns.id });

  try {
    step("sources");
    const sources = await seedSources();
    mark("sources");

    step("indicator catalogue");
    const indicatorIds = await seedCatalogue();
    mark("catalogue");

    step("geography");
    const geo = await seedGeography({ forcePlaceholder: opts.forcePlaceholderGeo, log });
    log(
      `  geography path: ${geo.path} (${geo.boundaryVersion})${geo.reason ? ` — ${geo.reason}` : ""}`,
    );
    mark("geography");

    step("wipe previous synthetic datasets");
    const syntheticSourceId = sources.get("synthetic");
    if (!syntheticSourceId) throw new Error("synthetic source missing");
    const wiped = await wipeSyntheticData(syntheticSourceId);
    mark("wipe");

    step("synthetic demo datasets");
    const demo = await seedDemoData({
      hierarchy: geo.hierarchy,
      ids: geo.ids,
      indicatorIds,
      syntheticSourceId,
      actorId: accounts.ids.data_editor,
      log,
    });
    mark("demo");

    step("stories + insight cards");
    const content = await seedContent(accounts.ids.content_editor);
    mark("content");

    const tableCounts: SeedSummary["tableCounts"] = [];
    for (const t of SUMMARY_TABLES) {
      const r = await pool.query<{ n: number }>(`SELECT count(*)::int n FROM ${t}`);
      tableCounts.push({ table: t, rows: r.rows[0].n });
    }
    const seconds = (Date.now() - t0) / 1000;
    await db
      .update(schema.importRuns)
      .set({
        status: "succeeded",
        datasetId: demo.datasets[0].id,
        finishedAt: new Date(),
        stats: {
          geography: {
            path: geo.path,
            boundaryVersion: geo.boundaryVersion,
            reason: geo.reason ?? null,
            counts: geo.counts,
            lgasUnmatched: geo.lgasUnmatched,
            wardsPatched: geo.wardsWithoutShape,
            aliases: geo.aliases,
          },
          accounts: accounts.method,
          wipedDatasets: wiped,
          datasets: demo.datasets,
          facilities: demo.facilities,
          populationCells: demo.populationCells,
          outbreakRows: demo.outbreakRows,
          syntheticNationalPopulation: demo.nationalPopulation,
          content,
          tableCounts,
          timingsMs: timings,
          seconds,
        },
        log: `seed OK in ${seconds.toFixed(1)}s; geography=${geo.path} (${geo.boundaryVersion})`,
      })
      .where(eq(schema.importRuns.id, run.id));
    step("done");
    return {
      geographyPath: geo.path,
      boundaryVersion: geo.boundaryVersion,
      geographyReason: geo.reason,
      accountMethods: accounts.method,
      tableCounts,
      seconds,
    };
  } catch (e) {
    await db
      .update(schema.importRuns)
      .set({
        status: "failed",
        finishedAt: new Date(),
        error: e instanceof Error ? (e.stack ?? e.message) : String(e),
      })
      .where(eq(schema.importRuns.id, run.id));
    throw e;
  }
}
