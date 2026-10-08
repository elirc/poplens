import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { Disease } from "@/components/analytics/params";
import type { OutbreakCell } from "@/components/analytics/types";

/**
 * Outbreak report queries for /outbreaks. Same public-visibility rule as
 * indicator values: a row is visible iff its dataset has status='published'.
 * When several published datasets report the same disease/state/year/week,
 * the most recently published one wins (as in getValuesForLevel).
 * Figures are returned exactly as reported — counts, never rates.
 */

/** Diseases that have any published report. */
export async function listOutbreakDiseases(): Promise<Disease[]> {
  const res = await db.execute(sql`
    SELECT DISTINCT o.disease::text AS disease
    FROM outbreak_reports o
    JOIN datasets d ON d.id = o.dataset_id AND d.status = 'published'
    ORDER BY 1
  `);
  return (res.rows as Array<{ disease: Disease }>).map((r) => r.disease);
}

/** Years (ascending) with published reports for a disease. */
export async function listOutbreakYears(disease: Disease): Promise<number[]> {
  const res = await db.execute(sql`
    SELECT DISTINCT o.year
    FROM outbreak_reports o
    JOIN datasets d ON d.id = o.dataset_id AND d.status = 'published'
    WHERE o.disease = ${disease}
    ORDER BY o.year
  `);
  return (res.rows as Array<{ year: number }>).map((r) => Number(r.year));
}

export interface OutbreakWeekly {
  rows: OutbreakCell[];
  /** Distinct source labels behind the rows (synthetic flagged). */
  sources: Array<{ publisher: string; isSynthetic: boolean }>;
}

/** Every published state-week row for one disease and year. */
export async function getOutbreakWeekly(disease: Disease, year: number): Promise<OutbreakWeekly> {
  const res = await db.execute(sql`
    SELECT DISTINCT ON (o.state_id, o.week)
      o.state_id AS "stateId", g.code, g.name, o.week,
      o.suspected, o.confirmed, o.deaths,
      s.publisher, d.is_synthetic AS "isSynthetic"
    FROM outbreak_reports o
    JOIN datasets d ON d.id = o.dataset_id AND d.status = 'published'
    JOIN sources s ON s.id = d.source_id
    JOIN geo_units g ON g.id = o.state_id
    WHERE o.disease = ${disease} AND o.year = ${year}
    ORDER BY o.state_id, o.week, d.published_at DESC NULLS LAST, d.id DESC
  `);
  const raw = res.rows as Array<{
    stateId: number;
    code: string;
    name: string;
    week: number;
    suspected: number | null;
    confirmed: number | null;
    deaths: number | null;
    publisher: string;
    isSynthetic: boolean;
  }>;
  const num = (v: unknown) => (v == null ? null : Number(v));
  const sources = new Map<string, { publisher: string; isSynthetic: boolean }>();
  const rows: OutbreakCell[] = raw.map((r) => {
    sources.set(`${r.publisher}|${r.isSynthetic}`, {
      publisher: r.publisher,
      isSynthetic: Boolean(r.isSynthetic),
    });
    return {
      stateId: Number(r.stateId),
      code: r.code,
      name: r.name,
      week: Number(r.week),
      suspected: num(r.suspected),
      confirmed: num(r.confirmed),
      deaths: num(r.deaths),
    };
  });
  return { rows, sources: [...sources.values()] };
}
