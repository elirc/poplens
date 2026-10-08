import { describe, expect, it } from "vitest";
import { epiCurve, pickWeek, statesForWeek, sumReported, yearToDate } from "./outbreak-series";
import type { OutbreakCell } from "./types";

const cell = (
  stateId: number,
  week: number,
  suspected: number | null,
  confirmed: number | null,
  deaths: number | null = null,
): OutbreakCell => ({
  stateId,
  code: `S${stateId}`,
  name: `State ${stateId}`,
  week,
  suspected,
  confirmed,
  deaths,
});

describe("sumReported", () => {
  it("adds only reported figures and is null when none", () => {
    expect(sumReported([1, null, 2])).toBe(3);
    expect(sumReported([null, undefined])).toBeNull();
    expect(sumReported([])).toBeNull();
    expect(sumReported([0])).toBe(0);
  });
});

describe("pickWeek", () => {
  it("keeps a valid week and otherwise uses the latest reported", () => {
    expect(pickWeek(5, 40)).toBe(5);
    expect(pickWeek(41, 40)).toBe(40);
    expect(pickWeek(null, 40)).toBe(40);
    expect(pickWeek(3, null)).toBeNull();
  });
});

describe("epiCurve", () => {
  const rows = [cell(1, 1, 10, 2, 1), cell(2, 1, 5, null, 0), cell(1, 3, 4, 4)];

  it("sums states per week and leaves unreported weeks as gaps", () => {
    const c = epiCurve(rows, 3);
    expect(c).toHaveLength(3);
    expect(c[0]).toEqual({
      week: 1,
      suspected: 15,
      confirmed: 2,
      deaths: 1,
      suspectedNotConfirmed: 13,
      reportingStates: 2,
    });
    expect(c[1]).toMatchObject({ week: 2, suspected: null, confirmed: null, suspectedNotConfirmed: null, reportingStates: 0 });
    expect(c[2]).toMatchObject({ suspected: 4, confirmed: 4, suspectedNotConfirmed: 0 });
  });

  it("never stacks negative bars when confirmed exceeds suspected", () => {
    expect(epiCurve([cell(1, 1, 2, 5)], 1)[0]!.suspectedNotConfirmed).toBe(0);
  });

  it("is empty with no reported weeks", () => {
    expect(epiCurve([], null)).toEqual([]);
  });
});

describe("statesForWeek / yearToDate", () => {
  const rows = [cell(1, 1, 10, 2), cell(2, 1, 30, 1), cell(1, 2, 5, null), cell(2, 3, 1, 1)];

  it("filters one week, biggest first", () => {
    expect(statesForWeek(rows, 1).map((r) => r.stateId)).toEqual([2, 1]);
    expect(statesForWeek(rows, 9)).toEqual([]);
    expect(statesForWeek(rows, null)).toEqual([]);
  });

  it("totals reported figures through the selected week", () => {
    const t = yearToDate(rows, 2);
    expect(t).toEqual([
      { stateId: 2, code: "S2", name: "State 2", suspected: 30, confirmed: 1, deaths: null, weeksReported: 1 },
      { stateId: 1, code: "S1", name: "State 1", suspected: 15, confirmed: 2, deaths: null, weeksReported: 2 },
    ]);
  });
});
