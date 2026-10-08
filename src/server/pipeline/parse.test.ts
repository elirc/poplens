import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  colGetter,
  detectFormat,
  guessIndicatorMapping,
  guessOutbreakMapping,
  OUTBREAK_TEMPLATE_CSV,
  parseCsv,
  parseUploadFile,
} from "./parse";

describe("parseCsv", () => {
  it("reads headers and rows, strips BOM, skips blank lines, pads short rows", () => {
    const t = parseCsv("﻿state,year,value\nKano,2021,40\n\n\"Akwa Ibom\",2021\n");
    expect(t.headers).toEqual(["state", "year", "value"]);
    expect(t.rows).toEqual([
      ["Kano", "2021", "40"],
      ["Akwa Ibom", "2021", ""],
    ]);
  });
  it("de-duplicates and fills blank headers", () => {
    const t = parseCsv("value,value,\n1,2,3\n");
    expect(t.headers).toEqual(["value", "value (2)", "Column 3"]);
  });
});

describe("parseUploadFile", () => {
  it("rejects unsupported formats", async () => {
    await expect(parseUploadFile(Buffer.from("x"), "data.pdf")).rejects.toThrow(/csv or \.xlsx/i);
    expect(detectFormat("A.XLSX")).toBe("xlsx");
  });

  it("reads the first sheet of an Excel workbook, including formula results", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("data");
    ws.addRow(["state", "year", "value"]);
    ws.addRow(["Kano", 2021, 40.5]);
    ws.addRow(["Lagos", 2021, { formula: "1+1", result: 2 }]);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const t = await parseUploadFile(buf, "file.xlsx");
    expect(t.headers).toEqual(["state", "year", "value"]);
    expect(t.rows).toEqual([
      ["Kano", "2021", "40.5"],
      ["Lagos", "2021", "2"],
    ]);
  });
});

describe("mapping guesses", () => {
  it("guesses indicator columns from common header names", () => {
    const m = guessIndicatorMapping(["State", "LGA", "Indicator", "Year", "Value", "CI_Lower", "CI_Upper", "Sex"]);
    expect(m).toMatchObject({
      place: "LGA",
      level: "lga",
      stateColumn: "State",
      indicatorColumn: "Indicator",
      year: "Year",
      value: "Value",
      lower: "CI_Lower",
      upper: "CI_Upper",
      sex: "Sex",
    });
  });
  it("guesses the NCDC outbreak template", () => {
    const t = parseCsv(OUTBREAK_TEMPLATE_CSV);
    expect(guessOutbreakMapping(t.headers)).toEqual({
      kind: "outbreak_reports",
      disease: "disease",
      state: "state",
      year: "year",
      week: "week",
      suspected: "suspected",
      confirmed: "confirmed",
      deaths: "deaths",
    });
  });
  it("colGetter reads by header name", () => {
    const get = colGetter(["a", "b"]);
    expect(get(["1", " 2 "], "b")).toBe("2");
    expect(get(["1", "2"], null)).toBe("");
    expect(get(["1", "2"], "zzz")).toBe("");
  });
});
