import { describe, expect, it } from "vitest";
import { allocateInteger, centred, hash01, hashInt, intBetween, rng } from "./prng";

describe("deterministic generator", () => {
  it("same seed string → same values", () => {
    expect(hash01("pop:NG-KN")).toBe(hash01("pop:NG-KN"));
    expect(hashInt("x")).toBe(hashInt("x"));
    const a = rng("seed-a");
    const b = rng("seed-a");
    const seqA = Array.from({ length: 20 }, a);
    const seqB = Array.from({ length: 20 }, b);
    expect(seqA).toEqual(seqB);
    expect(centred("k")).toBe(centred("k"));
  });

  it("different seeds → different streams", () => {
    expect(hash01("a")).not.toBe(hash01("b"));
    expect(Array.from({ length: 5 }, rng("a"))).not.toEqual(Array.from({ length: 5 }, rng("b")));
  });

  it("values stay in range", () => {
    for (let i = 0; i < 500; i++) {
      const h = hash01(`k${i}`);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(1);
      const n = intBetween(`k${i}`, 8, 12);
      expect(n).toBeGreaterThanOrEqual(8);
      expect(n).toBeLessThanOrEqual(12);
      expect(Math.abs(centred(`k${i}`))).toBeLessThanOrEqual(1);
      expect(hashInt(`k${i}`)).toBeGreaterThan(0);
    }
  });

  it("allocateInteger sums exactly and follows weights", () => {
    const parts = allocateInteger(1_000_003, [1, 2, 3, 4.5]);
    expect(parts.reduce((x, y) => x + y, 0)).toBe(1_000_003);
    expect(parts[3]).toBeGreaterThan(parts[0]);
    expect(allocateInteger(5, [1, 1, 1])).toEqual([2, 2, 1]);
    expect(() => allocateInteger(5, [0, 0])).toThrow();
  });
});
