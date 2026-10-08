/**
 * URL state for the analytics pages (pure; client- and server-safe;
 * unit-tested). All view state lives in the query string so every view is
 * shareable. Invalid values fall back to defaults instead of throwing, and
 * list params are de-duplicated and CAPPED here — the UI cap is not the only
 * guard (e.g. /compare never accepts a fifth place from a hand-edited URL).
 *
 *   /compare?places=NG-KN,NG-LA&indicators=u5mr,anc4
 *   /rankings?indicator=u5mr&level=state&year=2018
 *   /trends?indicator=u5mr&places=NG,NG-KN
 *   /relationships?x=female_literacy&y=u5mr&year=2018
 *   /outbreaks?disease=cholera&year=2024&week=12
 */

export const MAX_COMPARE_PLACES = 4;
export const MAX_COMPARE_INDICATORS = 6;
export const MAX_TREND_PLACES = 6;

export const RANKING_LEVELS = ["state", "lga"] as const;
export type RankingLevel = (typeof RANKING_LEVELS)[number];

export const DISEASES = ["cholera", "lassa_fever", "meningitis", "measles"] as const;
export type Disease = (typeof DISEASES)[number];

export const DISEASE_LABEL: Record<Disease, string> = {
  cholera: "Cholera",
  lassa_fever: "Lassa fever",
  meningitis: "Meningitis",
  measles: "Measles",
};

export const DEFAULTS = {
  compare: { places: ["NG-KN", "NG-LA"], indicators: ["u5mr", "anc4"] },
  rankings: { indicator: "u5mr", level: "state" as RankingLevel },
  trends: { indicator: "u5mr", places: ["NG", "NG-KN", "NG-LA"] },
  relationships: { x: "female_literacy", y: "u5mr" },
  outbreaks: { disease: "cholera" as Disease },
} as const;

export type ParamRecord = Record<string, string | string[] | undefined>;
type ParamSource = ParamRecord | { get(name: string): string | null };

const CODE_RE = /^[A-Za-z0-9_.-]{1,64}$/;

function getter(src: ParamSource): (k: string) => string | null {
  if (typeof (src as { get?: unknown }).get === "function") {
    const s = src as { get(name: string): string | null };
    return (k) => s.get(k);
  }
  const rec = src as ParamRecord;
  return (k) => {
    const v = rec[k];
    if (Array.isArray(v)) return v.join(",");
    return v ?? null;
  };
}

/** Valid code or null. */
export function parseCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim();
  return CODE_RE.test(t) ? t : null;
}

/** Comma-separated codes → de-duplicated valid codes, capped at `max`. */
export function parseCodeList(raw: string | null | undefined, max: number): string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const c = parseCode(part);
    if (c && !out.includes(c)) out.push(c);
    if (out.length >= max) break;
  }
  return out;
}

export function parseYear(raw: string | null | undefined): number | null {
  if (!raw || !/^\d{4}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 1900 && n <= 2100 ? n : null;
}

export function parseWeek(raw: string | null | undefined): number | null {
  if (!raw || !/^\d{1,2}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 1 && n <= 53 ? n : null;
}

/* ── per-page state ──────────────────────────────────────────────────── */

export interface CompareState {
  /** Place codes; null when the param is absent (→ defaults). */
  places: string[] | null;
  indicators: string[] | null;
}

export function parseCompare(src: ParamSource): CompareState {
  const get = getter(src);
  const p = get("places");
  const i = get("indicators");
  return {
    places: p == null ? null : parseCodeList(p, MAX_COMPARE_PLACES),
    indicators: i == null ? null : parseCodeList(i, MAX_COMPARE_INDICATORS),
  };
}

export function compareHref(s: { places: string[]; indicators: string[] }): string {
  const q = new URLSearchParams();
  q.set("places", s.places.slice(0, MAX_COMPARE_PLACES).join(","));
  q.set("indicators", s.indicators.slice(0, MAX_COMPARE_INDICATORS).join(","));
  return `/compare?${decodeCommas(q)}`;
}

export interface RankingsState {
  indicator: string | null;
  level: RankingLevel;
  year: number | null;
}

export function parseRankings(src: ParamSource): RankingsState {
  const get = getter(src);
  const l = get("level");
  return {
    indicator: parseCode(get("indicator")),
    level: (RANKING_LEVELS as readonly string[]).includes(l ?? "") ? (l as RankingLevel) : "state",
    year: parseYear(get("year")),
  };
}

export function rankingsHref(s: Partial<RankingsState>): string {
  const q = new URLSearchParams();
  if (s.indicator) q.set("indicator", s.indicator);
  if (s.level && s.level !== "state") q.set("level", s.level);
  if (s.year != null) q.set("year", String(s.year));
  const qs = q.toString();
  return qs ? `/rankings?${qs}` : "/rankings";
}

export interface TrendsState {
  indicator: string | null;
  places: string[] | null;
}

export function parseTrends(src: ParamSource): TrendsState {
  const get = getter(src);
  const p = get("places");
  return {
    indicator: parseCode(get("indicator")),
    places: p == null ? null : parseCodeList(p, MAX_TREND_PLACES),
  };
}

export function trendsHref(s: { indicator: string; places: string[] }): string {
  const q = new URLSearchParams();
  q.set("indicator", s.indicator);
  q.set("places", s.places.slice(0, MAX_TREND_PLACES).join(","));
  return `/trends?${decodeCommas(q)}`;
}

export interface RelationshipsState {
  x: string | null;
  y: string | null;
  year: number | null;
}

export function parseRelationships(src: ParamSource): RelationshipsState {
  const get = getter(src);
  return { x: parseCode(get("x")), y: parseCode(get("y")), year: parseYear(get("year")) };
}

export function relationshipsHref(s: { x: string; y: string; year?: number | null }): string {
  const q = new URLSearchParams();
  q.set("x", s.x);
  q.set("y", s.y);
  if (s.year != null) q.set("year", String(s.year));
  return `/relationships?${q.toString()}`;
}

export interface OutbreaksState {
  disease: Disease;
  year: number | null;
  week: number | null;
}

export function parseOutbreaks(src: ParamSource): OutbreaksState {
  const get = getter(src);
  const d = get("disease");
  return {
    disease: (DISEASES as readonly string[]).includes(d ?? "")
      ? (d as Disease)
      : DEFAULTS.outbreaks.disease,
    year: parseYear(get("year")),
    week: parseWeek(get("week")),
  };
}

export function outbreaksHref(s: Partial<OutbreaksState>): string {
  const q = new URLSearchParams();
  q.set("disease", s.disease ?? DEFAULTS.outbreaks.disease);
  if (s.year != null) q.set("year", String(s.year));
  if (s.week != null) q.set("week", String(s.week));
  return `/outbreaks?${q.toString()}`;
}

/** Keep list params readable: "places=NG-KN,NG-LA" instead of "%2C". */
function decodeCommas(q: URLSearchParams): string {
  return q.toString().replace(/%2C/gi, ",");
}
