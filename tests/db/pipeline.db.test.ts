import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Keep test uploads away from dev uploads (run ids restart at 1 per test).
vi.hoisted(() => {
  process.env.LOCAL_STORAGE_DIR = ".storage/test-db";
});

import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { truncateAll } from "../db-helpers";
import { NIGERIA_STATES, NIGERIA_ZONES } from "@/server/geo/nigeria-states";
import { INDICATOR_CATALOGUE } from "@/server/indicators/catalogue-data";
import { publishDataset } from "@/server/datasets/versioning";
import { runConnector } from "@/server/pipeline/connectors";
import { asChangeSummary } from "@/server/pipeline/diff";
import {
  createDraftFromUpload,
  getUploadSession,
  saveDecisionsAndValidate,
  saveMapping,
  startUpload,
} from "@/server/pipeline/uploads";
import type { IndicatorColumnMapping, OutbreakColumnMapping } from "@/server/pipeline/types";

/**
 * Data pipeline integration tests (run by the orchestrator: pnpm test:db).
 * Fixtures are self-contained — reference geography + catalogue only,
 * never A1's seed. The connector runs in MOCK mode (no network).
 */

const ACTOR = "test-editor";

async function seedFixtures() {
  await db.insert(schema.user).values({ id: ACTOR, name: "Editor", email: "editor@test.local", role: "data_editor" });
  const [nation] = await db
    .insert(schema.geoUnits)
    .values({ level: "nation", name: "Nigeria", code: "NG" })
    .returning({ id: schema.geoUnits.id });
  const zoneIds = new Map<string, number>();
  for (const z of NIGERIA_ZONES) {
    const [row] = await db
      .insert(schema.geoUnits)
      .values({ level: "zone", name: z.name, code: z.code, parentId: nation.id })
      .returning({ id: schema.geoUnits.id });
    zoneIds.set(z.code, row.id);
  }
  for (const s of NIGERIA_STATES) {
    await db
      .insert(schema.geoUnits)
      .values({ level: "state", name: s.name, code: s.code, parentId: zoneIds.get(s.zone) });
  }
  await db.execute(sql`UPDATE geo_units SET state_id = id WHERE level = 'state'`);
  const [kano] = await db.select().from(schema.geoUnits).where(eq(schema.geoUnits.code, "NG-KN"));
  await db.insert(schema.geoUnits).values([
    { level: "lga", name: "Gwale", code: "NG-KN-GWALE", parentId: kano.id, stateId: kano.id },
    { level: "lga", name: "Dala", code: "NG-KN-DALA", parentId: kano.id, stateId: kano.id },
  ]);
  await db.insert(schema.indicators).values(
    INDICATOR_CATALOGUE.map((c) => ({
      code: c.code,
      name: c.name,
      category: c.category,
      definition: c.definition,
      unit: c.unit,
      valueType: c.valueType,
      higherIsBetter: c.higherIsBetter,
      decimals: c.decimals,
      aggregation: c.aggregation,
    })),
  );
  await db.insert(schema.sources).values([
    { key: "dhs", publisher: "DHS Program", title: "DHS indicators", licence: "DHS terms", allowsRedistribution: false },
    { key: "nbs", publisher: "NBS", title: "NBS uploads", licence: "Open", allowsRedistribution: true },
    { key: "ncdc", publisher: "NCDC", title: "NCDC sitreps", licence: "Open", allowsRedistribution: true },
  ]);
}

async function sourceId(key: string) {
  const [s] = await db.select().from(schema.sources).where(eq(schema.sources.key, key));
  return s.id;
}

async function geoId(code: string) {
  const [g] = await db.select().from(schema.geoUnits).where(eq(schema.geoUnits.code, code));
  return g.id;
}

beforeEach(async () => {
  await truncateAll();
  await seedFixtures();
});

afterAll(async () => {
  await truncateAll();
});

describe("connector run (mock DHS) → draft", () => {
  it("creates a synthetic draft with a full changeSummary and a succeeded run", async () => {
    const out = await runConnector("dhs", ACTOR);
    expect(out.ok).toBe(true);
    // mock DHS: 2 survey years × 6 indicators × (37 states + nation)
    const expected = 2 * 6 * 38;
    expect(out.stats.rowsInserted).toBe(expected);

    const [ds] = await db.select().from(schema.datasets).where(eq(schema.datasets.id, out.datasetId!));
    expect(ds).toMatchObject({ status: "draft", seriesKey: "dhs-indicators", version: 1, isSynthetic: true, uploadedBy: ACTOR });
    expect(ds.levelsCovered).toEqual(["nation", "state"]);
    const cs = asChangeSummary(ds.changeSummary)!;
    expect(cs).toMatchObject({ added: expected, changed: 0, removed: 0, comparedWithDatasetId: null, total: expected });

    const [{ n }] = (
      await db.execute(sql`SELECT COUNT(*)::int AS n FROM indicator_values WHERE dataset_id = ${ds.id}`)
    ).rows as Array<{ n: number }>;
    expect(n).toBe(expected);

    const [run] = await db.select().from(schema.importRuns).where(eq(schema.importRuns.id, out.runId));
    expect(run).toMatchObject({ kind: "dhs", status: "succeeded", datasetId: ds.id });
    expect(run.finishedAt).not.toBeNull();

    const audits = await db
      .select()
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.action, "dataset.create_draft"), eq(schema.auditLog.entityId, String(ds.id))));
    expect(audits).toHaveLength(1);
  });

  it("a second run diffs against the published version (deterministic mock → all unchanged)", async () => {
    const first = await runConnector("dhs", null);
    await publishDataset(first.datasetId!, null);
    const second = await runConnector("dhs", null);
    expect(second.ok).toBe(true);
    expect(second.version).toBe(2);
    const [ds] = await db.select().from(schema.datasets).where(eq(schema.datasets.id, second.datasetId!));
    const cs = asChangeSummary(ds.changeSummary)!;
    expect(cs).toMatchObject({ added: 0, changed: 0, removed: 0, unchanged: 456, comparedWithDatasetId: first.datasetId });
  });

  it("fails cleanly (run marked failed, no dataset) when the source is not registered", async () => {
    const out = await runConnector("who", null); // fixtures have no 'who-gho' source
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/who-gho/);
    const [run] = await db.select().from(schema.importRuns).where(eq(schema.importRuns.id, out.runId));
    expect(run.status).toBe("failed");
    const all = await db.select().from(schema.datasets);
    expect(all).toHaveLength(0);
  });
});

/* ── Upload wizard ───────────────────────────────────────────────────────── */

const indicatorMapping = (over: Partial<IndicatorColumnMapping> = {}): IndicatorColumnMapping => ({
  kind: "indicator_values",
  place: "state",
  stateColumn: null,
  placeCode: null,
  level: "state",
  year: "year",
  indicatorColumn: "indicator",
  fixedIndicator: null,
  value: "value",
  lower: null,
  upper: null,
  sex: null,
  ageGroup: null,
  residence: null,
  note: null,
  isEstimate: true,
  periodLabel: null,
  ...over,
});

async function upload(csv: string, kind: "indicator_values" | "outbreak_reports" = "indicator_values") {
  return startUpload({
    buffer: Buffer.from(csv),
    fileName: "test.csv",
    contentType: "text/csv",
    kind,
    title: "Test upload",
    seriesKey: kind === "outbreak_reports" ? "upload-test-outbreaks" : "upload-test",
    sourceId: await sourceId(kind === "outbreak_reports" ? "ncdc" : "nbs"),
    isSynthetic: false,
    releaseDate: null,
    actorId: ACTOR,
  });
}

describe("upload validation failures block the draft", () => {
  it("reports bad range, duplicates and unknown places", async () => {
    // fixture numbers only exercise validation
    const csv = [
      "state,indicator,year,value",
      "Kano,anc4,2021,140", // percent > 100
      "Lagos,anc4,2021,40",
      "Lagos,anc4,2021,41", // duplicate (place, indicator, year, breakdown)
      "Atlantis,anc4,2021,30", // unknown place
      "Oyo,anc4,2021,35",
    ].join("\n");
    const runId = await upload(csv);
    await saveMapping(runId, indicatorMapping());
    const s1 = (await getUploadSession(runId))!.session;
    expect(s1.stage).toBe("review");
    expect(s1.pending!.map((p) => p.rawName)).toEqual(["Atlantis"]);

    const report = await saveDecisionsAndValidate(runId, {}, true, ACTOR);
    expect(report.ok).toBe(false);
    const codes = new Set(report.issues.filter((i) => i.severity === "error").map((i) => i.code));
    expect(codes).toEqual(new Set(["out_of_range", "duplicate", "unknown_place"]));
    expect(report.issues.find((i) => i.code === "duplicate")!.rows.sort()).toEqual([2, 3]);
    expect(report.validRows).toBe(1); // only Oyo

    const res = await createDraftFromUpload(runId, ACTOR);
    expect("report" in res).toBe(true);
    expect(await db.select().from(schema.datasets)).toHaveLength(0);
  });
});

describe("upload happy path", () => {
  it("matches by alias + reviewed fuzzy match (saved as alias) and creates a draft", async () => {
    const csv = [
      "state,indicator,year,value,lower,upper",
      "FCT Abuja,anc4,2021,60,55,65", // built-in alias
      "Nassarawa State,anc4,2021,50,,", // alias + suffix stripping
      "Kanoo,anc4,2021,45,,", // fuzzy → review
      "Lagos,anc4,2021,,,", // missing value → skipped with warning
    ].join("\n");
    const runId = await upload(csv);
    await saveMapping(runId, indicatorMapping({ lower: "lower", upper: "upper" }));
    const s = (await getUploadSession(runId))!.session;
    expect(s.autoMatched).toBe(3);
    expect(s.pending).toHaveLength(1);
    const p = s.pending![0];
    expect(p).toMatchObject({ rawName: "Kanoo", status: "review" });
    const kano = await geoId("NG-KN");
    expect(p.candidates[0].geoUnitId).toBe(kano);

    const report = await saveDecisionsAndValidate(runId, { [p.key]: kano }, true, ACTOR);
    expect(report.ok).toBe(true);
    expect(report.validRows).toBe(3);

    // confirmed match became an alias
    const aliases = await db.select().from(schema.geoAliases).where(eq(schema.geoAliases.geoUnitId, kano));
    expect(aliases).toEqual([expect.objectContaining({ alias: "Kanoo", normalized: "kanoo", origin: "upload-review" })]);

    const res = await createDraftFromUpload(runId, ACTOR);
    expect("datasetId" in res).toBe(true);
    const datasetId = (res as { datasetId: number }).datasetId;
    const [ds] = await db.select().from(schema.datasets).where(eq(schema.datasets.id, datasetId));
    expect(ds).toMatchObject({ status: "draft", seriesKey: "upload-test", isSynthetic: false });
    expect(ds.fileKey).toMatch(/^uploads\/\d+\/original-test\.csv$/);
    expect(asChangeSummary(ds.changeSummary)).toMatchObject({ added: 3, changed: 0, removed: 0 });

    const vals = (
      await db.execute(sql`
        SELECT g.code, v.value, v.lower, v.upper FROM indicator_values v
        JOIN geo_units g ON g.id = v.geo_unit_id WHERE v.dataset_id = ${datasetId} ORDER BY g.code`)
    ).rows;
    expect(vals).toEqual([
      { code: "NG-FC", value: 60, lower: 55, upper: 65 },
      { code: "NG-KN", value: 45, lower: null, upper: null },
      { code: "NG-NA", value: 50, lower: null, upper: null },
    ]);
    const [run] = await db.select().from(schema.importRuns).where(eq(schema.importRuns.id, runId));
    expect(run).toMatchObject({ status: "succeeded", datasetId });

    // a re-upload of the same series diffs against the published version
    await publishDataset(datasetId, ACTOR);
    const run2 = await upload(["state,indicator,year,value", "Kanoo,anc4,2021,47", "FCT,anc4,2021,60"].join("\n"));
    await saveMapping(run2, indicatorMapping());
    expect((await getUploadSession(run2))!.session.pending).toHaveLength(0); // alias learned
    await saveDecisionsAndValidate(run2, {}, true, ACTOR);
    const res2 = await createDraftFromUpload(run2, ACTOR);
    const [ds2] = await db
      .select()
      .from(schema.datasets)
      .where(eq(schema.datasets.id, (res2 as { datasetId: number }).datasetId));
    expect(ds2.version).toBe(2);
    expect(asChangeSummary(ds2.changeSummary)).toMatchObject({
      comparedWithDatasetId: datasetId,
      added: 0,
      changed: 2, // Kano value; FCT lost its CI
      removed: 1, // Nasarawa
      unchanged: 0,
    });
  });

  it("lands NCDC outbreak uploads in outbreak_reports as a draft", async () => {
    const csv = [
      "disease,state,year,week,suspected,confirmed,deaths",
      "cholera,Borno,2024,10,12,3,1",
      "Lassa fever,Edo,2024,10,5,2,",
    ].join("\n");
    const runId = await upload(csv, "outbreak_reports");
    const mapping: OutbreakColumnMapping = {
      kind: "outbreak_reports",
      disease: "disease",
      state: "state",
      year: "year",
      week: "week",
      suspected: "suspected",
      confirmed: "confirmed",
      deaths: "deaths",
    };
    await saveMapping(runId, mapping);
    const report = await saveDecisionsAndValidate(runId, {}, true, ACTOR);
    expect(report.ok).toBe(true);
    const res = await createDraftFromUpload(runId, ACTOR);
    const datasetId = (res as { datasetId: number }).datasetId;
    const rows = await db
      .select()
      .from(schema.outbreakReports)
      .where(eq(schema.outbreakReports.datasetId, datasetId));
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.disease === "lassa_fever")).toMatchObject({ suspected: 5, confirmed: 2, deaths: null, week: 10 });
    const [ds] = await db.select().from(schema.datasets).where(eq(schema.datasets.id, datasetId));
    expect(ds.status).toBe("draft");
    expect(asChangeSummary(ds.changeSummary)).toMatchObject({ kind: "outbreak_reports", added: 2 });
  });
});
