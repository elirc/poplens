/**
 * Facilities page URL state (pure; shared by the server page, the client
 * filter panel and the API routes; unit-tested). Everything the page shows
 * is derived from the query string so filtered views are shareable and the
 * `?lga=NG-KN-GWALE` deep link from place profiles works.
 */

export const CARE_LEVELS = ["primary", "secondary", "tertiary"] as const;
export const OWNERSHIPS = ["public", "private", "faith_based", "ngo", "unknown"] as const;
export type CareLevel = (typeof CARE_LEVELS)[number];
export type Ownership = (typeof OWNERSHIPS)[number];
export type FacilitiesView = "map" | "ppf";

export const CARE_LABELS: Record<CareLevel, string> = {
  primary: "Primary care",
  secondary: "Secondary care",
  tertiary: "Tertiary care",
};

export const OWNERSHIP_LABELS: Record<Ownership, string> = {
  public: "Public",
  private: "Private",
  faith_based: "Faith-based",
  ngo: "NGO",
  unknown: "Unknown",
};

export const FACILITY_PAGE_SIZE = 50;
const MAX_PAGE = 10_000;
const MAX_TYPE_LEN = 120;
const CODE_RE = /^[A-Za-z0-9_.-]{1,64}$/;

export interface FacilityQuery {
  /** State official code (e.g. NG-KN). */
  state: string | null;
  /** LGA official code (e.g. NG-KN-GWALE). */
  lga: string | null;
  care: CareLevel[];
  own: Ownership[];
  type: string | null;
  /** 1-based list page. */
  page: number;
  view: FacilitiesView;
}

export const EMPTY_FACILITY_QUERY: FacilityQuery = {
  state: null,
  lga: null,
  care: [],
  own: [],
  type: null,
  page: 1,
  view: "map",
};

type RawParams =
  | URLSearchParams
  | Record<string, string | string[] | undefined>;

function first(raw: RawParams, key: string): string | null {
  if (raw instanceof URLSearchParams) return raw.get(key);
  const v = raw[key];
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function parseCode(v: string | null): string | null {
  const s = v?.trim();
  return s && CODE_RE.test(s) ? s : null;
}

function parseList<T extends string>(v: string | null, allowed: readonly T[]): T[] {
  if (!v) return [];
  const out = new Set<T>();
  for (const part of v.split(",")) {
    const s = part.trim();
    if ((allowed as readonly string[]).includes(s)) out.add(s as T);
  }
  // Canonical order (the allowed order) keeps URLs and cache keys stable.
  return allowed.filter((a) => out.has(a));
}

/** Lenient parse: unknown/invalid values are dropped, never thrown. */
export function parseFacilityQuery(raw: RawParams): FacilityQuery {
  const typeRaw = first(raw, "type")?.trim() ?? "";
  const pageNum = Number.parseInt(first(raw, "page") ?? "1", 10);
  return {
    state: parseCode(first(raw, "state")),
    lga: parseCode(first(raw, "lga")),
    care: parseList(first(raw, "care"), CARE_LEVELS),
    own: parseList(first(raw, "own"), OWNERSHIPS),
    type: typeRaw && typeRaw.length <= MAX_TYPE_LEN ? typeRaw : null,
    page: Number.isFinite(pageNum) && pageNum >= 1 ? Math.min(pageNum, MAX_PAGE) : 1,
    view: first(raw, "view") === "ppf" ? "ppf" : "map",
  };
}

/** Query string (with leading "?" or empty) for a facility query; defaults omitted. */
export function facilityQueryString(q: Partial<FacilityQuery>): string {
  const p = new URLSearchParams();
  if (q.view === "ppf") p.set("view", "ppf");
  if (q.state) p.set("state", q.state);
  if (q.lga) p.set("lga", q.lga);
  if (q.care?.length) p.set("care", CARE_LEVELS.filter((c) => q.care!.includes(c)).join(","));
  if (q.own?.length) p.set("own", OWNERSHIPS.filter((o) => q.own!.includes(o)).join(","));
  if (q.type) p.set("type", q.type);
  if (q.page && q.page > 1) p.set("page", String(q.page));
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function facilitiesHref(q: Partial<FacilityQuery>): string {
  return `/facilities${facilityQueryString(q)}`;
}

/** Map-data URL (filters only — no page/view) for /api/facilities. */
export function facilitiesGeoUrl(q: Partial<FacilityQuery>): string {
  const s = facilityQueryString({ state: q.state, lga: q.lga, care: q.care, own: q.own, type: q.type });
  return `/api/facilities${s}`;
}

/** Number of pages for a total (at least 1). */
export function pageCount(total: number, pageSize = FACILITY_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** "1,234 m" under 1 km, else "12.3 km" (one decimal under 100 km). */
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return "—";
  if (meters < 1000) return `${Math.round(meters).toLocaleString("en-NG")} m`;
  const km = meters / 1000;
  return km < 100 ? `${km.toFixed(1)} km` : `${Math.round(km).toLocaleString("en-NG")} km`;
}

/* ── Nearest-facility request parsing ─────────────────────────────────── */

/** Generous box around Nigeria; points outside are rejected. */
export const SEARCH_BOUNDS = { west: 2.0, south: 3.5, east: 15.5, north: 14.5 } as const;
export const NEAREST_DEFAULT = 10;
export const NEAREST_MAX = 25;

export type NearestParse =
  | { ok: true; lng: number; lat: number; n: number }
  | { ok: false; message: string };

export function parseNearestParams(sp: URLSearchParams): NearestParse {
  const lngRaw = sp.get("lng");
  const latRaw = sp.get("lat");
  if (lngRaw == null || latRaw == null || lngRaw.trim() === "" || latRaw.trim() === "") {
    return { ok: false, message: "lng and lat are required" };
  }
  const lng = Number(lngRaw);
  const lat = Number(latRaw);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return { ok: false, message: "lng and lat must be numbers" };
  }
  if (
    lng < SEARCH_BOUNDS.west ||
    lng > SEARCH_BOUNDS.east ||
    lat < SEARCH_BOUNDS.south ||
    lat > SEARCH_BOUNDS.north
  ) {
    return { ok: false, message: "point is outside Nigeria" };
  }
  const nRaw = sp.get("n");
  let n = NEAREST_DEFAULT;
  if (nRaw != null && nRaw !== "") {
    const parsed = Number(nRaw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > NEAREST_MAX) {
      return { ok: false, message: `n must be an integer from 1 to ${NEAREST_MAX}` };
    }
    n = parsed;
  }
  return { ok: true, lng, lat, n };
}
