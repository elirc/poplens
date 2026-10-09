import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { GeoLevel } from "@/server/geo/queries";

/**
 * Published-value data access. THE rule: a value is publicly visible iff its
 * dataset has status='published'. Every query here enforces that join — never
 * query indicator_values directly from feature code.
 */

export interface IndicatorMetaRow {
  id: number;
  code: string;
  name: string;
  category: string;
  definition: string;
  unit: string;
  valueType: "count" | "rate" | "percent" | "ratio" | "index";
  higherIsBetter: boolean | null;
  decimals: number;
  aggregation: string;
  methodNotes: string | null;
}

export interface PublicValue {
  value: number;
  lower: number | null;
  upper: number | null;
  year: number;
  periodLabel: string | null;
  isEstimate: boolean;
  note: string | null;
  geoUnitId: number;
  datasetId: number;
  datasetTitle: string;
  isSynthetic: boolean;
  sourceId: number;
  sourceKey: string;
  sourcePublisher: string;
  sourceTitle: string;
}

export async function getIndicatorByCode(
  code: string,
): Promise<IndicatorMetaRow | null> {
  const rows = await db
    .select()
    .from(schema.indicators)
    .where(eq(schema.indicators.code, code))
    .limit(1);
  return (rows[0] as IndicatorMetaRow | undefined) ?? null;
}

export async function listIndicators(): Promise<IndicatorMetaRow[]> {
  const rows = await db
    .select()
    .from(schema.indicators)
    .orderBy(schema.indicators.category, schema.indicators.name);
  return rows as IndicatorMetaRow[];
}

const publicValueSelect = {
  value: schema.indicatorValues.value,
  lower: schema.indicatorValues.lower,
  upper: schema.indicatorValues.upper,
  year: schema.indicatorValues.year,
  periodLabel: schema.indicatorValues.periodLabel,
  isEstimate: schema.indicatorValues.isEstimate,
  note: schema.indicatorValues.note,
  geoUnitId: schema.indicatorValues.geoUnitId,
  datasetId: schema.datasets.id,
  datasetTitle: schema.datasets.title,
  isSynthetic: schema.datasets.isSynthetic,
  sourceId: schema.sources.id,
  sourceKey: schema.sources.key,
  sourcePublisher: schema.sources.publisher,
  sourceTitle: schema.sources.title,
};

function publishedJoin() {
  return db
    .select(publicValueSelect)
    .from(schema.indicatorValues)
    .innerJoin(
      schema.datasets,
      eq(schema.indicatorValues.datasetId, schema.datasets.id),
    )
    .innerJoin(schema.sources, eq(schema.datasets.sourceId, schema.sources.id));
}

/** Headline-breakdown filter: sex/ageGroup/residence all 'all'. */
const headline = () =>
  and(
    eq(schema.indicatorValues.sex, "all"),
    eq(schema.indicatorValues.ageGroup, "all"),
    eq(schema.indicatorValues.residence, "all"),
  );

/**
 * Latest published headline value for one indicator & place (or a given year).
 * Returns null when there is no data (callers render "No data", never 0).
 */
export async function getPublishedValue(
  indicatorId: number,
  geoUnitId: number,
  opts: { year?: number } = {},
): Promise<PublicValue | null> {
  const conds = [
    eq(schema.indicatorValues.indicatorId, indicatorId),
    eq(schema.indicatorValues.geoUnitId, geoUnitId),
    eq(schema.datasets.status, "published"),
    headline(),
  ];
  if (opts.year) conds.push(eq(schema.indicatorValues.year, opts.year));
  const rows = await publishedJoin()
    .where(and(...conds))
    .orderBy(desc(schema.indicatorValues.year), desc(schema.datasets.publishedAt))
    .limit(1);
  return (rows[0] as PublicValue | undefined) ?? null;
}

/**
 * Published headline values for every unit of a level in one year —
 * powers the choropleth, rankings and compare. One row per unit (the most
 * recently published dataset wins for a unit+year).
 */
export async function getValuesForLevel(
  indicatorId: number,
  level: GeoLevel,
  year: number,
  opts: { parentId?: number; redistributableOnly?: boolean } = {},
): Promise<Array<PublicValue & { code: string; name: string }>> {
  const parentCond = opts.parentId
    ? sql`AND g.parent_id = ${opts.parentId}`
    : sql``;
  // Licence gate (public API): restrict to redistributable sources BEFORE the
  // DISTINCT ON, so a place falls back to its newest allowed value instead of
  // being dropped when its newest value has a restricted licence.
  const licenceCond = opts.redistributableOnly
    ? sql`AND s.allows_redistribution = true`
    : sql``;
  const res = await db.execute(sql`
    SELECT DISTINCT ON (v.geo_unit_id)
      v.value, v.lower, v.upper, v.year, v.period_label AS "periodLabel",
      v.is_estimate AS "isEstimate", v.note, v.geo_unit_id AS "geoUnitId",
      d.id AS "datasetId", d.title AS "datasetTitle", d.is_synthetic AS "isSynthetic",
      s.id AS "sourceId", s.key AS "sourceKey", s.publisher AS "sourcePublisher",
      s.title AS "sourceTitle", g.code, g.name
    FROM indicator_values v
    JOIN datasets d ON d.id = v.dataset_id AND d.status = 'published'
    JOIN sources s ON s.id = d.source_id
    JOIN geo_units g ON g.id = v.geo_unit_id
    WHERE v.indicator_id = ${indicatorId}
      AND v.year = ${year}
      AND g.level = ${level}
      AND v.sex = 'all' AND v.age_group = 'all' AND v.residence = 'all'
      ${parentCond}
      ${licenceCond}
    ORDER BY v.geo_unit_id, d.published_at DESC
  `);
  return res.rows as unknown as Array<PublicValue & { code: string; name: string }>;
}

/**
 * Every published headline value for ONE place across all indicators and
 * years (one row per indicator+year, newest dataset wins). Bulk variant of
 * getPublishedValue for pages that show many indicators at once — a place
 * profile resolves all its tiles from a single query.
 */
export async function getAllPublishedHeadlineValues(
  geoUnitId: number,
): Promise<Array<PublicValue & { indicatorId: number }>> {
  const res = await db.execute(sql`
    SELECT DISTINCT ON (v.indicator_id, v.year)
      v.indicator_id AS "indicatorId",
      v.value, v.lower, v.upper, v.year, v.period_label AS "periodLabel",
      v.is_estimate AS "isEstimate", v.note, v.geo_unit_id AS "geoUnitId",
      d.id AS "datasetId", d.title AS "datasetTitle", d.is_synthetic AS "isSynthetic",
      s.id AS "sourceId", s.key AS "sourceKey", s.publisher AS "sourcePublisher",
      s.title AS "sourceTitle"
    FROM indicator_values v
    JOIN datasets d ON d.id = v.dataset_id AND d.status = 'published'
    JOIN sources s ON s.id = d.source_id
    WHERE v.geo_unit_id = ${geoUnitId}
      AND v.sex = 'all' AND v.age_group = 'all' AND v.residence = 'all'
    ORDER BY v.indicator_id, v.year, d.published_at DESC
  `);
  return res.rows as unknown as Array<PublicValue & { indicatorId: number }>;
}

/**
 * Every published headline value for all units of a sibling scope (a level,
 * optionally under one parent) across all indicators and years. Bulk variant
 * of getValuesForLevel used to compute all of a profile's ranks at once.
 */
export async function getHeadlineValuesForScope(
  level: GeoLevel,
  parentId?: number,
): Promise<Array<{ indicatorId: number; geoUnitId: number; year: number; value: number }>> {
  const parentCond = parentId ? sql`AND g.parent_id = ${parentId}` : sql``;
  const res = await db.execute(sql`
    SELECT DISTINCT ON (v.indicator_id, v.geo_unit_id, v.year)
      v.indicator_id AS "indicatorId", v.geo_unit_id AS "geoUnitId",
      v.year, v.value
    FROM indicator_values v
    JOIN datasets d ON d.id = v.dataset_id AND d.status = 'published'
    JOIN geo_units g ON g.id = v.geo_unit_id AND g.level = ${level}
    WHERE v.sex = 'all' AND v.age_group = 'all' AND v.residence = 'all'
      ${parentCond}
    ORDER BY v.indicator_id, v.geo_unit_id, v.year, d.published_at DESC
  `);
  return res.rows as unknown as Array<{
    indicatorId: number;
    geoUnitId: number;
    year: number;
    value: number;
  }>;
}

/**
 * Trend rows for an indicator across one or more places, ordered by year.
 * Rows carry sourceId/sourceKey so the UI can break the line and mark the
 * point where the source changes (spec: never silently join sources).
 */
export async function getTrendSeries(
  indicatorId: number,
  geoUnitIds: number[],
): Promise<PublicValue[]> {
  if (geoUnitIds.length === 0) return [];
  const rows = await publishedJoin()
    .where(
      and(
        eq(schema.indicatorValues.indicatorId, indicatorId),
        inArray(schema.indicatorValues.geoUnitId, geoUnitIds),
        eq(schema.datasets.status, "published"),
        headline(),
      ),
    )
    .orderBy(schema.indicatorValues.geoUnitId, schema.indicatorValues.year);
  return rows as PublicValue[];
}

/** Years with any published headline value for an indicator at a level. */
export async function getAvailableYears(
  indicatorId: number,
  level: GeoLevel,
): Promise<number[]> {
  const res = await db.execute(sql`
    SELECT DISTINCT v.year
    FROM indicator_values v
    JOIN datasets d ON d.id = v.dataset_id AND d.status = 'published'
    JOIN geo_units g ON g.id = v.geo_unit_id AND g.level = ${level}
    WHERE v.indicator_id = ${indicatorId}
      AND v.sex = 'all' AND v.age_group = 'all' AND v.residence = 'all'
    ORDER BY v.year
  `);
  return (res.rows as Array<{ year: number }>).map((r) => r.year);
}

/** Levels × year-ranges available for an indicator (indicator page). */
export async function getCoverage(
  indicatorId: number,
): Promise<Array<{ level: GeoLevel; minYear: number; maxYear: number; places: number }>> {
  const res = await db.execute(sql`
    SELECT g.level, MIN(v.year) AS "minYear", MAX(v.year) AS "maxYear",
           COUNT(DISTINCT v.geo_unit_id) AS places
    FROM indicator_values v
    JOIN datasets d ON d.id = v.dataset_id AND d.status = 'published'
    JOIN geo_units g ON g.id = v.geo_unit_id
    WHERE v.indicator_id = ${indicatorId}
    GROUP BY g.level
    ORDER BY g.level
  `);
  return res.rows as Array<{
    level: GeoLevel;
    minYear: number;
    maxYear: number;
    places: number;
  }>;
}

/** Datasets/sources behind a place's published values (profile "sources used"). */
export async function getSourcesForPlace(
  geoUnitId: number,
): Promise<
  Array<{ sourceTitle: string; publisher: string; licence: string; datasetTitle: string; year: string | null }>
> {
  const res = await db.execute(sql`
    SELECT DISTINCT s.title AS "sourceTitle", s.publisher, s.licence,
           d.title AS "datasetTitle", d.years_covered AS year
    FROM indicator_values v
    JOIN datasets d ON d.id = v.dataset_id AND d.status = 'published'
    JOIN sources s ON s.id = d.source_id
    WHERE v.geo_unit_id = ${geoUnitId}
    ORDER BY s.publisher
  `);
  return res.rows as Array<{
    sourceTitle: string;
    publisher: string;
    licence: string;
    datasetTitle: string;
    year: string | null;
  }>;
}
