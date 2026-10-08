/**
 * Pure statistics for the Relationships page (unit-tested, no database).
 *
 * Deliberately small: Pearson's r and an ordinary least-squares line through
 * paired observations. Both refuse to answer (return null) when the answer
 * would be meaningless — fewer than MIN_POINTS pairs, or zero variance in
 * either variable — so the UI shows a note instead of a made-up line or r.
 * Non-finite inputs are dropped pairwise before anything is computed.
 */

/** Fewer paired points than this → no r and no line. */
export const MIN_POINTS = 3;

export interface Pair {
  x: number;
  y: number;
}

export interface LinearFit {
  slope: number;
  intercept: number;
  /** Coefficient of determination of the fit (equals r² for simple OLS). */
  r2: number;
  n: number;
}

export type StatsSkipReason = "too_few_points" | "zero_variance_x" | "zero_variance_y";

export interface RelationshipStats {
  n: number;
  r: number | null;
  fit: LinearFit | null;
  /** Why r / the line were not computed (null when both exist). */
  skipped: StatsSkipReason | null;
}

/** Drop pairs where either coordinate is not a finite number. */
export function cleanPairs(pairs: Pair[]): Pair[] {
  return pairs.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

interface Moments {
  n: number;
  mx: number;
  my: number;
  sxx: number;
  syy: number;
  sxy: number;
}

/** Centred sums of squares / cross-products (two-pass for numeric stability). */
function moments(pairs: Pair[]): Moments {
  const n = pairs.length;
  const mx = mean(pairs.map((p) => p.x)) ?? 0;
  const my = mean(pairs.map((p) => p.y)) ?? 0;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of pairs) {
    const dx = p.x - mx;
    const dy = p.y - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  return { n, mx, my, sxx, syy, sxy };
}

/** Variance this small relative to the data's magnitude counts as zero. */
function isZeroVariance(ss: number, values: number[]): boolean {
  if (ss <= 0) return true;
  const scale = Math.max(1, ...values.map((v) => Math.abs(v)));
  return ss / values.length <= (scale * 1e-12) ** 2;
}

function skipReason(pairs: Pair[], m: Moments): StatsSkipReason | null {
  if (pairs.length < MIN_POINTS) return "too_few_points";
  if (isZeroVariance(m.sxx, pairs.map((p) => p.x))) return "zero_variance_x";
  if (isZeroVariance(m.syy, pairs.map((p) => p.y))) return "zero_variance_y";
  return null;
}

/** Pearson correlation coefficient in [-1, 1], or null when undefined. */
export function pearson(input: Pair[]): number | null {
  const pairs = cleanPairs(input);
  const m = moments(pairs);
  if (skipReason(pairs, m)) return null;
  const r = m.sxy / Math.sqrt(m.sxx * m.syy);
  // Clamp floating-point drift (e.g. 1.0000000000000002).
  return Math.max(-1, Math.min(1, r));
}

/**
 * Ordinary least-squares line y = intercept + slope·x, or null when it is
 * undefined (n < MIN_POINTS or zero variance in x). Zero variance in y is
 * also refused: a flat line through constant data says nothing.
 */
export function linearFit(input: Pair[]): LinearFit | null {
  const pairs = cleanPairs(input);
  const m = moments(pairs);
  if (skipReason(pairs, m)) return null;
  const slope = m.sxy / m.sxx;
  const intercept = m.my - slope * m.mx;
  const r2 = (m.sxy * m.sxy) / (m.sxx * m.syy);
  return { slope, intercept, r2: Math.min(1, r2), n: m.n };
}

/** Both statistics plus the reason they were skipped, in one pass for the page. */
export function relationshipStats(input: Pair[]): RelationshipStats {
  const pairs = cleanPairs(input);
  const m = moments(pairs);
  const skipped = skipReason(pairs, m);
  if (skipped) return { n: pairs.length, r: null, fit: null, skipped };
  return { n: pairs.length, r: pearson(pairs), fit: linearFit(pairs), skipped: null };
}

/** y on the fitted line at x. */
export function predict(fit: Pick<LinearFit, "slope" | "intercept">, x: number): number {
  return fit.intercept + fit.slope * x;
}

/**
 * Plain-language strength of r (conventional rough bands; descriptive only,
 * says nothing about cause). Null r → null.
 */
export function describeCorrelation(r: number | null): string | null {
  if (r == null || !Number.isFinite(r)) return null;
  const a = Math.abs(r);
  const direction = r > 0 ? "positive" : "negative";
  if (a < 0.1) return "no clear linear relationship";
  if (a < 0.3) return `weak ${direction} relationship`;
  if (a < 0.7) return `moderate ${direction} relationship`;
  return `strong ${direction} relationship`;
}

/** Human-readable explanation of why r / the line are missing. */
export function skipReasonText(reason: StatsSkipReason | null, n: number): string | null {
  switch (reason) {
    case "too_few_points":
      return `Only ${n} place${n === 1 ? "" : "s"} ${n === 1 ? "has" : "have"} both values — at least ${MIN_POINTS} are needed for a correlation or trend line.`;
    case "zero_variance_x":
    case "zero_variance_y":
      return "One indicator has the same value in every place, so a correlation and trend line cannot be calculated.";
    default:
      return null;
  }
}
