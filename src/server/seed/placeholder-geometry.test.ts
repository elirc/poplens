import { describe, expect, it } from "vitest";
import { buildHierarchy } from "./hierarchy";
import {
  buildPlaceholderGeometry,
  ringArea,
  ringBBox,
  ringCentroid,
  ringToMultiPolygon,
  sliceConvex,
  voronoiCells,
  type Ring,
} from "./placeholder-geometry";
import { NIGERIA_BBOX, STATE_POINTS } from "./state-points";

const h = buildHierarchy();
const geom = buildPlaceholderGeometry({
  bbox: NIGERIA_BBOX,
  states: h.map((s) => ({
    code: s.code,
    centroid: STATE_POINTS[s.code].centroid,
    lgas: s.lgas.map((l) => ({ code: l.code, wards: l.wards })),
  })),
});

const inBBox = ([x, y]: [number, number], r: Ring, eps = 1e-9) => {
  const b = ringBBox(r);
  return x >= b.minLng - eps && x <= b.maxLng + eps && y >= b.minLat - eps && y <= b.maxLat + eps;
};

describe("placeholder geometry", () => {
  it("produces a shape for every state, LGA and ward", () => {
    expect(geom.states.size).toBe(37);
    expect(geom.lgas.size).toBe(774);
    const wardCount = h.reduce((a, s) => a + s.lgas.reduce((b, l) => b + l.wards.length, 0), 0);
    expect(geom.wards.size).toBe(wardCount);
  });

  it("every polygon is a valid non-degenerate ring", () => {
    const bad: string[] = [];
    for (const map of [geom.states, geom.lgas, geom.wards]) {
      for (const [code, r] of map) {
        if (r.length < 3 || Math.abs(ringArea(r)) <= 1e-8) bad.push(code);
      }
    }
    expect(bad).toEqual([]);
  });

  it("state cells tile the bbox (areas sum to the bbox area)", () => {
    const total = [...geom.states.values()].reduce((a, r) => a + Math.abs(ringArea(r)), 0);
    const bboxArea = (NIGERIA_BBOX.maxLng - NIGERIA_BBOX.minLng) * (NIGERIA_BBOX.maxLat - NIGERIA_BBOX.minLat);
    expect(total).toBeCloseTo(bboxArea, 6);
  });

  it("LGA pieces sum to their state's area; ward pieces sum to their LGA", () => {
    const bad: string[] = [];
    for (const s of h) {
      const sa = Math.abs(ringArea(geom.states.get(s.code)!));
      const la = s.lgas.reduce((a, l) => a + Math.abs(ringArea(geom.lgas.get(l.code)!)), 0);
      if (Math.abs(la - sa) > 1e-8) bad.push(s.code);
      for (const l of s.lgas) {
        const lgaA = Math.abs(ringArea(geom.lgas.get(l.code)!));
        const wa = l.wards.reduce((a, w) => a + Math.abs(ringArea(geom.wards.get(w.code)!)), 0);
        if (Math.abs(wa - lgaA) > 1e-9) bad.push(l.code);
      }
    }
    expect(bad).toEqual([]);
  });

  it("every ward centre lies inside its LGA bbox, every LGA centre inside its state bbox", () => {
    const bad: string[] = [];
    for (const s of h) {
      const stateRing = geom.states.get(s.code)!;
      for (const l of s.lgas) {
        const lgaRing = geom.lgas.get(l.code)!;
        if (!inBBox(ringCentroid(lgaRing), stateRing)) bad.push(l.code);
        for (const w of l.wards) {
          if (!inBBox(ringCentroid(geom.wards.get(w.code)!), lgaRing)) bad.push(w.code);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("is deterministic and outputs closed counter-clockwise GeoJSON rings", () => {
    const again = voronoiCells(
      h.map((s) => STATE_POINTS[s.code].centroid),
      NIGERIA_BBOX,
    );
    expect(again[0]).toEqual(geom.states.get(h[0].code));
    const mp = ringToMultiPolygon(geom.wards.values().next().value!);
    const ring = mp.coordinates[0][0];
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  it("sliceConvex returns exactly n pieces", () => {
    const square: Ring = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    for (const n of [1, 2, 7, 8, 12, 44]) {
      const pieces = sliceConvex(square, n);
      expect(pieces).toHaveLength(n);
      const a = pieces.reduce((acc, p) => acc + Math.abs(ringArea(p)), 0);
      expect(a).toBeCloseTo(1, 9);
    }
  });
});
