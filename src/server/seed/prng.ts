/**
 * Deterministic randomness for the SYNTHETIC demo seed. Everything is keyed by
 * strings so re-running the seed produces identical values (stable diffs,
 * stable tests). Uses the same FNV-1a hash as
 * src/adapters/connectors/synthetic.ts.
 */

/** FNV-1a 32-bit hash of a string, mapped to [0, 1]. */
export function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

/** Integer FNV-1a hash (useful as a PostGIS ST_GeneratePoints seed). */
export function hashInt(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 2147483647 || 1;
}

/** Small seeded PRNG (mulberry32) — a stream of floats in [0, 1). */
export function rng(seed: string): () => number {
  let a = hashInt(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic integer in [min, max] (inclusive) for a key. */
export function intBetween(key: string, min: number, max: number): number {
  return min + Math.floor(hash01(key) * (max - min + 1 - 1e-9));
}

/** Deterministic approximately-normal value (sum of 4 uniforms) in ~[-1, 1]. */
export function centred(key: string): number {
  const r = rng(key);
  return (r() + r() + r() + r() - 2) / 2;
}

/**
 * Split an integer total into integer parts proportional to `weights`
 * (largest-remainder method). The parts always sum exactly to `total`,
 * which keeps ward → LGA → state → national population sums consistent.
 */
export function allocateInteger(total: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) throw new Error("allocateInteger: weights must be positive");
  const exact = weights.map((w) => (total * w) / sum);
  const floors = exact.map(Math.floor);
  let remainder = total - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; remainder > 0; k = (k + 1) % order.length, remainder--) {
    floors[order[k].i] += 1;
  }
  return floors;
}

export function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

export function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}
