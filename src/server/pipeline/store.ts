import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { writeAudit } from "@/lib/audit";
import { nextVersionForSeries } from "@/server/datasets/versioning";
import type { GeoLevel } from "@/server/geo/queries";
import {
  computeChangeSummary,
  outbreakKey,
  valueKey,
  valueLabel,
  type DiffRow,
} from "./diff";
import type { ChangeSummary, ResolvedOutbreak, ResolvedValue } from "./types";

/**
 * Draft creation: one transaction inserts the dataset row (status 'draft',
 * next version of its series, changeSummary diff vs the published version)
 * and bulk-inserts its rows in ~1k-row statements.
 */

export const INSERT_BATCH = 1000;

export async function getPublishedForSeries(
  seriesKey: string,
): Promise<{ id: number; version: number } | null> {
  const [row] = await db
    .select({ id: schema.datasets.id, version: schema.datasets.version })
    .from(schema.datasets)
    .where(and(eq(schema.datasets.seriesKey, seriesKey), eq(schema.datasets.status, "published")))
    .limit(1);
  return row ?? null;
}

async function publishedValueRows(datasetId: number): Promise<DiffRow[]> {
  const res = await db.execute(sql`
    SELECT v.indicator_id AS "indicatorId", v.geo_unit_id AS "geoUnitId", v.year,
           v.sex, v.age_group AS "ageGroup", v.residence, v.value, v.lower, v.upper,
           i.code AS "indicatorCode", g.code AS "placeCode"
    FROM indicator_values v
    JOIN indicators i ON i.id = v.indicator_id
    JOIN geo_units g ON g.id = v.geo_unit_id
    WHERE v.dataset_id = ${datasetId}
  `);
  return (
    res.rows as Array<{
      indicatorId: number;
      geoUnitId: number;
      year: number;
      sex: string;
      ageGroup: string;
      residence: string;
      value: number;
      lower: number | null;
      upper: number | null;
      indicatorCode: string;
      placeCode: string;
    }>
  ).map((r) => ({
    key: valueKey(r),
    label: valueLabel(r),
    value: r.value,
    lower: r.lower,
    upper: r.upper,
  }));
}

async function publishedOutbreakRows(datasetId: number): Promise<DiffRow[]> {
  const res = await db.execute(sql`
    SELECT o.disease, o.state_id AS "stateId", o.year, o.week, o.suspected, o.confirmed,
           o.deaths, g.code AS "stateCode"
    FROM outbreak_reports o JOIN geo_units g ON g.id = o.state_id
    WHERE o.dataset_id = ${datasetId}
  `);
  return (
    res.rows as Array<{
      disease: string;
      stateId: number;
      year: number;
      week: number;
      suspected: number | null;
      confirmed: number | null;
      deaths: number | null;
      stateCode: string;
    }>
  ).map((r) => ({
    key: outbreakKey(r),
    label: `${r.disease} · ${r.stateCode} · ${r.year} wk ${r.week}`,
    value: r.suspected,
    lower: r.confirmed,
    upper: r.deaths,
  }));
}

/** id → {code, level} for labelling/coverage of resolved rows. */
async function geoInfo(ids: number[]): Promise<Map<number, { code: string; level: GeoLevel }>> {
  const out = new Map<number, { code: string; level: GeoLevel }>();
  const uniq = [...new Set(ids)];
  for (let i = 0; i < uniq.length; i += 5000) {
    const chunk = uniq.slice(i, i + 5000);
    const rows = await db
      .select({ id: schema.geoUnits.id, code: schema.geoUnits.code, level: schema.geoUnits.level })
      .from(schema.geoUnits)
      .where(inArray(schema.geoUnits.id, chunk));
    for (const r of rows) out.set(r.id, { code: r.code, level: r.level });
  }
  return out;
}

function yearsCovered(years: number[]): string | null {
  if (years.length === 0) return null;
  const min = Math.min(...years);
  const max = Math.max(...years);
  return min === max ? String(min) : `${min}–${max}`;
}

const LEVEL_ORDER: GeoLevel[] = ["nation", "zone", "state", "lga", "ward"];

export interface DraftMeta {
  sourceId: number;
  seriesKey: string;
  title: string;
  description?: string | null;
  releaseDate?: string | null;
  isSynthetic: boolean;
  fileKey?: string | null;
  uploadedBy: string | null;
  warnings?: string[];
}

export interface DraftResult {
  datasetId: number;
  version: number;
  changeSummary: ChangeSummary;
  inserted: number;
}

export async function createIndicatorDraft(
  meta: DraftMeta,
  values: ResolvedValue[],
): Promise<DraftResult> {
  const info = await geoInfo(values.map((v) => v.geoUnitId));
  const published = await getPublishedForSeries(meta.seriesKey);
  const pubRows = published ? await publishedValueRows(published.id) : [];
  const staged: DiffRow[] = values.map((v) => ({
    key: valueKey(v),
    label: valueLabel({ ...v, placeCode: info.get(v.geoUnitId)?.code ?? String(v.geoUnitId) }),
    value: v.value,
    lower: v.lower,
    upper: v.upper,
  }));
  const changeSummary = computeChangeSummary(staged, pubRows, {
    kind: "indicator_values",
    comparedWithDatasetId: published?.id ?? null,
    comparedWithVersion: published?.version ?? null,
    warnings: meta.warnings,
  });
  const levels = LEVEL_ORDER.filter((l) =>
    values.some((v) => info.get(v.geoUnitId)?.level === l),
  );
  const version = await nextVersionForSeries(meta.seriesKey);

  const datasetId = await db.transaction(async (tx) => {
    const [ds] = await tx
      .insert(schema.datasets)
      .values({
        sourceId: meta.sourceId,
        seriesKey: meta.seriesKey,
        version,
        title: meta.title,
        description: meta.description ?? null,
        releaseDate: meta.releaseDate ?? null,
        yearsCovered: yearsCovered(values.map((v) => v.year)),
        levelsCovered: levels,
        fileKey: meta.fileKey ?? null,
        status: "draft",
        isSynthetic: meta.isSynthetic,
        changeSummary,
        uploadedBy: meta.uploadedBy,
      })
      .returning({ id: schema.datasets.id });
    for (let i = 0; i < values.length; i += INSERT_BATCH) {
      const batch = values.slice(i, i + INSERT_BATCH).map((v) => ({
        indicatorId: v.indicatorId,
        geoUnitId: v.geoUnitId,
        year: v.year,
        periodLabel: v.periodLabel,
        value: v.value,
        lower: v.lower,
        upper: v.upper,
        sex: v.sex,
        ageGroup: v.ageGroup,
        residence: v.residence,
        datasetId: ds.id,
        isEstimate: v.isEstimate,
        note: v.note,
      }));
      await tx.insert(schema.indicatorValues).values(batch);
    }
    return ds.id;
  });

  await writeAudit({
    actorId: meta.uploadedBy,
    action: "dataset.create_draft",
    entity: "dataset",
    entityId: datasetId,
    detail: {
      seriesKey: meta.seriesKey,
      version,
      rows: values.length,
      added: changeSummary.added,
      changed: changeSummary.changed,
      removed: changeSummary.removed,
    },
  });
  return { datasetId, version, changeSummary, inserted: values.length };
}

export async function createOutbreakDraft(
  meta: DraftMeta,
  lines: ResolvedOutbreak[],
): Promise<DraftResult> {
  const info = await geoInfo(lines.map((l) => l.stateId));
  const published = await getPublishedForSeries(meta.seriesKey);
  const pubRows = published ? await publishedOutbreakRows(published.id) : [];
  const staged: DiffRow[] = lines.map((l) => ({
    key: outbreakKey(l),
    label: `${l.disease} · ${info.get(l.stateId)?.code ?? l.stateId} · ${l.year} wk ${l.week}`,
    value: l.suspected,
    lower: l.confirmed,
    upper: l.deaths,
  }));
  const changeSummary = computeChangeSummary(staged, pubRows, {
    kind: "outbreak_reports",
    comparedWithDatasetId: published?.id ?? null,
    comparedWithVersion: published?.version ?? null,
    warnings: meta.warnings,
  });
  const version = await nextVersionForSeries(meta.seriesKey);
  const datasetId = await db.transaction(async (tx) => {
    const [ds] = await tx
      .insert(schema.datasets)
      .values({
        sourceId: meta.sourceId,
        seriesKey: meta.seriesKey,
        version,
        title: meta.title,
        description: meta.description ?? null,
        releaseDate: meta.releaseDate ?? null,
        yearsCovered: yearsCovered(lines.map((l) => l.year)),
        levelsCovered: ["state"],
        fileKey: meta.fileKey ?? null,
        status: "draft",
        isSynthetic: meta.isSynthetic,
        changeSummary,
        uploadedBy: meta.uploadedBy,
      })
      .returning({ id: schema.datasets.id });
    for (let i = 0; i < lines.length; i += INSERT_BATCH) {
      await tx
        .insert(schema.outbreakReports)
        .values(lines.slice(i, i + INSERT_BATCH).map((l) => ({ ...l, datasetId: ds.id })));
    }
    return ds.id;
  });
  await writeAudit({
    actorId: meta.uploadedBy,
    action: "dataset.create_draft",
    entity: "dataset",
    entityId: datasetId,
    detail: { seriesKey: meta.seriesKey, version, rows: lines.length, kind: "outbreak_reports" },
  });
  return { datasetId, version, changeSummary, inserted: lines.length };
}
