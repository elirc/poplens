import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Extra read-only queries for place profiles and indicator pages that the
 * shared contract (src/server/indicators/queries.ts) does not cover.
 *
 * PUBLISHED-JOIN RULE: these deliberately COPY the contract's join pattern —
 * every read of indicator_values joins datasets with status = 'published'
 * (and sources) so draft / superseded / rolled-back values are never public.
 * Keep it that way if you edit them.
 */

export interface AgeSexRow {
  ageGroup: string;
  sex: "male" | "female" | "all";
  value: number;
}

export interface AgeSexBreakdown {
  year: number;
  sourceName: string;
  isEstimate: boolean;
  isSynthetic: boolean;
  rows: AgeSexRow[];
}

/**
 * pop_total broken down by age group (and sex where published) for one
 * place, latest year that has any age-group rows. Null when nothing is
 * published — the UI then shows "No data", never zeros.
 */
export async function getAgeSexBreakdown(
  geoUnitId: number,
): Promise<AgeSexBreakdown | null> {
  const res = await db.execute(sql`
    WITH r AS (
      SELECT DISTINCT ON (v.year, v.sex, v.age_group)
        v.year, v.sex, v.age_group AS "ageGroup", v.value, v.is_estimate AS "isEstimate",
        d.is_synthetic AS "isSynthetic", s.publisher AS "sourceName"
      FROM indicator_values v
      JOIN indicators i ON i.id = v.indicator_id AND i.code = 'pop_total'
      -- published-join rule (copied from src/server/indicators/queries.ts)
      JOIN datasets d ON d.id = v.dataset_id AND d.status = 'published'
      JOIN sources s ON s.id = d.source_id
      WHERE v.geo_unit_id = ${geoUnitId}
        AND v.age_group <> 'all'
        AND v.residence = 'all'
        AND v.sex IN ('male', 'female', 'all')
      ORDER BY v.year, v.sex, v.age_group, d.published_at DESC
    )
    SELECT * FROM r WHERE year = (SELECT MAX(year) FROM r)
  `);
  const rows = res.rows as Array<{
    year: number;
    sex: "male" | "female" | "all";
    ageGroup: string;
    value: number;
    isEstimate: boolean;
    isSynthetic: boolean;
    sourceName: string;
  }>;
  if (rows.length === 0) return null;
  return {
    year: Number(rows[0]!.year),
    sourceName: [...new Set(rows.map((r) => r.sourceName))].join("; "),
    isEstimate: rows.some((r) => r.isEstimate),
    isSynthetic: rows.some((r) => r.isSynthetic),
    rows: rows.map((r) => ({ ageGroup: r.ageGroup, sex: r.sex, value: Number(r.value) })),
  };
}

export interface IndicatorDatasetRow {
  datasetId: number;
  datasetTitle: string;
  version: number;
  yearsCovered: string | null;
  isSynthetic: boolean;
  publishedAt: string | null;
  sourceKey: string;
  publisher: string;
  sourceTitle: string;
  licence: string;
  sourceUrl: string | null;
  allowsRedistribution: boolean;
  levels: string[];
  minYear: number;
  maxYear: number;
}

/**
 * Published datasets (and their sources) that feed an indicator, with the
 * levels and years each contributes. Metadata only — no values leave here.
 */
export async function getDatasetsForIndicator(
  indicatorId: number,
): Promise<IndicatorDatasetRow[]> {
  const res = await db.execute(sql`
    SELECT d.id AS "datasetId", d.title AS "datasetTitle", d.version,
           d.years_covered AS "yearsCovered", d.is_synthetic AS "isSynthetic",
           d.published_at AS "publishedAt",
           s.key AS "sourceKey", s.publisher, s.title AS "sourceTitle", s.licence,
           s.url AS "sourceUrl", s.allows_redistribution AS "allowsRedistribution",
           ARRAY_AGG(DISTINCT g.level::text) AS levels,
           MIN(v.year) AS "minYear", MAX(v.year) AS "maxYear"
    FROM indicator_values v
    -- published-join rule (copied from src/server/indicators/queries.ts)
    JOIN datasets d ON d.id = v.dataset_id AND d.status = 'published'
    JOIN sources s ON s.id = d.source_id
    JOIN geo_units g ON g.id = v.geo_unit_id
    WHERE v.indicator_id = ${indicatorId}
    GROUP BY d.id, s.id
    ORDER BY s.publisher, d.title
  `);
  return (res.rows as Array<Record<string, unknown>>).map((r) => ({
    datasetId: Number(r.datasetId),
    datasetTitle: String(r.datasetTitle),
    version: Number(r.version),
    yearsCovered: (r.yearsCovered as string | null) ?? null,
    isSynthetic: Boolean(r.isSynthetic),
    publishedAt:
      r.publishedAt instanceof Date
        ? r.publishedAt.toISOString()
        : r.publishedAt
          ? String(r.publishedAt)
          : null,
    sourceKey: String(r.sourceKey),
    publisher: String(r.publisher),
    sourceTitle: String(r.sourceTitle),
    licence: String(r.licence),
    sourceUrl: (r.sourceUrl as string | null) ?? null,
    allowsRedistribution: Boolean(r.allowsRedistribution),
    levels: parsePgArray(r.levels),
    minYear: Number(r.minYear),
    maxYear: Number(r.maxYear),
  }));
}

/** node-postgres returns text[] as an array, but an enum-cast array may arrive as "{a,b}". */
function parsePgArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string") {
    return v
      .replace(/^\{|\}$/g, "")
      .split(",")
      .filter(Boolean);
  }
  return [];
}
