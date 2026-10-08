import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { writeAudit } from "@/lib/audit";

/**
 * Staff (data editor) read models + small mutations used by the editor UI.
 * Staff screens may read DRAFT values here — the published-only rule applies
 * to public pages, which go through src/server/indicators/queries.ts.
 */

export type DatasetStatus = "draft" | "published" | "superseded" | "rolled_back";

export interface DatasetListRow {
  id: number;
  title: string;
  seriesKey: string;
  version: number;
  status: DatasetStatus;
  isSynthetic: boolean;
  sourceKey: string;
  sourcePublisher: string;
  createdAt: Date;
  publishedAt: Date | null;
  yearsCovered: string | null;
  changeSummary: unknown;
  valueCount: number;
  outbreakCount: number;
}

export async function listDatasets(opts: { statuses?: DatasetStatus[]; limit?: number } = {}): Promise<DatasetListRow[]> {
  const where = opts.statuses?.length ? inArray(schema.datasets.status, opts.statuses) : undefined;
  const rows = await db
    .select({
      id: schema.datasets.id,
      title: schema.datasets.title,
      seriesKey: schema.datasets.seriesKey,
      version: schema.datasets.version,
      status: schema.datasets.status,
      isSynthetic: schema.datasets.isSynthetic,
      sourceKey: schema.sources.key,
      sourcePublisher: schema.sources.publisher,
      createdAt: schema.datasets.createdAt,
      publishedAt: schema.datasets.publishedAt,
      yearsCovered: schema.datasets.yearsCovered,
      changeSummary: schema.datasets.changeSummary,
      valueCount: sql<number>`(SELECT COUNT(*)::int FROM indicator_values v WHERE v.dataset_id = ${schema.datasets.id})`,
      outbreakCount: sql<number>`(SELECT COUNT(*)::int FROM outbreak_reports o WHERE o.dataset_id = ${schema.datasets.id})`,
    })
    .from(schema.datasets)
    .innerJoin(schema.sources, eq(schema.sources.id, schema.datasets.sourceId))
    .where(where)
    .orderBy(desc(schema.datasets.createdAt))
    .limit(opts.limit ?? 200);
  return rows as DatasetListRow[];
}

export async function getDataset(id: number) {
  const [row] = await db
    .select({
      dataset: schema.datasets,
      source: schema.sources,
    })
    .from(schema.datasets)
    .innerJoin(schema.sources, eq(schema.sources.id, schema.datasets.sourceId))
    .where(eq(schema.datasets.id, id));
  return row ?? null;
}

/** Other versions of the same series (history panel). */
export async function listSeriesVersions(seriesKey: string) {
  return db
    .select({
      id: schema.datasets.id,
      version: schema.datasets.version,
      status: schema.datasets.status,
      createdAt: schema.datasets.createdAt,
      publishedAt: schema.datasets.publishedAt,
      title: schema.datasets.title,
    })
    .from(schema.datasets)
    .where(eq(schema.datasets.seriesKey, seriesKey))
    .orderBy(desc(schema.datasets.version));
}

export async function datasetIndicatorBreakdown(datasetId: number) {
  const res = await db.execute(sql`
    SELECT i.code, i.name, COUNT(*)::int AS rows,
           MIN(v.year) AS "minYear", MAX(v.year) AS "maxYear",
           COUNT(*) FILTER (WHERE v.quality_flag IS NOT NULL)::int AS flagged
    FROM indicator_values v JOIN indicators i ON i.id = v.indicator_id
    WHERE v.dataset_id = ${datasetId}
    GROUP BY i.code, i.name ORDER BY i.name
  `);
  return res.rows as Array<{ code: string; name: string; rows: number; minYear: number; maxYear: number; flagged: number }>;
}

export interface ValueRow {
  id: number;
  indicatorCode: string;
  indicatorName: string;
  unit: string;
  valueType: "count" | "rate" | "percent" | "ratio" | "index";
  decimals: number;
  placeName: string;
  placeCode: string;
  level: string;
  year: number;
  value: number;
  lower: number | null;
  upper: number | null;
  sex: string;
  ageGroup: string;
  residence: string;
  isEstimate: boolean;
  qualityFlag: string | null;
  note: string | null;
}

const valueCols = sql`
  v.id, i.code AS "indicatorCode", i.name AS "indicatorName", i.unit,
  i.value_type AS "valueType", i.decimals, g.name AS "placeName", g.code AS "placeCode",
  g.level, v.year, v.value, v.lower, v.upper, v.sex, v.age_group AS "ageGroup",
  v.residence, v.is_estimate AS "isEstimate", v.quality_flag AS "qualityFlag", v.note
`;

export async function listDatasetValues(
  datasetId: number,
  opts: { indicatorCode?: string; limit?: number; offset?: number } = {},
): Promise<ValueRow[]> {
  const indCond = opts.indicatorCode ? sql`AND i.code = ${opts.indicatorCode}` : sql``;
  const res = await db.execute(sql`
    SELECT ${valueCols}
    FROM indicator_values v
    JOIN indicators i ON i.id = v.indicator_id
    JOIN geo_units g ON g.id = v.geo_unit_id
    WHERE v.dataset_id = ${datasetId} ${indCond}
    ORDER BY i.code, v.year, g.code, v.sex, v.age_group, v.residence
    LIMIT ${opts.limit ?? 100} OFFSET ${opts.offset ?? 0}
  `);
  return res.rows as unknown as ValueRow[];
}

export async function listDatasetOutbreaks(datasetId: number, limit = 100) {
  const res = await db.execute(sql`
    SELECT o.id, o.disease, g.name AS "stateName", g.code AS "stateCode", o.year, o.week,
           o.suspected, o.confirmed, o.deaths
    FROM outbreak_reports o JOIN geo_units g ON g.id = o.state_id
    WHERE o.dataset_id = ${datasetId}
    ORDER BY o.disease, o.year, o.week, g.name
    LIMIT ${limit}
  `);
  return res.rows as Array<{
    id: number;
    disease: string;
    stateName: string;
    stateCode: string;
    year: number;
    week: number;
    suspected: number | null;
    confirmed: number | null;
    deaths: number | null;
  }>;
}

/**
 * Discard a DRAFT (never a published/superseded version — history is kept).
 * Values cascade; import_runs keep their row but lose the link.
 */
export async function discardDraft(datasetId: number, actorId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [ds] = await tx
      .select({ status: schema.datasets.status, seriesKey: schema.datasets.seriesKey, version: schema.datasets.version })
      .from(schema.datasets)
      .where(eq(schema.datasets.id, datasetId))
      .for("update");
    if (!ds) throw new Error("Dataset not found");
    if (ds.status !== "draft") throw new Error(`Only drafts can be discarded (this one is ${ds.status})`);
    await tx
      .update(schema.importRuns)
      .set({ datasetId: null })
      .where(eq(schema.importRuns.datasetId, datasetId));
    await tx.delete(schema.datasets).where(eq(schema.datasets.id, datasetId));
    await writeAudit({
      actorId,
      action: "dataset.discard_draft",
      entity: "dataset",
      entityId: datasetId,
      detail: { seriesKey: ds.seriesKey, version: ds.version },
    });
  });
}

/* ── Import runs ─────────────────────────────────────────────────────────── */

export async function listImportRuns(opts: { kinds?: string[]; limit?: number } = {}) {
  return db
    .select()
    .from(schema.importRuns)
    .where(opts.kinds?.length ? inArray(schema.importRuns.kind, opts.kinds) : undefined)
    .orderBy(desc(schema.importRuns.startedAt))
    .limit(opts.limit ?? 50);
}

export async function getImportRun(id: number) {
  const [run] = await db.select().from(schema.importRuns).where(eq(schema.importRuns.id, id));
  return run ?? null;
}

/* ── Sources ─────────────────────────────────────────────────────────────── */

export async function listSources() {
  return db.select().from(schema.sources).orderBy(schema.sources.publisher);
}

export interface SourceInput {
  key: string;
  publisher: string;
  title: string;
  url: string | null;
  licence: string;
  licenceUrl: string | null;
  allowsRedistribution: boolean;
  citationTemplate: string | null;
  notes: string | null;
}

export async function upsertSource(id: number | null, input: SourceInput, actorId: string) {
  if (id) {
    const [before] = await db.select().from(schema.sources).where(eq(schema.sources.id, id));
    if (!before) throw new Error("Source not found");
    await db.update(schema.sources).set(input).where(eq(schema.sources.id, id));
    await writeAudit({
      actorId,
      action: "source.update",
      entity: "source",
      entityId: id,
      detail: {
        key: input.key,
        licenceBefore: before.licence,
        licenceAfter: input.licence,
        redistributionBefore: before.allowsRedistribution,
        redistributionAfter: input.allowsRedistribution,
      },
    });
    return id;
  }
  const [row] = await db.insert(schema.sources).values(input).returning({ id: schema.sources.id });
  await writeAudit({
    actorId,
    action: "source.create",
    entity: "source",
    entityId: row.id,
    detail: { key: input.key, licence: input.licence },
  });
  return row.id;
}

/* ── Aliases ─────────────────────────────────────────────────────────────── */

export async function listAliases(opts: { q?: string; origin?: string; limit?: number } = {}) {
  const conds = [];
  if (opts.q) {
    const like = `%${opts.q}%`;
    conds.push(or(ilike(schema.geoAliases.alias, like), ilike(schema.geoUnits.name, like), ilike(schema.geoUnits.code, like)));
  }
  if (opts.origin) conds.push(eq(schema.geoAliases.origin, opts.origin));
  return db
    .select({
      id: schema.geoAliases.id,
      alias: schema.geoAliases.alias,
      normalized: schema.geoAliases.normalized,
      origin: schema.geoAliases.origin,
      createdAt: schema.geoAliases.createdAt,
      geoUnitId: schema.geoUnits.id,
      unitName: schema.geoUnits.name,
      unitCode: schema.geoUnits.code,
      level: schema.geoUnits.level,
    })
    .from(schema.geoAliases)
    .innerJoin(schema.geoUnits, eq(schema.geoUnits.id, schema.geoAliases.geoUnitId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(schema.geoAliases.createdAt))
    .limit(opts.limit ?? 200);
}

export async function geoUnitByCode(code: string) {
  const [u] = await db
    .select({ id: schema.geoUnits.id, name: schema.geoUnits.name, code: schema.geoUnits.code })
    .from(schema.geoUnits)
    .where(eq(schema.geoUnits.code, code.trim().toUpperCase()));
  return u ?? null;
}

/* ── Quality flags ───────────────────────────────────────────────────────── */

export const QUALITY_FLAGS = ["questionable", "confirmed-outlier"] as const;
export type QualityFlag = (typeof QUALITY_FLAGS)[number];

export async function setQualityFlag(valueId: number, flag: QualityFlag | null, actorId: string) {
  const [row] = await db
    .update(schema.indicatorValues)
    .set({ qualityFlag: flag })
    .where(eq(schema.indicatorValues.id, valueId))
    .returning({ id: schema.indicatorValues.id, datasetId: schema.indicatorValues.datasetId });
  if (!row) throw new Error("Value not found");
  await writeAudit({
    actorId,
    action: flag ? "value.flag" : "value.unflag",
    entity: "indicator_value",
    entityId: valueId,
    detail: { flag, datasetId: row.datasetId },
  });
}

export async function listFlaggedValues(limit = 200): Promise<Array<ValueRow & { datasetId: number; datasetTitle: string; datasetStatus: string }>> {
  const res = await db.execute(sql`
    SELECT ${valueCols}, d.id AS "datasetId", d.title AS "datasetTitle", d.status AS "datasetStatus"
    FROM indicator_values v
    JOIN indicators i ON i.id = v.indicator_id
    JOIN geo_units g ON g.id = v.geo_unit_id
    JOIN datasets d ON d.id = v.dataset_id
    WHERE v.quality_flag IS NOT NULL
    ORDER BY d.id DESC, i.code, v.year
    LIMIT ${limit}
  `);
  return res.rows as unknown as Array<ValueRow & { datasetId: number; datasetTitle: string; datasetStatus: string }>;
}

/**
 * Suspected outliers within a dataset: |z| > threshold among values of the
 * same indicator, year, level and breakdown (needs ≥ 8 peers).
 */
export async function findOutliers(datasetId: number, threshold = 3, limit = 100) {
  const res = await db.execute(sql`
    WITH s AS (
      SELECT v.id, v.value,
             AVG(v.value) OVER w AS mean, STDDEV_POP(v.value) OVER w AS sd, COUNT(*) OVER w AS n
      FROM indicator_values v JOIN geo_units g ON g.id = v.geo_unit_id
      WHERE v.dataset_id = ${datasetId}
      WINDOW w AS (PARTITION BY v.indicator_id, v.year, g.level, v.sex, v.age_group, v.residence)
    )
    SELECT ${valueCols}, ROUND(((s.value - s.mean) / NULLIF(s.sd, 0))::numeric, 2)::float AS z
    FROM s
    JOIN indicator_values v ON v.id = s.id
    JOIN indicators i ON i.id = v.indicator_id
    JOIN geo_units g ON g.id = v.geo_unit_id
    WHERE s.n >= 8 AND s.sd > 0 AND ABS((s.value - s.mean) / s.sd) > ${threshold}
    ORDER BY ABS((s.value - s.mean) / s.sd) DESC
    LIMIT ${limit}
  `);
  return res.rows as unknown as Array<ValueRow & { z: number }>;
}

/* ── Lookups for forms ───────────────────────────────────────────────────── */

export async function listIndicatorOptions() {
  return db
    .select({
      code: schema.indicators.code,
      name: schema.indicators.name,
      category: schema.indicators.category,
      valueType: schema.indicators.valueType,
      unit: schema.indicators.unit,
    })
    .from(schema.indicators)
    .orderBy(schema.indicators.category, schema.indicators.name);
}

export async function listSeriesKeys(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ k: schema.datasets.seriesKey })
    .from(schema.datasets)
    .orderBy(schema.datasets.seriesKey);
  return rows.map((r) => r.k);
}

export async function dashboardCounts() {
  const res = await db.execute(sql`
    SELECT
      (SELECT COUNT(*)::int FROM datasets WHERE status = 'draft') AS drafts,
      (SELECT COUNT(*)::int FROM datasets WHERE status = 'published') AS published,
      (SELECT COUNT(*)::int FROM import_runs WHERE status = 'failed'
          AND started_at > now() - interval '7 days') AS "failedRuns7d",
      (SELECT COUNT(*)::int FROM import_runs WHERE kind = 'upload' AND status = 'running') AS "openUploads",
      (SELECT COUNT(*)::int FROM indicator_values WHERE quality_flag IS NOT NULL) AS flagged,
      (SELECT COUNT(*)::int FROM geo_aliases) AS aliases,
      (SELECT COUNT(*)::int FROM sources) AS sources
  `);
  return res.rows[0] as {
    drafts: number;
    published: number;
    failedRuns7d: number;
    openUploads: number;
    flagged: number;
    aliases: number;
    sources: number;
  };
}
