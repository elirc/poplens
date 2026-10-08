/**
 * PLACEHOLDER geometry, used only when real boundaries cannot be downloaded
 * (boundaryVersion 'placeholder-v1'). Pure, deterministic, dependency-free:
 *   1. States: Voronoi cells around rough state centroids, clipped to
 *      Nigeria's bounding box (half-plane intersection → convex cells).
 *   2. LGAs: each state cell is sliced into horizontal strips, each strip into
 *      vertical pieces — exactly one non-empty convex piece per LGA.
 *   3. Wards: the same slicing applied to each LGA piece.
 * Shapes are obviously schematic; they exist so the map, tiles and area
 * analysis work end-to-end. Real GRID3 shapes: see docs/DATA-LOADING.md.
 */

export type Pt = [number, number]; // [lng, lat]
/** Open ring (first point is NOT repeated at the end). */
export type Ring = Pt[];

export interface BBox {
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
}

export function bboxRing(b: BBox): Ring {
  return [
    [b.minLng, b.minLat],
    [b.maxLng, b.minLat],
    [b.maxLng, b.maxLat],
    [b.minLng, b.maxLat],
  ];
}

export function ringBBox(r: Ring): BBox {
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const [x, y] of r) {
    if (x < minLng) minLng = x;
    if (x > maxLng) maxLng = x;
    if (y < minLat) minLat = y;
    if (y > maxLat) maxLat = y;
  }
  return { minLng, maxLng, minLat, maxLat };
}

/** Signed area (shoelace); positive for counter-clockwise rings. */
export function ringArea(r: Ring): number {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const [x1, y1] = r[i];
    const [x2, y2] = r[(i + 1) % r.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

/** Area-weighted centroid; always inside a convex ring. */
export function ringCentroid(r: Ring): Pt {
  const a = ringArea(r);
  if (Math.abs(a) < 1e-15) {
    const n = r.length;
    return [r.reduce((s, p) => s + p[0], 0) / n, r.reduce((s, p) => s + p[1], 0) / n];
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < r.length; i++) {
    const [x1, y1] = r[i];
    const [x2, y2] = r[(i + 1) % r.length];
    const f = x1 * y2 - x2 * y1;
    cx += (x1 + x2) * f;
    cy += (y1 + y2) * f;
  }
  return [cx / (6 * a), cy / (6 * a)];
}

/**
 * Sutherland–Hodgman clip of a ring against the half-plane a·x + b·y ≤ c.
 */
export function clipHalfPlane(r: Ring, a: number, b: number, c: number): Ring {
  const out: Ring = [];
  const inside = (p: Pt) => a * p[0] + b * p[1] <= c + 1e-12;
  const intersect = (p: Pt, q: Pt): Pt => {
    const fp = a * p[0] + b * p[1] - c;
    const fq = a * q[0] + b * q[1] - c;
    const t = fp / (fp - fq);
    return [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])];
  };
  for (let i = 0; i < r.length; i++) {
    const cur = r[i];
    const prev = r[(i + r.length - 1) % r.length];
    const curIn = inside(cur);
    const prevIn = inside(prev);
    if (curIn) {
      if (!prevIn) out.push(intersect(prev, cur));
      out.push(cur);
    } else if (prevIn) {
      out.push(intersect(prev, cur));
    }
  }
  return out;
}

/** Voronoi cell of each site, clipped to the bbox (convex rings, CCW). */
export function voronoiCells(sites: Pt[], bbox: BBox): Ring[] {
  return sites.map((p, i) => {
    let cell = bboxRing(bbox);
    for (let j = 0; j < sites.length && cell.length >= 3; j++) {
      if (j === i) continue;
      const q = sites[j];
      // Points closer to p than q: (q − p)·x ≤ (|q|² − |p|²) / 2
      const a = q[0] - p[0];
      const b = q[1] - p[1];
      const c = (q[0] * q[0] + q[1] * q[1] - p[0] * p[0] - p[1] * p[1]) / 2;
      cell = clipHalfPlane(cell, a, b, c);
    }
    return cell;
  });
}

/** Clip a ring to lng ∈ [x0, x1] and lat ∈ [y0, y1]. */
function clipBox(r: Ring, x0: number, x1: number, y0: number, y1: number): Ring {
  let out = clipHalfPlane(r, 1, 0, x1);
  out = clipHalfPlane(out, -1, 0, -x0);
  out = clipHalfPlane(out, 0, 1, y1);
  out = clipHalfPlane(out, 0, -1, -y0);
  return out;
}

/**
 * Split a CONVEX ring into exactly `n` non-empty convex pieces: `rows`
 * horizontal strips (each spanning the ring's full latitude range share),
 * each cut into vertical slices across that strip's own longitude range.
 * Pieces are returned row by row, south → north, west → east.
 */
export function sliceConvex(r: Ring, n: number): Ring[] {
  if (n <= 0) return [];
  if (n === 1) return [r];
  const bb = ringBBox(r);
  const w = Math.max(bb.maxLng - bb.minLng, 1e-9);
  const h = Math.max(bb.maxLat - bb.minLat, 1e-9);
  let cols = Math.max(1, Math.round(Math.sqrt((n * w) / h)));
  cols = Math.min(cols, n);
  const rows = Math.ceil(n / cols);
  const perRow = Array.from({ length: rows }, (_, i) =>
    Math.floor(n / rows) + (i < n % rows ? 1 : 0),
  );
  const pieces: Ring[] = [];
  for (let ri = 0; ri < rows; ri++) {
    const y0 = bb.minLat + (h * ri) / rows;
    const y1 = bb.minLat + (h * (ri + 1)) / rows;
    const strip = clipBox(r, bb.minLng - 1, bb.maxLng + 1, y0, y1);
    const sb = ringBBox(strip);
    const sw = sb.maxLng - sb.minLng;
    const k = perRow[ri];
    for (let ci = 0; ci < k; ci++) {
      const x0 = sb.minLng + (sw * ci) / k;
      const x1 = sb.minLng + (sw * (ci + 1)) / k;
      pieces.push(clipBox(strip, x0, x1, y0 - 1, y1 + 1));
    }
  }
  return pieces;
}

/** Closed GeoJSON MultiPolygon for one ring. */
export function ringToMultiPolygon(r: Ring): {
  type: "MultiPolygon";
  coordinates: number[][][][];
} {
  const ring = ringArea(r) < 0 ? [...r].reverse() : r;
  const closed = [...ring, ring[0]].map(([x, y]) => [
    Math.round(x * 1e6) / 1e6,
    Math.round(y * 1e6) / 1e6,
  ]);
  return { type: "MultiPolygon", coordinates: [[closed]] };
}

export interface PlaceholderInput {
  bbox: BBox;
  states: Array<{
    code: string;
    centroid: Pt;
    lgas: Array<{ code: string; wards: Array<{ code: string }> }>;
  }>;
}

export interface PlaceholderOutput {
  nation: Ring;
  states: Map<string, Ring>;
  lgas: Map<string, Ring>;
  wards: Map<string, Ring>;
}

export function buildPlaceholderGeometry(input: PlaceholderInput): PlaceholderOutput {
  const cells = voronoiCells(
    input.states.map((s) => s.centroid),
    input.bbox,
  );
  const states = new Map<string, Ring>();
  const lgas = new Map<string, Ring>();
  const wards = new Map<string, Ring>();
  input.states.forEach((s, i) => {
    const cell = cells[i];
    states.set(s.code, cell);
    const lgaPieces = sliceConvex(cell, s.lgas.length);
    s.lgas.forEach((l, li) => {
      const lp = lgaPieces[li];
      lgas.set(l.code, lp);
      const wardPieces = sliceConvex(lp, l.wards.length);
      l.wards.forEach((w, wi) => wards.set(w.code, wardPieces[wi]));
    });
  });
  return { nation: bboxRing(input.bbox), states, lgas, wards };
}
