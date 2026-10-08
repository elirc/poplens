import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { GeoUnitLite } from "@/server/geo/queries";

/**
 * Small read-only queries for the profile's facilities and outbreak sections
 * (allowed by the A4 brief; the owning agents build different pages).
 * Public-visibility rule applied here too: outbreak rows only from published
 * datasets; facilities only when their dataset (if any) is published.
 */

export interface FacilityItem {
  id: number;
  name: string;
  type: string;
  careLevel: "primary" | "secondary" | "tertiary";
  ownership: string;
  lgaName: string | null;
}

export interface FacilitySummary {
  total: number;
  byLevel: Record<"primary" | "secondary" | "tertiary", number>;
  top: FacilityItem[];
  sourceName: string | null;
  sourceVersion: string | null;
}

function facilityScope(unit: GeoUnitLite) {
  switch (unit.level) {
    case "state":
      return sql`f.state_id = ${unit.id}`;
    case "lga":
      return sql`f.lga_id = ${unit.id}`;
    case "ward":
      return sql`f.ward_id = ${unit.id}`;
    case "zone":
      return sql`f.state_id IN (SELECT id FROM geo_units WHERE parent_id = ${unit.id})`;
    default:
      return sql`TRUE`;
  }
}

const visibleFacility = sql`(f.dataset_id IS NULL OR d.status = 'published')`;

export async function getFacilitySummary(unit: GeoUnitLite): Promise<FacilitySummary> {
  const scope = facilityScope(unit);
  const [counts, top, src] = await Promise.all([
    db.execute(sql`
      SELECT f.care_level::text AS level, COUNT(*)::int AS n
      FROM health_facilities f
      LEFT JOIN datasets d ON d.id = f.dataset_id
      WHERE ${scope} AND ${visibleFacility}
      GROUP BY f.care_level
    `),
    db.execute(sql`
      SELECT f.id, f.name, f.type, f.care_level::text AS "careLevel",
             f.ownership::text AS ownership, l.name AS "lgaName"
      FROM health_facilities f
      LEFT JOIN datasets d ON d.id = f.dataset_id
      LEFT JOIN geo_units l ON l.id = f.lga_id
      WHERE ${scope} AND ${visibleFacility}
      ORDER BY CASE f.care_level WHEN 'tertiary' THEN 0 WHEN 'secondary' THEN 1 ELSE 2 END,
               f.name
      LIMIT 15
    `),
    db.execute(sql`
      SELECT s.publisher AS "sourceName", MAX(f.source_version) AS "sourceVersion"
      FROM health_facilities f
      LEFT JOIN datasets d ON d.id = f.dataset_id
      LEFT JOIN sources s ON s.id = d.source_id
      WHERE ${scope} AND ${visibleFacility}
      GROUP BY s.publisher
      ORDER BY COUNT(*) DESC
      LIMIT 1
    `),
  ]);
  const byLevel = { primary: 0, secondary: 0, tertiary: 0 };
  for (const r of counts.rows as Array<{ level: keyof typeof byLevel; n: number }>) {
    byLevel[r.level] = Number(r.n);
  }
  const s = src.rows[0] as { sourceName: string | null; sourceVersion: string | null } | undefined;
  return {
    total: byLevel.primary + byLevel.secondary + byLevel.tertiary,
    byLevel,
    top: (top.rows as Array<Record<string, unknown>>).map((r) => ({
      id: Number(r.id),
      name: String(r.name),
      type: String(r.type),
      careLevel: r.careLevel as FacilityItem["careLevel"],
      ownership: String(r.ownership),
      lgaName: (r.lgaName as string | null) ?? null,
    })),
    sourceName: s?.sourceName ?? null,
    sourceVersion: s?.sourceVersion ?? null,
  };
}

export interface OutbreakWeek {
  week: number;
  /** null when the reported rows carried no confirmed figure. */
  confirmed: number | null;
}

export interface OutbreakHistory {
  year: number;
  scopeLabel: string;
  sourceName: string;
  diseases: Array<{ disease: string; weeks: OutbreakWeek[]; maxWeek: number }>;
}

/**
 * Weekly confirmed cases per disease for the latest year with published
 * outbreak reports. `stateId` null = all states (national view). Weeks with
 * no report are absent (rendered as gaps, never zero).
 */
export async function getOutbreakHistory(
  stateId: number | null,
  scopeLabel: string,
): Promise<OutbreakHistory | null> {
  const scope = stateId ? sql`o.state_id = ${stateId}` : sql`TRUE`;
  const res = await db.execute(sql`
    WITH pub AS (
      SELECT o.disease::text AS disease, o.year, o.week, o.confirmed, s.publisher
      FROM outbreak_reports o
      JOIN datasets d ON d.id = o.dataset_id AND d.status = 'published'
      JOIN sources s ON s.id = d.source_id
      WHERE ${scope}
    ), latest AS (SELECT MAX(year) AS y FROM pub)
    SELECT disease, year, week,
           CASE WHEN COUNT(confirmed) = 0 THEN NULL ELSE SUM(confirmed) END::int AS confirmed,
           STRING_AGG(DISTINCT publisher, '; ') AS publisher
    FROM pub, latest
    WHERE pub.year = latest.y
    GROUP BY disease, year, week
    ORDER BY disease, week
  `);
  const rows = res.rows as Array<{
    disease: string;
    year: number;
    week: number;
    confirmed: number | null;
    publisher: string;
  }>;
  if (rows.length === 0) return null;
  const map = new Map<string, OutbreakWeek[]>();
  for (const r of rows) {
    const list = map.get(r.disease) ?? [];
    list.push({ week: Number(r.week), confirmed: r.confirmed == null ? null : Number(r.confirmed) });
    map.set(r.disease, list);
  }
  return {
    year: Number(rows[0]!.year),
    scopeLabel,
    sourceName: [...new Set(rows.flatMap((r) => r.publisher.split("; ")))].join("; "),
    diseases: [...map.entries()].map(([disease, weeks]) => ({
      disease,
      weeks,
      maxWeek: Math.max(...weeks.map((w) => w.week)),
    })),
  };
}
