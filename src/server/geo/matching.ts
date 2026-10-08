import { eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { writeAudit } from "@/lib/audit";
import type { GeoLevel } from "@/server/geo/queries";
import { normalizeForAlias } from "@/server/search/normalize";

/**
 * Place-name matching engine (spec: Data pipeline §4).
 *
 * Order: official code → exact normalised name → alias → fuzzy (pg_trgm
 * similarity, scoped to the expected level and, when known, the parent
 * state). Only code / exact / alias hits that are UNAMBIGUOUS are
 * auto-matched; everything else (fuzzy hits, names shared by several units)
 * goes to the review list. Confirming a reviewed match inserts a geo_alias
 * (origin 'upload-review') so the next upload matches automatically.
 *
 * The core (`PlaceMatcher`) is pure and works on an in-memory index so it is
 * unit-testable; `loadPlaceIndex` + `pgTrgmFuzzy` back it with the database.
 */

export const FUZZY_THRESHOLD = 0.45;
const MAX_CANDIDATES = 5;

export type MatchStatus = "matched" | "review" | "unknown";
export type MatchMethod = "code" | "exact" | "alias" | "fuzzy";

export interface MatchCandidate {
  geoUnitId: number;
  name: string;
  code: string;
  score: number;
}

export interface MatchResult {
  status: MatchStatus;
  geoUnitId?: number;
  method?: MatchMethod;
  candidates: MatchCandidate[];
}

export interface PlaceQuery {
  /** Free-text place name as written in the source/file. */
  name?: string | null;
  /** Official code (geo_units.code), when the source gives one. */
  code?: string | null;
  level: GeoLevel;
  /** Restrict to units inside this state (geo_units.state_id), when known. */
  stateId?: number | null;
}

export interface IndexUnit {
  id: number;
  code: string;
  name: string;
  level: GeoLevel;
  stateId: number | null;
}

export interface IndexAlias {
  geoUnitId: number;
  alias: string;
}

/* ── Normalisation ───────────────────────────────────────────────────────── */

/** Trailing administrative words dropped before comparing names. */
const SUFFIXES = [
  "local government area",
  "local government council",
  "local government",
  "local govt area",
  "local govt",
  "area council",
  "state",
  "lga",
  "l g a",
  "lg",
];

/**
 * Matching key: the shared alias form (`normalizeForAlias` — the exact form
 * stored in geo_aliases.normalized by the seed: accents stripped, lower-case,
 * punctuation/whitespace runs → one space) plus matching-only extras:
 * '&'→'and', a leading "the" and trailing suffixes like "state"/"lga" dropped.
 * Both sides of every comparison go through this function; alias rows are
 * re-normalised from their `alias` text, so stored forms never drift.
 */
export function normalizePlaceName(input: string): string {
  let s = normalizeForAlias(input.replace(/&/g, " and "));
  s = s.replace(/^the /, "");
  let changed = true;
  while (changed) {
    changed = false;
    for (const suf of SUFFIXES) {
      if (s.endsWith(` ${suf}`) && s.length > suf.length + 1) {
        s = s.slice(0, -(suf.length + 1)).trim();
        changed = true;
      }
    }
  }
  return s;
}

/**
 * Built-in alternates for state/zone names that sources (notably the DHS
 * API: "FCT Abuja", "Nasarawa") spell differently. Applied in memory on top
 * of geo_aliases so matching works even before aliases are seeded. Keys are
 * official codes; values are raw spellings (normalised on load).
 */
export const BUILTIN_ALIASES: Record<string, string[]> = {
  "NG-FC": ["FCT", "FCT Abuja", "Abuja", "Abuja FCT", "Federal Capital Territory", "FCT-Abuja"],
  "NG-NA": ["Nassarawa", "Nasarawa"],
  "NG-AK": ["Akwa-Ibom", "Akwa Ibom", "Akwaibom"],
  "NG-CR": ["Cross-River", "Cross River", "Crossriver"],
  "NG-ZA": ["Zamfora"],
  "NG": ["Nigeria", "Federal Republic of Nigeria", "National", "Total", "NGA"],
  "NG-Z-NC": ["North-Central", "Northcentral", "NC"],
  "NG-Z-NE": ["North-East", "Northeast", "NE"],
  "NG-Z-NW": ["North-West", "Northwest", "NW"],
  "NG-Z-SE": ["South-East", "Southeast", "SE"],
  "NG-Z-SS": ["South-South", "Southsouth", "SS"],
  "NG-Z-SW": ["South-West", "Southwest", "SW"],
};

/* ── Trigram similarity (pg_trgm-compatible, for tests / offline use) ────── */

function trigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (const word of s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) {
    const padded = `  ${word} `;
    for (let i = 0; i + 3 <= padded.length; i++) out.add(padded.slice(i, i + 3));
  }
  return out;
}

/** Same definition as pg_trgm's similarity(): |A∩B| / |A∪B| over word trigrams. */
export function trigramSimilarity(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

/* ── Matcher ─────────────────────────────────────────────────────────────── */

/**
 * Fuzzy provider: return scored candidates for a normalised name within a
 * level (and optional state). Implementations: `memoryFuzzy` (pure JS) and
 * `pgTrgmFuzzy` (PostgreSQL pg_trgm, used in production).
 */
export type FuzzyProvider = (
  normalized: string,
  level: GeoLevel,
  stateId: number | null,
) => Promise<MatchCandidate[]>;

export class PlaceMatcher {
  private byCode = new Map<string, IndexUnit>();
  private byId = new Map<number, IndexUnit>();
  /** normalised name → units (several when names repeat across states). */
  private byName = new Map<string, IndexUnit[]>();
  private byAlias = new Map<string, Set<number>>();

  constructor(
    units: IndexUnit[],
    aliases: IndexAlias[],
    private readonly fuzzy: FuzzyProvider | null = null,
  ) {
    for (const u of units) {
      this.byCode.set(u.code.toUpperCase(), u);
      this.byId.set(u.id, u);
      const n = normalizePlaceName(u.name);
      const arr = this.byName.get(n) ?? [];
      arr.push(u);
      this.byName.set(n, arr);
    }
    const addAlias = (unitId: number, alias: string) => {
      const n = normalizePlaceName(alias);
      if (!n) return;
      const set = this.byAlias.get(n) ?? new Set<number>();
      set.add(unitId);
      this.byAlias.set(n, set);
    };
    for (const a of aliases) addAlias(a.geoUnitId, a.alias);
    for (const [code, spellings] of Object.entries(BUILTIN_ALIASES)) {
      const u = this.byCode.get(code);
      if (u) for (const s of spellings) addAlias(u.id, s);
    }
  }

  unit(id: number): IndexUnit | undefined {
    return this.byId.get(id);
  }

  unitByCode(code: string): IndexUnit | undefined {
    return this.byCode.get(code.trim().toUpperCase());
  }

  private inScope(u: IndexUnit, q: PlaceQuery): boolean {
    if (u.level !== q.level) return false;
    if (q.stateId != null && u.level !== "nation" && u.level !== "zone") {
      // a state's stateId is itself
      if (u.stateId !== q.stateId) return false;
    }
    return true;
  }

  private cand(u: IndexUnit, score: number): MatchCandidate {
    return { geoUnitId: u.id, name: u.name, code: u.code, score };
  }

  private decide(units: IndexUnit[], method: MatchMethod): MatchResult | null {
    if (units.length === 1) {
      return {
        status: "matched",
        geoUnitId: units[0].id,
        method,
        candidates: [this.cand(units[0], 1)],
      };
    }
    if (units.length > 1) {
      // Ambiguous (e.g. "Surulere" exists in Lagos and Oyo) → human review.
      return {
        status: "review",
        method,
        candidates: units.slice(0, MAX_CANDIDATES).map((u) => this.cand(u, 1)),
      };
    }
    return null;
  }

  async match(q: PlaceQuery): Promise<MatchResult> {
    // 1. official code (also accept a code typed into the name column)
    for (const raw of [q.code, q.name]) {
      if (!raw) continue;
      const u = this.byCode.get(raw.trim().toUpperCase());
      if (u && u.level === q.level) {
        return { status: "matched", geoUnitId: u.id, method: "code", candidates: [this.cand(u, 1)] };
      }
    }
    const norm = q.name ? normalizePlaceName(q.name) : "";
    if (!norm) return { status: "unknown", candidates: [] };

    // 2. exact normalised name
    const exact = (this.byName.get(norm) ?? []).filter((u) => this.inScope(u, q));
    const e = this.decide(exact, "exact");
    if (e) return e;

    // 3. alias
    const aliasIds = [...(this.byAlias.get(norm) ?? [])];
    const aliasUnits = aliasIds
      .map((id) => this.byId.get(id))
      .filter((u): u is IndexUnit => !!u && this.inScope(u, q));
    const a = this.decide(aliasUnits, "alias");
    if (a) return a;

    // 4. fuzzy → always a review item (never auto-matched)
    if (!this.fuzzy) return { status: "unknown", candidates: [] };
    const cands = (await this.fuzzy(norm, q.level, q.stateId ?? null))
      .sort((x, y) => y.score - x.score)
      .slice(0, MAX_CANDIDATES);
    if (cands.length > 0 && cands[0].score >= FUZZY_THRESHOLD) {
      return { status: "review", method: "fuzzy", candidates: cands };
    }
    return { status: "unknown", candidates: cands };
  }
}

/** Pure-JS fuzzy provider over an in-memory index (tests, small batches). */
export function memoryFuzzy(units: IndexUnit[], aliases: IndexAlias[] = []): FuzzyProvider {
  const aliasByUnit = new Map<number, string[]>();
  for (const a of aliases) {
    const arr = aliasByUnit.get(a.geoUnitId) ?? [];
    arr.push(normalizePlaceName(a.alias));
    aliasByUnit.set(a.geoUnitId, arr);
  }
  return async (normalized, level, stateId) => {
    const out: MatchCandidate[] = [];
    for (const u of units) {
      if (u.level !== level) continue;
      if (stateId != null && u.level !== "nation" && u.level !== "zone" && u.stateId !== stateId)
        continue;
      const names = [normalizePlaceName(u.name), ...(aliasByUnit.get(u.id) ?? [])];
      const score = Math.max(...names.map((n) => trigramSimilarity(normalized, n)));
      if (score > 0.2) out.push({ geoUnitId: u.id, name: u.name, code: u.code, score });
    }
    return out;
  };
}

/* ── Database-backed index + fuzzy ───────────────────────────────────────── */

/** pg_trgm fuzzy search over geo_units.name and geo_aliases.alias. */
export const pgTrgmFuzzy: FuzzyProvider = async (normalized, level, stateId) => {
  const stateCond =
    stateId != null && level !== "nation" && level !== "zone"
      ? sql`AND g.state_id = ${stateId}`
      : sql``;
  const res = await db.execute(sql`
    SELECT g.id AS "geoUnitId", g.name, g.code,
           GREATEST(similarity(g.name, ${normalized}),
                    COALESCE(MAX(similarity(a.alias, ${normalized})), 0)) AS score
    FROM geo_units g
    LEFT JOIN geo_aliases a ON a.geo_unit_id = g.id
    WHERE g.level = ${level} ${stateCond}
    GROUP BY g.id, g.name, g.code
    HAVING GREATEST(similarity(g.name, ${normalized}),
                    COALESCE(MAX(similarity(a.alias, ${normalized})), 0)) > 0.2
    ORDER BY score DESC
    LIMIT ${MAX_CANDIDATES}
  `);
  return (res.rows as Array<{ geoUnitId: number; name: string; code: string; score: number }>).map(
    (r) => ({ ...r, score: Number(r.score) }),
  );
};

/** Load units of the given levels (+ their aliases) into a matcher. */
export async function loadPlaceMatcher(
  levels: GeoLevel[],
  opts: { fuzzy?: FuzzyProvider | null } = {},
): Promise<PlaceMatcher> {
  const lv = [...new Set<GeoLevel>([...levels, "state"])];
  const units = (await db
    .select({
      id: schema.geoUnits.id,
      code: schema.geoUnits.code,
      name: schema.geoUnits.name,
      level: schema.geoUnits.level,
      stateId: schema.geoUnits.stateId,
    })
    .from(schema.geoUnits)
    .where(inArray(schema.geoUnits.level, lv))) as IndexUnit[];
  const ids = units.map((u) => u.id);
  const aliases: IndexAlias[] = [];
  // chunk to keep parameter lists small (wards can be ~9k units)
  for (let i = 0; i < ids.length; i += 5000) {
    const chunk = ids.slice(i, i + 5000);
    const rows = await db
      .select({ geoUnitId: schema.geoAliases.geoUnitId, alias: schema.geoAliases.alias })
      .from(schema.geoAliases)
      .where(inArray(schema.geoAliases.geoUnitId, chunk));
    aliases.push(...rows);
  }
  return new PlaceMatcher(units, aliases, opts.fuzzy === undefined ? pgTrgmFuzzy : opts.fuzzy);
}

/**
 * Persist a reviewed match as an alias (origin 'upload-review' by default).
 * Idempotent: an existing (unit, normalised) alias is left alone.
 */
export async function confirmAlias(input: {
  geoUnitId: number;
  alias: string;
  actorId: string | null;
  origin?: "upload-review" | "manual" | "seed";
}): Promise<{ inserted: boolean }> {
  const matchKey = normalizePlaceName(input.alias);
  // Stored in the shared contract form (same as seeded aliases / search).
  const normalized = normalizeForAlias(input.alias);
  if (!matchKey || !normalized) return { inserted: false };
  const [unit] = await db
    .select({ id: schema.geoUnits.id, name: schema.geoUnits.name })
    .from(schema.geoUnits)
    .where(eq(schema.geoUnits.id, input.geoUnitId));
  if (!unit) throw new Error(`Unknown place ${input.geoUnitId}`);
  // An alias identical to the unit's own name adds nothing.
  if (normalizePlaceName(unit.name) === matchKey) return { inserted: false };
  const rows = await db
    .insert(schema.geoAliases)
    .values({
      geoUnitId: input.geoUnitId,
      alias: input.alias.trim(),
      normalized,
      origin: input.origin ?? "upload-review",
    })
    .onConflictDoNothing()
    .returning({ id: schema.geoAliases.id });
  if (rows.length > 0) {
    await writeAudit({
      actorId: input.actorId,
      action: "alias.confirm",
      entity: "geo_alias",
      entityId: rows[0].id,
      detail: { geoUnitId: input.geoUnitId, alias: input.alias, origin: input.origin ?? "upload-review" },
    });
  }
  return { inserted: rows.length > 0 };
}

/** Delete an alias (manual cleanup from the alias list). */
export async function deleteAlias(id: number, actorId: string | null): Promise<void> {
  const [row] = await db
    .delete(schema.geoAliases)
    .where(eq(schema.geoAliases.id, id))
    .returning();
  if (row) {
    await writeAudit({
      actorId,
      action: "alias.delete",
      entity: "geo_alias",
      entityId: id,
      detail: { geoUnitId: row.geoUnitId, alias: row.alias },
    });
  }
}
