/**
 * Story chart shortcodes (pure; unit-tested). Contract (src/db/schema/content.ts):
 *
 *   {{chart type="trend|bar|top5" indicator="<code>" places="NG,NG-KN" year="2018"}}
 *
 * Optional extras: level="state|lga" (top5 only) and title="…".
 * A shortcode that cannot be parsed or validated never throws: callers get
 * { ok: false, message } and render a visible error box instead of a chart.
 * The same validation backs the /embed/chart query parameters.
 */

import {
  CHART_LEVELS,
  CHART_TYPES,
  type ChartLevel,
  type ChartSpec,
  type ChartType,
} from "@/components/content/types";

export type ParseResult<T> = { ok: true; value: T } | { ok: false; message: string };

export const MAX_CHART_PLACES = 6;
const ALLOWED_ATTRS = new Set(["type", "indicator", "places", "year", "level", "title"]);
const INDICATOR_RE = /^[A-Za-z0-9_.-]{1,64}$/;
const PLACE_RE = /^[A-Za-z0-9-]{2,40}$/;

/** True when a (trimmed) line is a block-level shortcode: `{{ … }}`. */
export function isShortcodeLine(line: string): boolean {
  const t = line.trim();
  return t.startsWith("{{") && t.endsWith("}}");
}

/**
 * Parse `key="value"` pairs (double or single quotes, or bare tokens).
 * Returns null on malformed input (e.g. an unterminated quote).
 */
export function parseAttributes(s: string): Record<string, string> | null {
  const out: Record<string, string> = {};
  let i = 0;
  const n = s.length;
  while (i < n) {
    while (i < n && /\s/.test(s[i]!)) i++;
    if (i >= n) break;
    const keyMatch = /^[A-Za-z_][A-Za-z0-9_-]*/.exec(s.slice(i));
    if (!keyMatch) return null;
    const key = keyMatch[0].toLowerCase();
    i += keyMatch[0].length;
    while (i < n && /\s/.test(s[i]!)) i++;
    if (s[i] !== "=") return null;
    i++;
    while (i < n && /\s/.test(s[i]!)) i++;
    let value: string;
    const q = s[i];
    // Accept straight and typographic quotes (editors paste from word processors).
    const closers: Record<string, string> = { '"': '"', "'": "'", "“": "”", "‘": "’" };
    if (q && closers[q]) {
      const end = s.indexOf(closers[q]!, i + 1);
      if (end < 0) return null;
      value = s.slice(i + 1, end);
      i = end + 1;
    } else {
      const m = /^[^\s"']+/.exec(s.slice(i));
      if (!m) return null;
      value = m[0];
      i += m[0].length;
    }
    if (key in out) return null;
    out[key] = value;
  }
  return out;
}

/**
 * Validate a flat attribute record into a ChartSpec. Shared by shortcodes and
 * the /embed/chart query string (same names, same rules).
 */
export function chartSpecFromRecord(
  attrs: Record<string, string | undefined>,
  opts: { strictAttributes?: boolean } = {},
): ParseResult<ChartSpec> {
  if (opts.strictAttributes) {
    const unknown = Object.keys(attrs).filter((k) => !ALLOWED_ATTRS.has(k));
    if (unknown.length > 0) {
      return { ok: false, message: `Unknown attribute ${unknown.map((u) => `"${u}"`).join(", ")}` };
    }
  }
  const type = (attrs.type ?? "").trim().toLowerCase();
  if (!type) return { ok: false, message: 'Missing type — use type="trend", "bar" or "top5"' };
  if (!(CHART_TYPES as readonly string[]).includes(type)) {
    return { ok: false, message: `Unknown chart type "${type}" — use trend, bar or top5` };
  }
  const indicator = (attrs.indicator ?? "").trim();
  if (!indicator) return { ok: false, message: "Missing indicator code" };
  if (!INDICATOR_RE.test(indicator)) {
    return { ok: false, message: `Invalid indicator code "${indicator}"` };
  }

  const places = (attrs.places ?? "")
    .split(",")
    .map((p) => p.trim().toUpperCase())
    .filter(Boolean);
  const badPlace = places.find((p) => !PLACE_RE.test(p));
  if (badPlace) return { ok: false, message: `Invalid place code "${badPlace}"` };
  const uniquePlaces = [...new Set(places)];
  if (uniquePlaces.length > MAX_CHART_PLACES) {
    return { ok: false, message: `At most ${MAX_CHART_PLACES} places per chart` };
  }

  let year: number | null = null;
  if (attrs.year != null && attrs.year.trim() !== "") {
    const y = Number(attrs.year.trim());
    if (!Number.isInteger(y) || y < 1900 || y > 2100) {
      return { ok: false, message: `Invalid year "${attrs.year}"` };
    }
    year = y;
  }

  let level: ChartLevel = "state";
  if (attrs.level != null && attrs.level.trim() !== "") {
    const l = attrs.level.trim().toLowerCase();
    if (!(CHART_LEVELS as readonly string[]).includes(l)) {
      return { ok: false, message: `Invalid level "${attrs.level}" — use state or lga` };
    }
    if (type !== "top5") return { ok: false, message: "level only applies to top5 charts" };
    level = l as ChartLevel;
  }

  if ((type === "trend" || type === "bar") && uniquePlaces.length === 0) {
    return { ok: false, message: `A ${type} chart needs places="…" (comma-separated place codes)` };
  }
  if (type === "top5" && uniquePlaces.length > 0) {
    return { ok: false, message: "top5 ranks every place of a level — remove places" };
  }

  const title = attrs.title?.trim() ? attrs.title.trim().slice(0, 140) : null;
  return {
    ok: true,
    value: { type: type as ChartType, indicator, places: uniquePlaces, year, level, title },
  };
}

/** Parse one full shortcode string, e.g. `{{chart type="bar" …}}`. */
export function parseShortcode(raw: string): ParseResult<ChartSpec> {
  const t = raw.trim();
  if (!t.startsWith("{{") || !t.endsWith("}}")) {
    return { ok: false, message: "Shortcodes must be written as {{chart …}}" };
  }
  const inner = t.slice(2, -2).trim();
  const nameMatch = /^([A-Za-z][A-Za-z0-9_-]*)/.exec(inner);
  if (!nameMatch) return { ok: false, message: "Empty shortcode" };
  const name = nameMatch[1]!.toLowerCase();
  if (name !== "chart") {
    return { ok: false, message: `Unknown shortcode "${nameMatch[1]}" — only {{chart …}} is supported` };
  }
  const attrs = parseAttributes(inner.slice(nameMatch[0].length));
  if (!attrs) return { ok: false, message: 'Malformed attributes — write them as key="value"' };
  return chartSpecFromRecord(attrs, { strictAttributes: true });
}
