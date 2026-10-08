import { geoMercator, geoPath } from "d3-geo";
import type { GeoPermissibleObjects } from "d3-geo";

/**
 * d3-geo → SVG path strings for the PDF mini-maps (pure).
 *
 * Winding gotcha: PostGIS/RFC 7946 GeoJSON may wind exterior rings
 * counter-clockwise, which d3-geo's spherical maths reads as "the whole
 * globe except this polygon" — fitExtent then zooms out to the world. We
 * rewind every polygon so exteriors are clockwise and holes counter-
 * clockwise (d3's convention) before projecting.
 */

type Ring = number[][];
type PolygonCoords = Ring[];

export interface GeoFeatureLike {
  type: "Feature";
  properties?: Record<string, unknown> | null;
  geometry: unknown;
}

/** Planar shoelace area in lon/lat (positive = counter-clockwise). */
export function ringArea(ring: Ring): number {
  let a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % n];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

function rewindPolygon(poly: PolygonCoords): PolygonCoords {
  return poly.map((ring, i) => {
    const ccw = ringArea(ring) > 0;
    // exterior (i=0) must be clockwise; holes counter-clockwise.
    const wantCcw = i > 0;
    return ccw === wantCcw ? ring : [...ring].reverse();
  });
}

/** Return a copy of a (Multi)Polygon geometry wound for d3-geo. Others pass through. */
export function rewindForD3(geometry: unknown): unknown {
  const g = geometry as { type?: string; coordinates?: unknown };
  if (g?.type === "Polygon") {
    return { type: "Polygon", coordinates: rewindPolygon(g.coordinates as PolygonCoords) };
  }
  if (g?.type === "MultiPolygon") {
    return { type: "MultiPolygon", coordinates: (g.coordinates as PolygonCoords[]).map(rewindPolygon) };
  }
  return geometry;
}

export interface ProjectedMap {
  width: number;
  height: number;
  /** One SVG path per input feature, same order; null if it projected to nothing. */
  paths: Array<string | null>;
}

/**
 * Project features with geoMercator fitted to the viewport (with padding).
 * `fitTo` chooses which features define the frame (default: all).
 */
export function projectFeatures(
  features: GeoFeatureLike[],
  width: number,
  height: number,
  opts: { padding?: number; fitTo?: GeoFeatureLike[] } = {},
): ProjectedMap {
  const pad = opts.padding ?? 6;
  const wound = features.map((f) => ({ ...f, geometry: rewindForD3(f.geometry) }));
  const fitSource = (opts.fitTo ?? features).map((f) => ({ ...f, geometry: rewindForD3(f.geometry) }));
  if (wound.length === 0 || fitSource.length === 0) return { width, height, paths: [] };
  const projection = geoMercator().fitExtent(
    [
      [pad, pad],
      [width - pad, height - pad],
    ],
    { type: "FeatureCollection", features: fitSource } as unknown as GeoPermissibleObjects,
  );
  const path = geoPath(projection);
  return {
    width,
    height,
    paths: wound.map((f) => path(f as unknown as GeoPermissibleObjects) || null),
  };
}
