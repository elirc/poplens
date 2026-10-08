import { describe, expect, it } from "vitest";
import {
  circleRing,
  decodeShapeHash,
  destination,
  encodeShapeHash,
  isSimpleRing,
  normalizeRing,
  ringAreaSqKm,
  shapeAreaSqKm,
  validateAreaShape,
  type LngLat,
} from "@/app/(public)/area/_lib/shape";
import {
  peoplePerFacility,
  quotaMessage,
  quotaState,
  summariseFacilities,
} from "./summary";

const square = (lng: number, lat: number, d: number): LngLat[] => [
  [lng, lat],
  [lng + d, lat],
  [lng + d, lat + d],
  [lng, lat + d],
];

describe("validateAreaShape — circle", () => {
  it("accepts 1–50 km inside Nigeria", () => {
    expect(validateAreaShape({ kind: "circle", center: [8.52, 12], radiusKm: 1 }).ok).toBe(true);
    expect(validateAreaShape({ kind: "circle", center: [8.52, 12], radiusKm: 50 }).ok).toBe(true);
  });
  it("rejects radius out of bounds, outside Nigeria, and junk", () => {
    expect(validateAreaShape({ kind: "circle", center: [8.52, 12], radiusKm: 0.5 }).ok).toBe(false);
    expect(validateAreaShape({ kind: "circle", center: [8.52, 12], radiusKm: 51 }).ok).toBe(false);
    expect(validateAreaShape({ kind: "circle", center: [-0.1, 51.5], radiusKm: 5 }).ok).toBe(false);
    expect(validateAreaShape({ kind: "circle", center: [Number.NaN, 12], radiusKm: 5 }).ok).toBe(false);
    expect(validateAreaShape({ kind: "hexagon" }).ok).toBe(false);
    expect(validateAreaShape(null).ok).toBe(false);
  });
});

describe("validateAreaShape — polygon", () => {
  it("accepts a simple square and normalises a closed ring", () => {
    const ring = square(8.4, 11.9, 0.2);
    const v = validateAreaShape({ kind: "polygon", coordinates: [...ring, ring[0]] });
    expect(v.ok).toBe(true);
    if (v.ok && v.shape.kind === "polygon") expect(v.shape.coordinates).toHaveLength(4);
  });
  it("rejects too few / too many vertices", () => {
    expect(validateAreaShape({ kind: "polygon", coordinates: [[8, 12], [8.1, 12]] }).ok).toBe(false);
    const many: LngLat[] = circleRing([8.5, 12], 5, 101).slice(0, 101);
    expect(many).toHaveLength(101);
    expect(validateAreaShape({ kind: "polygon", coordinates: many }).ok).toBe(false);
    const hundred = circleRing([8.5, 12], 5, 100).slice(0, 100);
    expect(validateAreaShape({ kind: "polygon", coordinates: hundred }).ok).toBe(true);
  });
  it("rejects self-intersecting (bow-tie) shapes", () => {
    const bowtie: LngLat[] = [
      [8.4, 11.9],
      [8.6, 12.1],
      [8.6, 11.9],
      [8.4, 12.1],
    ];
    expect(isSimpleRing(bowtie)).toBe(false);
    expect(validateAreaShape({ kind: "polygon", coordinates: bowtie }).ok).toBe(false);
  });
  it("rejects shapes over 50,000 km²", () => {
    // ~3° × 3° near 10°N is ~108,000 km².
    const v = validateAreaShape({ kind: "polygon", coordinates: square(6, 8, 3) });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toMatch(/too large/);
  });
});

describe("geometry helpers", () => {
  it("ringAreaSqKm matches PostGIS ST_Area(geography) within 1%", () => {
    // PostGIS (spheroid) gives 722.82 km² for this 0.3° × 0.2° box at 12°N.
    const a = ringAreaSqKm([
      [8.4, 11.9],
      [8.7, 11.9],
      [8.7, 12.1],
      [8.4, 12.1],
    ]);
    expect(Math.abs(a - 722.82) / 722.82).toBeLessThan(0.01);
  });
  it("circle ring area approximates πr²", () => {
    const ring = circleRing([8.5, 12], 10).slice(0, -1);
    // Inscribed 64-gon: ~0.16% below the true circle.
    expect(Math.abs(ringAreaSqKm(ring) - Math.PI * 100) / (Math.PI * 100)).toBeLessThan(0.005);
    expect(shapeAreaSqKm({ kind: "circle", center: [8.5, 12], radiusKm: 10 })).toBeCloseTo(314.16, 1);
  });
  it("destination moves the right distance north", () => {
    const [, lat] = destination([8.5, 12], 0, 111.195);
    expect(lat).toBeCloseTo(13, 3);
  });
  it("normalizeRing drops duplicate and closing vertices", () => {
    expect(normalizeRing([[1, 1], [1, 1], [2, 1], [2, 2], [1, 1]])).toEqual([[1, 1], [2, 1], [2, 2]]);
  });
  it("isSimpleRing rejects a fold-back spike", () => {
    expect(isSimpleRing([[0, 0], [2, 0], [1, 0], [1, 1]])).toBe(false);
  });
});

describe("URL hash codec", () => {
  it("round-trips a circle and a polygon", () => {
    const c = { kind: "circle" as const, center: [8.52123, 12.00011] as LngLat, radiusKm: 12 };
    expect(encodeShapeHash(c)).toBe("circle=8.52123,12.00011,12");
    expect(decodeShapeHash(`#${encodeShapeHash(c)}`)).toEqual(c);
    const p = { kind: "polygon" as const, coordinates: square(8.4, 11.9, 0.2) };
    expect(decodeShapeHash(encodeShapeHash(p))).toEqual(p);
  });
  it("returns null for absent, unknown or invalid hashes", () => {
    expect(decodeShapeHash("")).toBeNull();
    expect(decodeShapeHash("#foo=1")).toBeNull();
    expect(decodeShapeHash("#circle=8.5,12,999")).toBeNull();
    expect(decodeShapeHash("#circle=8.5,,5")).toBeNull();
    expect(decodeShapeHash("#poly=8,12;8.1,12")).toBeNull();
  });
});

describe("result summaries", () => {
  it("groups facilities by type and care level", () => {
    const s = summariseFacilities([
      { type: "Clinic", careLevel: "primary", count: 2 },
      { type: "General Hospital", careLevel: "secondary", count: 3 },
      { type: "Clinic", careLevel: "secondary", count: 1 },
    ]);
    expect(s.total).toBe(6);
    expect(s.byType).toEqual([
      { type: "Clinic", count: 3 },
      { type: "General Hospital", count: 3 },
    ]);
    expect(s.byCareLevel).toEqual({ primary: 2, secondary: 4, tertiary: 0 });
  });
  it("people per facility is null (No data), never 0 or Infinity, when undefined", () => {
    expect(peoplePerFacility(1000, 4)).toBe(250);
    expect(peoplePerFacility(1000, 0)).toBeNull();
    expect(peoplePerFacility(null, 3)).toBeNull();
  });
  it("quota messages", () => {
    expect(quotaMessage(quotaState("free", 3, 1))).toBe("2 of 3 free analyses left today.");
    expect(quotaMessage(quotaState("free", 3, 3))).toMatch(/used all 3/);
    expect(quotaState("free", 3, 5).remaining).toBe(0);
    expect(quotaMessage(quotaState("pro", null, 7))).toMatch(/Unlimited/);
  });
});
