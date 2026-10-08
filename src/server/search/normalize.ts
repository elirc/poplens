/**
 * Pure (database-free) parts of the combined place + indicator search:
 * query normalisation, LIKE escaping and the final ranking applied on top of
 * the pg_trgm candidates. Unit-tested in normalize.test.ts.
 */
import type { IndicatorHit, PlaceHit, PlaceLevel } from "@/components/search/types";

export const MIN_QUERY_LENGTH = 2;
export const MAX_QUERY_LENGTH = 80;
export const PLACE_LIMIT = 8;
export const INDICATOR_LIMIT = 5;

/** Strip diacritics (NFKD + remove combining marks). */
function stripDiacritics(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

/**
 * User-facing query clean-up: trim, collapse whitespace, strip diacritics,
 * cap length. Case is preserved (ILIKE / pg_trgm are case-insensitive).
 */
export function normalizeQuery(raw: string | null | undefined): string {
  if (!raw) return "";
  const noControl = Array.from(stripDiacritics(raw), (ch) =>
    ch.charCodeAt(0) < 32 ? " " : ch,
  ).join("");
  return noControl
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_QUERY_LENGTH)
    .trim();
}

/**
 * Alias-matching form, mirroring geo_aliases.normalized: lower-case,
 * punctuation and hyphens become spaces, whitespace collapsed.
 * "Akwa-Ibom" → "akwa ibom", "F.C.T." → "f c t".
 */
export function normalizeForAlias(raw: string): string {
  return stripDiacritics(raw)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Escape LIKE/ILIKE wildcards so user input matches literally (escape char \). */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export function isSearchable(q: string): boolean {
  return q.length >= MIN_QUERY_LENGTH;
}

/* ── Places ────────────────────────────────────────────────────────────── */

export interface PlaceCandidate {
  code: string;
  name: string;
  level: PlaceLevel;
  parentName: string | null;
  parentLevel: PlaceLevel | null;
  stateName: string | null;
  /** pg_trgm similarity (0–1) of the best matching name or alias. */
  sim: number;
  matchedAlias: string | null;
}

/**
 * Larger units win ties: someone typing "Kano" most likely wants the state,
 * then the LGA, then the dozen "Kano … Ward N" wards.
 */
const LEVEL_WEIGHT: Record<PlaceLevel, number> = {
  nation: 0.2,
  state: 0.15,
  zone: 0.05,
  lga: 0.1,
  ward: 0,
};

/** Match strength of a text against the query: exact > prefix > word-prefix > none. */
export function matchBoost(text: string, query: string): number {
  const t = normalizeForAlias(text);
  const q = normalizeForAlias(query);
  if (!q) return 0;
  if (t === q) return 1;
  if (t.startsWith(q)) return 0.5;
  if (t.split(" ").some((w) => w.startsWith(q))) return 0.25;
  if (t.includes(q)) return 0.1;
  return 0;
}

export function scorePlace(c: PlaceCandidate, query: string): number {
  const nameBoost = matchBoost(c.name, query);
  const aliasBoost = c.matchedAlias ? matchBoost(c.matchedAlias, query) * 0.9 : 0;
  return c.sim + Math.max(nameBoost, aliasBoost) + LEVEL_WEIGHT[c.level];
}

const LEVEL_LABEL: Record<PlaceLevel, string> = {
  nation: "Country",
  zone: "Zone",
  state: "State",
  lga: "LGA",
  ward: "Ward",
};

/** Parent context shown under a hit: "Ward · Gwale LGA, Kano". */
export function placeContext(c: Pick<PlaceCandidate, "level" | "parentName" | "parentLevel" | "stateName">): string | null {
  if (c.level === "nation") return null;
  const parts: string[] = [];
  if (c.parentName && c.parentLevel && c.parentLevel !== "nation") {
    parts.push(
      c.parentLevel === "lga" ? `${c.parentName} LGA` : c.parentName,
    );
  }
  if (c.stateName && c.level === "ward" && c.stateName !== c.parentName) {
    parts.push(c.stateName);
  }
  const where = parts.join(", ");
  return where ? `${LEVEL_LABEL[c.level]} · ${where}` : LEVEL_LABEL[c.level];
}

export function rankPlaces(
  candidates: PlaceCandidate[],
  query: string,
  limit = PLACE_LIMIT,
): PlaceHit[] {
  const seen = new Set<string>();
  return candidates
    .map((c) => ({ c, score: scorePlace(c, query) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.c.name.length - b.c.name.length ||
        a.c.name.localeCompare(b.c.name),
    )
    .filter(({ c }) => (seen.has(c.code) ? false : (seen.add(c.code), true)))
    .slice(0, limit)
    .map(({ c }) => ({
      kind: "place" as const,
      code: c.code,
      name: c.name,
      level: c.level,
      context: placeContext(c),
      // Only surface the alias when the official name itself did not match.
      matchedAlias:
        c.matchedAlias && matchBoost(c.name, query) === 0 ? c.matchedAlias : null,
    }));
}

/* ── Indicators ────────────────────────────────────────────────────────── */

export interface IndicatorCandidate {
  code: string;
  name: string;
  category: string;
  unit: string;
  sim: number;
}

export function scoreIndicator(c: IndicatorCandidate, query: string): number {
  const q = query.trim().toLowerCase();
  const codeExact = c.code.toLowerCase() === q ? 1.2 : 0;
  const codePrefix = !codeExact && c.code.toLowerCase().startsWith(q) ? 0.3 : 0;
  return c.sim + Math.max(codeExact, codePrefix, matchBoost(c.name, query));
}

export function rankIndicators(
  candidates: IndicatorCandidate[],
  query: string,
  limit = INDICATOR_LIMIT,
): IndicatorHit[] {
  return candidates
    .map((c) => ({ c, score: scoreIndicator(c, query) }))
    .sort((a, b) => b.score - a.score || a.c.name.localeCompare(b.c.name))
    .slice(0, limit)
    .map(({ c }) => ({
      kind: "indicator" as const,
      code: c.code,
      name: c.name,
      category: c.category,
      unit: c.unit,
    }));
}
