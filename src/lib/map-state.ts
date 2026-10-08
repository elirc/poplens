/**
 * Map-explorer state <-> URL query params (pure; unit-tested).
 *
 * The whole explorer state lives in the URL so views can be shared, saved
 * (saved_views stores the query string) and deep-linked from other pages.
 *
 * URL keys (stable contract, other features deep-link with these):
 *   i  indicator code                e.g. i=u5mr
 *   y  year (integer)                e.g. y=2018   (omitted → latest available)
 *   l  level: state | lga | ward     (default state)
 *   p  parent state code (lga level only) e.g. p=NG-KN
 *   m  class-break method: quantile | equal | jenks (default quantile)
 *   k  number of classes 3–7         (default 5)
 *   f  facility layer on: 1          (default off)
 *   v  view: map | table             (default map)
 *   c  camera "lng,lat,zoom"         e.g. c=8.68,9.08,5.2 (omitted → fit Nigeria)
 *
 * Defaults are omitted when serialising so URLs stay short. Unknown or
 * invalid values fall back to defaults instead of throwing.
 *
 * Example deep link: /explore?i=u5mr&y=2018&l=state
 */

import type { BreakMethod } from "@/lib/class-breaks";

export const MAP_LEVELS = ["state", "lga", "ward"] as const;
export type MapLevel = (typeof MAP_LEVELS)[number];

export const BREAK_METHODS: readonly BreakMethod[] = ["quantile", "equal", "jenks"];
export const MIN_CLASSES = 3;
export const MAX_CLASSES = 7;

export interface MapCamera {
  lng: number;
  lat: number;
  zoom: number;
}

export interface MapState {
  indicator: string | null;
  year: number | null;
  level: MapLevel;
  parent: string | null;
  method: BreakMethod;
  classes: number;
  facilities: boolean;
  view: "map" | "table";
  camera: MapCamera | null;
}

export const DEFAULT_MAP_STATE: MapState = {
  indicator: null,
  year: null,
  level: "state",
  parent: null,
  method: "quantile",
  classes: 5,
  facilities: false,
  view: "map",
  camera: null,
};

/** Exact URL param keys — import these instead of hard-coding strings. */
export const MAP_PARAM = {
  indicator: "i",
  year: "y",
  level: "l",
  parent: "p",
  method: "m",
  classes: "k",
  facilities: "f",
  view: "v",
  camera: "c",
} as const;

type ParamSource =
  | URLSearchParams
  | { get(name: string): string | null }
  | Record<string, string | string[] | undefined>;

function getter(src: ParamSource): (k: string) => string | null {
  if (typeof (src as URLSearchParams).get === "function") {
    const s = src as { get(name: string): string | null };
    return (k) => s.get(k);
  }
  const rec = src as Record<string, string | string[] | undefined>;
  return (k) => {
    const v = rec[k];
    if (Array.isArray(v)) return v[0] ?? null;
    return v ?? null;
  };
}

const CODE_RE = /^[A-Za-z0-9_.-]{1,64}$/;

/** Parse URL params (URLSearchParams, ReadonlyURLSearchParams or a Next searchParams record). */
export function parseMapState(src: ParamSource): MapState {
  const get = getter(src);
  const out: MapState = { ...DEFAULT_MAP_STATE };

  const ind = get(MAP_PARAM.indicator);
  if (ind && CODE_RE.test(ind)) out.indicator = ind;

  const y = get(MAP_PARAM.year);
  if (y && /^\d{4}$/.test(y)) {
    const n = Number(y);
    if (n >= 1900 && n <= 2100) out.year = n;
  }

  const l = get(MAP_PARAM.level);
  if (l && (MAP_LEVELS as readonly string[]).includes(l)) out.level = l as MapLevel;

  const p = get(MAP_PARAM.parent);
  if (p && CODE_RE.test(p) && out.level === "lga") out.parent = p;

  const m = get(MAP_PARAM.method);
  if (m && (BREAK_METHODS as readonly string[]).includes(m)) out.method = m as BreakMethod;

  const k = get(MAP_PARAM.classes);
  if (k && /^\d$/.test(k)) {
    const n = Number(k);
    if (n >= MIN_CLASSES && n <= MAX_CLASSES) out.classes = n;
  }

  const f = get(MAP_PARAM.facilities);
  out.facilities = f === "1" || f === "true";

  const v = get(MAP_PARAM.view);
  if (v === "table") out.view = "table";

  const c = get(MAP_PARAM.camera);
  if (c) out.camera = parseCamera(c);

  return out;
}

export function parseCamera(raw: string): MapCamera | null {
  const parts = raw.split(",");
  if (parts.length !== 3) return null;
  const [lng, lat, zoom] = parts.map((s) => Number(s));
  if (![lng, lat, zoom].every(Number.isFinite)) return null;
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90 || zoom < 0 || zoom > 22) {
    return null;
  }
  return { lng, lat, zoom };
}

export function formatCamera(c: MapCamera): string {
  return `${round(c.lng, 4)},${round(c.lat, 4)},${round(c.zoom, 2)}`;
}

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/** Serialise to URLSearchParams, omitting defaults. Key order is stable. */
export function serializeMapState(state: Partial<MapState>): URLSearchParams {
  const s: MapState = { ...DEFAULT_MAP_STATE, ...state };
  const q = new URLSearchParams();
  if (s.indicator) q.set(MAP_PARAM.indicator, s.indicator);
  if (s.year != null) q.set(MAP_PARAM.year, String(s.year));
  if (s.level !== DEFAULT_MAP_STATE.level) q.set(MAP_PARAM.level, s.level);
  if (s.parent && s.level === "lga") q.set(MAP_PARAM.parent, s.parent);
  if (s.method !== DEFAULT_MAP_STATE.method) q.set(MAP_PARAM.method, s.method);
  if (s.classes !== DEFAULT_MAP_STATE.classes) q.set(MAP_PARAM.classes, String(s.classes));
  if (s.facilities) q.set(MAP_PARAM.facilities, "1");
  if (s.view !== DEFAULT_MAP_STATE.view) q.set(MAP_PARAM.view, s.view);
  if (s.camera) q.set(MAP_PARAM.camera, formatCamera(s.camera));
  return q;
}

/** Build an /explore href for deep links, e.g. exploreHref({ indicator: "u5mr", year: 2018 }). */
export function exploreHref(state: Partial<MapState> = {}): string {
  const q = serializeMapState(state).toString();
  return q ? `/explore?${q}` : "/explore";
}
