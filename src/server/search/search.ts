import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { SearchResponse } from "@/components/search/types";
import {
  escapeLike,
  isSearchable,
  normalizeForAlias,
  normalizeQuery,
  rankIndicators,
  rankPlaces,
  type IndicatorCandidate,
  type PlaceCandidate,
} from "./normalize";

/** How many trigram candidates to pull before the in-process re-rank. */
const PLACE_CANDIDATES = 40;
const INDICATOR_CANDIDATES = 20;

/**
 * Places by official name or alias. Uses the pg_trgm GIN indexes on
 * geo_units.name and geo_aliases.normalized (`%` similarity and ILIKE both
 * use them). Prefix matches are pulled first so short queries ("Ka") still
 * reach the re-rank even when their trigram similarity is low.
 */
async function searchPlaces(q: string): Promise<PlaceCandidate[]> {
  const norm = normalizeForAlias(q);
  const contains = `%${escapeLike(q)}%`;
  const prefix = `${escapeLike(q)}%`;
  const aliasPrefix = `${escapeLike(norm)}%`;
  const res = await db.execute(sql`
    WITH cand AS (
      SELECT g.id, similarity(g.name, ${q})::float8 AS sim, NULL::text AS alias
      FROM geo_units g
      WHERE g.name % ${q} OR g.name ILIKE ${contains}
      UNION ALL
      SELECT a.geo_unit_id AS id, similarity(a.normalized, ${norm})::float8 AS sim, a.alias
      FROM geo_aliases a
      WHERE ${norm} <> '' AND (a.normalized % ${norm} OR a.normalized LIKE ${aliasPrefix})
    ), best AS (
      SELECT DISTINCT ON (id) id, sim, alias FROM cand ORDER BY id, sim DESC
    )
    SELECT g.code, g.name, g.level::text AS level,
           p.name AS "parentName", p.level::text AS "parentLevel",
           st.name AS "stateName", b.sim, b.alias AS "matchedAlias"
    FROM best b
    JOIN geo_units g ON g.id = b.id
    LEFT JOIN geo_units p ON p.id = g.parent_id
    LEFT JOIN geo_units st ON st.id = g.state_id
    ORDER BY (g.name ILIKE ${prefix}) DESC, b.sim DESC, g.name
    LIMIT ${PLACE_CANDIDATES}
  `);
  return (res.rows as Array<Record<string, unknown>>).map((r) => ({
    code: String(r.code),
    name: String(r.name),
    level: r.level as PlaceCandidate["level"],
    parentName: (r.parentName as string | null) ?? null,
    parentLevel: (r.parentLevel as PlaceCandidate["parentLevel"]) ?? null,
    stateName: (r.stateName as string | null) ?? null,
    sim: Number(r.sim) || 0,
    matchedAlias: (r.matchedAlias as string | null) ?? null,
  }));
}

/** Indicators by name or code (ILIKE + trigram similarity). */
async function searchIndicators(q: string): Promise<IndicatorCandidate[]> {
  const contains = `%${escapeLike(q)}%`;
  const res = await db.execute(sql`
    SELECT code, name, category::text AS category, unit,
           GREATEST(similarity(name, ${q}), similarity(code, ${q}))::float8 AS sim
    FROM indicators
    WHERE name ILIKE ${contains} OR code ILIKE ${contains} OR name % ${q}
    ORDER BY sim DESC, name
    LIMIT ${INDICATOR_CANDIDATES}
  `);
  return (res.rows as Array<Record<string, unknown>>).map((r) => ({
    code: String(r.code),
    name: String(r.name),
    category: String(r.category),
    unit: String(r.unit),
    sim: Number(r.sim) || 0,
  }));
}

/**
 * Combined search for the home/header search box: up to 8 places (with level
 * and parent context) and up to 5 indicators. Queries shorter than two
 * characters return nothing.
 */
export async function searchAll(raw: string): Promise<SearchResponse> {
  const q = normalizeQuery(raw);
  if (!isSearchable(q)) return { query: q, places: [], indicators: [] };
  const [places, indicators] = await Promise.all([
    searchPlaces(q),
    searchIndicators(q),
  ]);
  return {
    query: q,
    places: rankPlaces(places, q),
    indicators: rankIndicators(indicators, q),
  };
}
