import { describe, expect, it } from "vitest";
import { asChangeSummary, computeChangeSummary, valueKey, valueLabel, type DiffRow } from "./diff";

const r = (key: string, value: number | null, lower?: number, upper?: number): DiffRow => ({
  key,
  label: key,
  value,
  lower,
  upper,
});

describe("computeChangeSummary", () => {
  const opts = { kind: "indicator_values" as const, comparedWithDatasetId: 7, comparedWithVersion: 1 };

  it("counts added, changed, removed and unchanged", () => {
    const s = computeChangeSummary(
      [r("a", 1), r("b", 2.5), r("c", 3), r("new", 9)],
      [r("a", 1), r("b", 2), r("c", 3), r("gone", 4)],
      opts,
    );
    expect(s).toMatchObject({ total: 4, added: 1, changed: 1, removed: 1, unchanged: 2, comparedWithDatasetId: 7 });
    expect(s.samples[0]).toEqual({ kind: "changed", key: "b", oldValue: 2, newValue: 2.5 });
    expect(s.samples.map((x) => x.kind)).toEqual(["changed", "removed", "added"]);
  });

  it("treats a changed confidence interval as a change", () => {
    const s = computeChangeSummary([r("a", 1, 0.5, 1.5)], [r("a", 1, 0.4, 1.5)], opts);
    expect(s.changed).toBe(1);
  });

  it("with nothing published, everything is added", () => {
    const s = computeChangeSummary([r("a", 1), r("b", 2)], [], { ...opts, comparedWithDatasetId: null, comparedWithVersion: null });
    expect(s).toMatchObject({ added: 2, changed: 0, removed: 0, comparedWithDatasetId: null });
  });

  it("caps samples", () => {
    const staged = Array.from({ length: 50 }, (_, i) => r(`k${i}`, i));
    expect(computeChangeSummary(staged, [], { ...opts, maxSamples: 5 }).samples).toHaveLength(5);
  });

  it("round-trips through asChangeSummary and rejects junk", () => {
    const s = computeChangeSummary([r("a", 1)], [], { ...opts, warnings: ["w"] });
    expect(asChangeSummary(JSON.parse(JSON.stringify(s)))).toEqual(s);
    expect(asChangeSummary(null)).toBeNull();
    expect(asChangeSummary({ foo: 1 })).toBeNull();
  });
});

describe("keys and labels", () => {
  it("valueKey includes the breakdown", () => {
    const base = { indicatorId: 1, geoUnitId: 2, year: 2018, sex: "all", ageGroup: "all", residence: "all" };
    expect(valueKey(base)).not.toBe(valueKey({ ...base, sex: "female" }));
  });
  it("valueLabel shows only non-headline breakdowns", () => {
    expect(
      valueLabel({ indicatorCode: "u5mr", placeCode: "NG-KN", year: 2018, sex: "all", ageGroup: "all", residence: "urban" }),
    ).toBe("u5mr · NG-KN · 2018 · urban");
  });
});
