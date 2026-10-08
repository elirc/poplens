import { z } from "zod";

/**
 * Area-analysis shapes (pure; shared by the client tool, the server action
 * and the PostGIS module; unit-tested). Two shapes:
 *  - circle:  { kind: "circle", center: [lng, lat], radiusKm }  (1–50 km)
 *  - polygon: { kind: "polygon", coordinates: [[lng, lat], …] } (open ring,
 *             3–100 distinct vertices, simple, ≤ 50,000 km²)
 * Shapes are serialised into the URL hash for sharing (no server storage).
 */

export type LngLat = [number, number];

export type AreaShape =
  | { kind: "circle"; center: LngLat; radiusKm: number }
  | { kind: "polygon"; coordinates: LngLat[] };

export const RADIUS_MIN_KM = 1;
export const RADIUS_MAX_KM = 50;
export const MAX_VERTICES = 100;
export const MAX_AREA_SQ_KM = 50_000;
/** Generous box around Nigeria; shapes must lie inside it. */
export const SHAPE_BOUNDS = { west: 2.0, south: 3.5, east: 15.5, north: 14.5 } as const;

const EARTH_RADIUS_KM = 6371.0088;

const lngLat = z.tuple([z.number().finite(), z.number().finite()]);

const shapeInput = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("circle"),
    center: lngLat,
    radiusKm: z.number().finite(),
  }),
  z.object({
    kind: z.literal("polygon"),
    // +1 tolerates a closed ring (first vertex repeated at the end).
    coordinates: z.array(lngLat).min(3).max(MAX_VERTICES + 1),
  }),
]);

export type ShapeValidation = { ok: true; shape: AreaShape } | { ok: false; error: string };

function inBounds([lng, lat]: LngLat): boolean {
  return (
    lng >= SHAPE_BOUNDS.west &&
    lng <= SHAPE_BOUNDS.east &&
    lat >= SHAPE_BOUNDS.south &&
    lat <= SHAPE_BOUNDS.north
  );
}

const round = (v: number, dp = 6) => Math.round(v * 10 ** dp) / 10 ** dp;

/** Drop consecutive duplicate vertices and the closing vertex of a closed ring. */
export function normalizeRing(coords: LngLat[]): LngLat[] {
  const out: LngLat[] = [];
  for (const c of coords) {
    const prev = out[out.length - 1];
    if (prev && prev[0] === c[0] && prev[1] === c[1]) continue;
    out.push([c[0], c[1]]);
  }
  while (out.length > 1) {
    const a = out[0]!;
    const b = out[out.length - 1]!;
    if (a[0] === b[0] && a[1] === b[1]) out.pop();
    else break;
  }
  return out;
}

/**
 * Area of an (open) lng/lat ring in km² on a spherical earth — the same
 * approximation turf/area uses (Chamberlain & Duquette). Sign-agnostic.
 */
export function ringAreaSqKm(ring: LngLat[]): number {
  const n = ring.length;
  if (n < 3) return 0;
  const rad = Math.PI / 180;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const lower = ring[(i + n - 1) % n]!;
    const middle = ring[i]!;
    const upper = ring[(i + 1) % n]!;
    total += (upper[0] - lower[0]) * rad * Math.sin(middle[1] * rad);
  }
  return Math.abs((total * EARTH_RADIUS_KM * EARTH_RADIUS_KM) / 2);
}

function orient(a: LngLat, b: LngLat, c: LngLat): number {
  const v = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  return Math.abs(v) < 1e-14 ? 0 : Math.sign(v);
}

function onSegment(a: LngLat, b: LngLat, p: LngLat): boolean {
  return (
    Math.min(a[0], b[0]) <= p[0] &&
    p[0] <= Math.max(a[0], b[0]) &&
    Math.min(a[1], b[1]) <= p[1] &&
    p[1] <= Math.max(a[1], b[1])
  );
}

/** Do closed segments ab and cd intersect (including touching / collinear overlap)? */
export function segmentsIntersect(a: LngLat, b: LngLat, c: LngLat, d: LngLat): boolean {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(a, b, c)) return true;
  if (o2 === 0 && onSegment(a, b, d)) return true;
  if (o3 === 0 && onSegment(c, d, a)) return true;
  if (o4 === 0 && onSegment(c, d, b)) return true;
  return false;
}

/** True when the open ring's edges cross only at shared consecutive vertices. */
export function isSimpleRing(ring: LngLat[]): boolean {
  const n = ring.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % n]!;
    for (let j = i + 1; j < n; j++) {
      const adjacent = j === i + 1 || (i === 0 && j === n - 1);
      const c = ring[j]!;
      const d = ring[(j + 1) % n]!;
      if (adjacent) {
        // Adjacent edges share one vertex; they must not fold back over each other.
        const shared = j === i + 1 ? b : a;
        const other1 = j === i + 1 ? a : b;
        const other2 = j === i + 1 ? d : c;
        if (orient(other1, shared, other2) === 0) {
          // Collinear: fine only if the edges point away from each other.
          const dx1 = other1[0] - shared[0];
          const dy1 = other1[1] - shared[1];
          const dx2 = other2[0] - shared[0];
          const dy2 = other2[1] - shared[1];
          if (dx1 * dx2 + dy1 * dy2 > 0) return false;
        }
        continue;
      }
      if (segmentsIntersect(a, b, c, d)) return false;
    }
  }
  return true;
}

/** Validate untrusted input (server action / URL hash) into a normalised shape. */
export function validateAreaShape(input: unknown): ShapeValidation {
  const parsed = shapeInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Shape must be a circle or a polygon." };
  const s = parsed.data;
  if (s.kind === "circle") {
    const center: LngLat = [s.center[0], s.center[1]];
    if (!inBounds(center)) return { ok: false, error: "The pin must be inside Nigeria." };
    if (s.radiusKm < RADIUS_MIN_KM || s.radiusKm > RADIUS_MAX_KM) {
      return {
        ok: false,
        error: `Radius must be between ${RADIUS_MIN_KM} and ${RADIUS_MAX_KM} km.`,
      };
    }
    return { ok: true, shape: { kind: "circle", center, radiusKm: s.radiusKm } };
  }
  const ring = normalizeRing(s.coordinates as LngLat[]);
  if (ring.length < 3) return { ok: false, error: "A shape needs at least 3 points." };
  if (ring.length > MAX_VERTICES) {
    return { ok: false, error: `A shape can have at most ${MAX_VERTICES} points.` };
  }
  if (!ring.every(inBounds)) return { ok: false, error: "The shape must be inside Nigeria." };
  if (!isSimpleRing(ring)) return { ok: false, error: "The shape's edges cross each other." };
  const area = ringAreaSqKm(ring);
  if (area < 0.01) return { ok: false, error: "The shape is too small." };
  if (area > MAX_AREA_SQ_KM) {
    return {
      ok: false,
      error: `The shape is too large (${Math.round(area).toLocaleString("en-NG")} km²; limit ${MAX_AREA_SQ_KM.toLocaleString("en-NG")} km²).`,
    };
  }
  return { ok: true, shape: { kind: "polygon", coordinates: ring } };
}

/** Approximate area of a shape in km² (circle: πr²). */
export function shapeAreaSqKm(shape: AreaShape): number {
  return shape.kind === "circle"
    ? Math.PI * shape.radiusKm * shape.radiusKm
    : ringAreaSqKm(shape.coordinates);
}

/** Destination point from a start point, bearing (deg) and distance (km). */
export function destination([lng, lat]: LngLat, bearingDeg: number, km: number): LngLat {
  const rad = Math.PI / 180;
  const φ1 = lat * rad;
  const λ1 = lng * rad;
  const θ = bearingDeg * rad;
  const δ = km / EARTH_RADIUS_KM;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 =
    λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return [λ2 / rad, φ2 / rad];
}

/** Closed ring approximating a geodesic circle (for drawing only). */
export function circleRing(center: LngLat, radiusKm: number, steps = 64): LngLat[] {
  const ring: LngLat[] = [];
  for (let i = 0; i < steps; i++) ring.push(destination(center, (360 * i) / steps, radiusKm));
  ring.push(ring[0]!);
  return ring;
}

/** GeoJSON Polygon for display (closed ring). */
export function shapeToPolygon(shape: AreaShape): GeoJSON.Polygon {
  if (shape.kind === "circle") {
    return { type: "Polygon", coordinates: [circleRing(shape.center, shape.radiusKm)] };
  }
  const ring = shape.coordinates.map((c) => [c[0], c[1]] as LngLat);
  ring.push(ring[0]!);
  return { type: "Polygon", coordinates: [ring] };
}

/** [[w,s],[e,n]] bounds of a shape's display polygon. */
export function shapeBounds(shape: AreaShape): [[number, number], [number, number]] {
  const ring = shapeToPolygon(shape).coordinates[0] as LngLat[];
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const [x, y] of ring) {
    w = Math.min(w, x);
    e = Math.max(e, x);
    s = Math.min(s, y);
    n = Math.max(n, y);
  }
  return [
    [w, s],
    [e, n],
  ];
}

/* ── URL hash codec ───────────────────────────────────────────────────── */

const fmt = (v: number) => String(round(v, 5));

/** "circle=7.49123,9.05785,10" or "poly=7.4,9.0;7.5,9.0;7.5,9.1" (no leading #). */
export function encodeShapeHash(shape: AreaShape): string {
  if (shape.kind === "circle") {
    return `circle=${fmt(shape.center[0])},${fmt(shape.center[1])},${fmt(shape.radiusKm)}`;
  }
  return `poly=${shape.coordinates.map(([x, y]) => `${fmt(x)},${fmt(y)}`).join(";")}`;
}

/** Parse a location hash (with or without "#"); null when absent or invalid. */
export function decodeShapeHash(hash: string): AreaShape | null {
  const h = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!h || h.length > 6000) return null;
  const eq = h.indexOf("=");
  if (eq < 0) return null;
  const key = h.slice(0, eq);
  const body = decodeURIComponent(h.slice(eq + 1));
  const num = (s: string | undefined) => (s != null && s.trim() !== "" ? Number(s) : NaN);
  let candidate: unknown = null;
  if (key === "circle") {
    const [lng, lat, r] = body.split(",");
    candidate = { kind: "circle", center: [num(lng), num(lat)], radiusKm: num(r) };
  } else if (key === "poly") {
    const coords = body
      .split(";")
      .filter(Boolean)
      .map((pair) => {
        const [x, y] = pair.split(",");
        return [num(x), num(y)];
      });
    candidate = { kind: "polygon", coordinates: coords };
  } else {
    return null;
  }
  const v = validateAreaShape(candidate);
  return v.ok ? v.shape : null;
}
