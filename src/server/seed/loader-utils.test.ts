import { describe, expect, it } from "vitest";
import { GridAccumulator, parseArgs, parseXyzLine, pickField } from "./loader-utils";

describe("loader utils", () => {
  it("parses CLI flags", () => {
    const a = parseArgs(["--dir", "x/y", "--dry-run", "--year=2020", "--field-lga", "LGA_NAME"]);
    expect(a.get("dir")).toBe("x/y");
    expect(a.get("dry-run")).toBe(true);
    expect(a.get("year")).toBe("2020");
    expect(a.get("field-lga")).toBe("LGA_NAME");
  });

  it("picks attribute fields case-insensitively, override first, null when absent", () => {
    const sample = { StateName: "Kano", LGANAME: "Gwale", other: 1 };
    expect(pickField(sample, ["statename", "state_name"])).toBe("StateName");
    expect(pickField(sample, ["lga_name", "lganame"])).toBe("LGANAME");
    expect(pickField(sample, ["x"], "other")).toBe("other");
    expect(pickField(sample, ["x"], "missing")).toBeNull();
    expect(pickField(sample, ["ward"])).toBeNull();
  });

  it("parses gdal2xyz lines and skips junk", () => {
    expect(parseXyzLine("3.35 6.6 12.5")).toEqual([3.35, 6.6, 12.5]);
    expect(parseXyzLine("3.35,6.6,12.5")).toEqual([3.35, 6.6, 12.5]);
    expect(parseXyzLine("# header")).toBeNull();
    expect(parseXyzLine("x y z")).toBeNull();
    expect(parseXyzLine("")).toBeNull();
  });

  it("aggregates 100 m points into ~1 km cells preserving the total", () => {
    const g = new GridAccumulator(0.01);
    // 10×10 points spaced 0.001° inside one 0.01° cell, plus one in the next cell.
    for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) g.add(3.0001 + i * 0.001, 6.0001 + j * 0.001, 2);
    g.add(3.0151, 6.0051, 7);
    g.add(3.02, 6.0, -9999); // nodata ignored
    expect(g.cells.size).toBe(2);
    expect(g.total()).toBeCloseTo(207, 9);
    const [k] = [...g.cells.keys()];
    const [x, y] = g.centre(k);
    expect(x).toBeCloseTo(3.005, 9);
    expect(y).toBeCloseTo(6.005, 9);
  });
});
