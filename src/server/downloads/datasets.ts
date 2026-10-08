import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { DatasetMeta } from "./citation";

/**
 * Dataset + source metadata for citations and licence gating, and the
 * whole-dataset export. Only PUBLISHED datasets are ever returned — the same
 * visibility rule as src/server/indicators/queries.ts.
 */

const metaCols = {
  datasetId: schema.datasets.id,
  datasetTitle: schema.datasets.title,
  yearsCovered: schema.datasets.yearsCovered,
  releaseDate: schema.datasets.releaseDate,
  isSynthetic: schema.datasets.isSynthetic,
  sourceId: schema.sources.id,
  sourceKey: schema.sources.key,
  publisher: schema.sources.publisher,
  sourceTitle: schema.sources.title,
  url: schema.sources.url,
  licence: schema.sources.licence,
  licenceUrl: schema.sources.licenceUrl,
  allowsRedistribution: schema.sources.allowsRedistribution,
  citationTemplate: schema.sources.citationTemplate,
};

type MetaRow = {
  datasetId: number;
  datasetTitle: string;
  yearsCovered: string | null;
  releaseDate: string | null;
  isSynthetic: boolean;
  sourceId: number;
  sourceKey: string;
  publisher: string;
  sourceTitle: string;
  url: string | null;
  licence: string;
  licenceUrl: string | null;
  allowsRedistribution: boolean;
  citationTemplate: string | null;
};

function toMeta(r: MetaRow): DatasetMeta {
  return {
    datasetId: r.datasetId,
    datasetTitle: r.datasetTitle,
    yearsCovered: r.yearsCovered,
    releaseDate: r.releaseDate,
    isSynthetic: r.isSynthetic,
    source: {
      id: r.sourceId,
      key: r.sourceKey,
      publisher: r.publisher,
      title: r.sourceTitle,
      url: r.url,
      licence: r.licence,
      licenceUrl: r.licenceUrl,
      allowsRedistribution: r.allowsRedistribution,
      citationTemplate: r.citationTemplate,
    },
  };
}

export async function loadPublishedDatasetMeta(ids: number[]): Promise<DatasetMeta[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const rows = await db
    .select(metaCols)
    .from(schema.datasets)
    .innerJoin(schema.sources, eq(schema.datasets.sourceId, schema.sources.id))
    .where(and(inArray(schema.datasets.id, unique), eq(schema.datasets.status, "published")));
  return (rows as MetaRow[]).map(toMeta);
}

export async function getPublishedDatasetMeta(id: number): Promise<DatasetMeta | null> {
  return (await loadPublishedDatasetMeta([id]))[0] ?? null;
}

export interface DatasetExportRow {
  indicatorCode: string;
  indicatorName: string;
  unit: string;
  level: string;
  placeCode: string;
  placeName: string;
  year: number;
  periodLabel: string | null;
  sex: string;
  ageGroup: string;
  residence: string;
  value: number;
  lower: number | null;
  upper: number | null;
  isEstimate: boolean;
  note: string | null;
}

/**
 * Every value of one PUBLISHED dataset (all breakdowns), for the dataset
 * export. The published join is enforced here exactly as in
 * src/server/indicators/queries.ts (orchestrator-approved exception to the
 * "values only through queries.ts" rule: queries.ts has no whole-dataset
 * reader and this is the only consumer).
 */
export async function getPublishedDatasetValues(datasetId: number): Promise<DatasetExportRow[]> {
  const v = schema.indicatorValues;
  const rows = await db
    .select({
      indicatorCode: schema.indicators.code,
      indicatorName: schema.indicators.name,
      unit: schema.indicators.unit,
      level: schema.geoUnits.level,
      placeCode: schema.geoUnits.code,
      placeName: schema.geoUnits.name,
      year: v.year,
      periodLabel: v.periodLabel,
      sex: v.sex,
      ageGroup: v.ageGroup,
      residence: v.residence,
      value: v.value,
      lower: v.lower,
      upper: v.upper,
      isEstimate: v.isEstimate,
      note: v.note,
    })
    .from(v)
    .innerJoin(
      schema.datasets,
      and(eq(v.datasetId, schema.datasets.id), eq(schema.datasets.status, "published")),
    )
    .innerJoin(schema.indicators, eq(v.indicatorId, schema.indicators.id))
    .innerJoin(schema.geoUnits, eq(v.geoUnitId, schema.geoUnits.id))
    .where(eq(v.datasetId, datasetId))
    .orderBy(asc(schema.indicators.code), asc(schema.geoUnits.level), asc(schema.geoUnits.code), asc(v.year));
  return rows as DatasetExportRow[];
}
