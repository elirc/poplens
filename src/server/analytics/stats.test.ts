import { describe, expect, it } from "vitest";
import {
  MIN_POINTS,
  cleanPairs,
  describeCorrelation,
  linearFit,
  mean,
  pearson,
  predict,
  relationshipStats,
  skipReasonText,
  type Pair,
} from "./stats";

const pairs = (xs: number[], ys: number[]): Pair[] => xs.map((x, i) => ({ x, y: ys[i]! }));

describe("mean", () => {
  it("is null for an empty list", () => {
    expect(mean([])).toBeNull();
  });
  it("averages values", () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
  });
});

describe("pearson", () => {
  it("is exactly 1 for a perfect positive line", () => {
    expect(pearson(pairs([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]))).toBeCloseTo(1, 12);
  });

  it("is exactly -1 for a perfect negative line", () => {
    expect(pearson(pairs([1, 2, 3, 4], [10, 7, 4, 1]))).toBeCloseTo(-1, 12);
  });

  it("matches a hand-computed value", () => {
    // x = 1..5, y = [2,4,5,4,5] → r = 6 / sqrt(10 * 6) ≈ 0.7745967
    expect(pearson(pairs([1, 2, 3, 4, 5], [2, 4, 5, 4, 5]))).toBeCloseTo(0.7745967, 6);
  });

  it("is ~0 for an uncorrelated symmetric pattern", () => {
    expect(pearson(pairs([-2, -1, 0, 1, 2], [4, 1, 0, 1, 4]))).toBeCloseTo(0, 12);
  });

  it("is invariant to linear rescaling of either variable", () => {
    const base = pearson(pairs([3, 7, 1, 9, 4], [10, 25, 2, 30, 18]))!;
    const scaled = pearson(pairs([30, 70, 10, 90, 40], [-5, -12.5, -1, -15, -9]))!;
    expect(scaled).toBeCloseTo(-base, 12);
  });

  it("stays within [-1, 1] for large near-collinear values", () => {
    const xs = [1e9, 1e9 + 1, 1e9 + 2, 1e9 + 3];
    const r = pearson(pairs(xs, xs.map((x) => 3 * x + 1)))!;
    expect(r).toBeLessThanOrEqual(1);
    expect(r).toBeGreaterThan(0.999999);
  });

  describe("degenerate cases", () => {
    it(`is null with fewer than ${MIN_POINTS} pairs`, () => {
      expect(pearson([])).toBeNull();
      expect(pearson(pairs([1], [2]))).toBeNull();
      expect(pearson(pairs([1, 2], [2, 4]))).toBeNull();
    });

    it("is null when x has zero variance", () => {
      expect(pearson(pairs([5, 5, 5, 5], [1, 2, 3, 4]))).toBeNull();
    });

    it("is null when y has zero variance", () => {
      expect(pearson(pairs([1, 2, 3, 4], [7, 7, 7, 7]))).toBeNull();
    });

    it("drops non-finite pairs before counting", () => {
      const p = [
        { x: 1, y: 2 },
        { x: Number.NaN, y: 3 },
        { x: 2, y: Number.POSITIVE_INFINITY },
        { x: 3, y: 6 },
      ];
      expect(cleanPairs(p)).toHaveLength(2);
      expect(pearson(p)).toBeNull();
    });
  });
});

describe("linearFit", () => {
  it("recovers slope and intercept of an exact line", () => {
    const fit = linearFit(pairs([0, 1, 2, 3], [1, 3, 5, 7]))!;
    expect(fit.slope).toBeCloseTo(2, 12);
    expect(fit.intercept).toBeCloseTo(1, 12);
    expect(fit.r2).toBeCloseTo(1, 12);
    expect(fit.n).toBe(4);
  });

  it("matches a hand-computed least-squares line", () => {
    // x = 1..5, y = [2,4,5,4,5]: slope = 6/10 = 0.6, intercept = 4 - 0.6*3 = 2.2
    const fit = linearFit(pairs([1, 2, 3, 4, 5], [2, 4, 5, 4, 5]))!;
    expect(fit.slope).toBeCloseTo(0.6, 12);
    expect(fit.intercept).toBeCloseTo(2.2, 12);
    expect(fit.r2).toBeCloseTo(0.6, 12); // r² = 0.7746² = 0.6
    expect(predict(fit, 10)).toBeCloseTo(8.2, 12);
  });

  it("passes through the means", () => {
    const xs = [12, 40, 33, 18, 25, 51];
    const ys = [140, 60, 88, 120, 101, 45];
    const fit = linearFit(pairs(xs, ys))!;
    expect(predict(fit, mean(xs)!)).toBeCloseTo(mean(ys)!, 9);
    expect(fit.slope).toBeLessThan(0);
  });

  it("is null for n < 3 and for zero variance (no line drawn)", () => {
    expect(linearFit(pairs([1, 2], [3, 4]))).toBeNull();
    expect(linearFit(pairs([2, 2, 2], [1, 5, 9]))).toBeNull();
    expect(linearFit(pairs([1, 5, 9], [4, 4, 4]))).toBeNull();
  });
});

describe("relationshipStats", () => {
  it("returns r and the fit together", () => {
    const s = relationshipStats(pairs([1, 2, 3, 4, 5], [2, 4, 5, 4, 5]));
    expect(s.n).toBe(5);
    expect(s.skipped).toBeNull();
    expect(s.r).toBeCloseTo(0.7745967, 6);
    expect(s.fit?.slope).toBeCloseTo(0.6, 12);
  });

  it("reports the reason when skipped", () => {
    expect(relationshipStats(pairs([1, 2], [1, 2]))).toEqual({
      n: 2,
      r: null,
      fit: null,
      skipped: "too_few_points",
    });
    expect(relationshipStats(pairs([3, 3, 3], [1, 2, 3])).skipped).toBe("zero_variance_x");
    expect(relationshipStats(pairs([1, 2, 3], [0, 0, 0])).skipped).toBe("zero_variance_y");
  });

  it("explains the skip in plain words", () => {
    expect(skipReasonText("too_few_points", 1)).toMatch(/Only 1 place has both values/);
    expect(skipReasonText("too_few_points", 2)).toMatch(/Only 2 places have/);
    expect(skipReasonText("zero_variance_y", 5)).toMatch(/same value in every place/);
    expect(skipReasonText(null, 10)).toBeNull();
  });
});

describe("describeCorrelation", () => {
  it("bands r into plain words without implying cause", () => {
    expect(describeCorrelation(null)).toBeNull();
    expect(describeCorrelation(0.05)).toBe("no clear linear relationship");
    expect(describeCorrelation(-0.2)).toBe("weak negative relationship");
    expect(describeCorrelation(0.5)).toBe("moderate positive relationship");
    expect(describeCorrelation(-0.85)).toBe("strong negative relationship");
    expect(describeCorrelation(1)).toBe("strong positive relationship");
  });
});
