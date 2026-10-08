/**
 * Choropleth class breaks (pure, unit-tested). Three methods per spec's
 * legend choice: quantile, equal interval, and Jenks natural breaks.
 * Returns ascending upper-bound thresholds for `classes` buckets; a value v
 * belongs to the first bucket whose threshold >= v.
 */

export type BreakMethod = "quantile" | "equal" | "jenks";

export function classBreaks(
  values: number[],
  classes: number,
  method: BreakMethod,
): number[] {
  const clean = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (clean.length === 0) return [];
  const k = Math.max(1, Math.min(classes, clean.length));
  switch (method) {
    case "quantile":
      return quantileBreaks(clean, k);
    case "equal":
      return equalBreaks(clean, k);
    case "jenks":
      return jenksBreaks(clean, k);
  }
}

function quantileBreaks(sorted: number[], k: number): number[] {
  const out: number[] = [];
  for (let i = 1; i <= k; i++) {
    const idx = Math.min(sorted.length - 1, Math.ceil((i * sorted.length) / k) - 1);
    out.push(sorted[idx]);
  }
  return dedupe(out);
}

function equalBreaks(sorted: number[], k: number): number[] {
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  if (min === max) return [max];
  const step = (max - min) / k;
  const out: number[] = [];
  for (let i = 1; i <= k; i++) out.push(min + step * i);
  out[out.length - 1] = max;
  return out;
}

/** Jenks natural breaks via the standard dynamic-programming matrices. */
function jenksBreaks(sorted: number[], k: number): number[] {
  const n = sorted.length;
  if (k >= n) return dedupe(sorted.slice());
  const lowerClassLimits: number[][] = [];
  const varianceCombinations: number[][] = [];
  for (let i = 0; i <= n; i++) {
    lowerClassLimits.push(new Array(k + 1).fill(0));
    varianceCombinations.push(new Array(k + 1).fill(0));
  }
  for (let i = 1; i <= k; i++) {
    lowerClassLimits[1][i] = 1;
    varianceCombinations[1][i] = 0;
    for (let j = 2; j <= n; j++) varianceCombinations[j][i] = Infinity;
  }
  let variance = 0;
  for (let l = 2; l <= n; l++) {
    let sum = 0;
    let sumSquares = 0;
    let w = 0;
    for (let m = 1; m <= l; m++) {
      const lowerIdx = l - m + 1;
      const val = sorted[lowerIdx - 1];
      w++;
      sum += val;
      sumSquares += val * val;
      variance = sumSquares - (sum * sum) / w;
      const i4 = lowerIdx - 1;
      if (i4 !== 0) {
        for (let j = 2; j <= k; j++) {
          if (
            varianceCombinations[l][j] >=
            variance + varianceCombinations[i4][j - 1]
          ) {
            lowerClassLimits[l][j] = lowerIdx;
            varianceCombinations[l][j] =
              variance + varianceCombinations[i4][j - 1];
          }
        }
      }
    }
    lowerClassLimits[l][1] = 1;
    varianceCombinations[l][1] = variance;
  }
  const breaks: number[] = new Array(k);
  breaks[k - 1] = sorted[n - 1];
  let countNum = k;
  let idx = n;
  while (countNum > 1) {
    const lower = lowerClassLimits[idx][countNum] - 1;
    breaks[countNum - 2] = sorted[lower - 1];
    idx = lowerClassLimits[idx][countNum] - 1;
    countNum--;
  }
  return dedupe(breaks);
}

function dedupe(breaks: number[]): number[] {
  return [...new Set(breaks)];
}

/** Bucket index (0-based) for a value given ascending thresholds. */
export function bucketFor(value: number, breaks: number[]): number {
  for (let i = 0; i < breaks.length; i++) {
    if (value <= breaks[i]) return i;
  }
  return Math.max(0, breaks.length - 1);
}

/**
 * Colour-blind-safe sequential ramps (ColorBrewer). Index by bucket count.
 * 'viridis'-style ramp for data, plus a NO-DATA grey used everywhere.
 */
export const NO_DATA_COLOR = "#d6d6d6";

export const SEQUENTIAL_RAMPS: Record<number, string[]> = {
  3: ["#edf8b1", "#7fcdbb", "#2c7fb8"],
  4: ["#ffffcc", "#a1dab4", "#41b6c4", "#225ea8"],
  5: ["#ffffcc", "#a1dab4", "#41b6c4", "#2c7fb8", "#253494"],
  6: ["#ffffcc", "#c7e9b4", "#7fcdbb", "#41b6c4", "#2c7fb8", "#253494"],
  7: [
    "#ffffcc",
    "#c7e9b4",
    "#7fcdbb",
    "#41b6c4",
    "#1d91c0",
    "#225ea8",
    "#0c2c84",
  ],
};

export function rampFor(buckets: number): string[] {
  return SEQUENTIAL_RAMPS[Math.max(3, Math.min(7, buckets))];
}
