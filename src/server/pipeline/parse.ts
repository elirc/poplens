import Papa from "papaparse";
import ExcelJS from "exceljs";
import type {
  ColumnMapping,
  IndicatorColumnMapping,
  OutbreakColumnMapping,
} from "./types";

/**
 * Upload parsing: CSV (papaparse) and Excel (exceljs) → a plain table of
 * strings. Only the first worksheet of a workbook is read. Pure apart from
 * the file buffer — no db access.
 */

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_UPLOAD_ROWS = 50_000;

export interface ParsedTable {
  headers: string[];
  /** Data rows (header excluded), each the same length as headers. */
  rows: string[][];
}

export type UploadFormat = "csv" | "xlsx";

export function detectFormat(filename: string): UploadFormat | null {
  const f = filename.toLowerCase();
  if (f.endsWith(".csv") || f.endsWith(".txt")) return "csv";
  if (f.endsWith(".xlsx")) return "xlsx";
  return null;
}

function tidyHeaders(raw: string[]): string[] {
  const seen = new Map<string, number>();
  return raw.map((h, i) => {
    let name = (h ?? "").toString().trim() || `Column ${i + 1}`;
    const n = seen.get(name) ?? 0;
    seen.set(name, n + 1);
    if (n > 0) name = `${name} (${n + 1})`;
    return name;
  });
}

function toTable(matrix: string[][]): ParsedTable {
  const nonEmpty = matrix.filter((r) => r.some((c) => (c ?? "").toString().trim() !== ""));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };
  const headers = tidyHeaders(nonEmpty[0]);
  const rows = nonEmpty.slice(1).map((r) => headers.map((_, i) => (r[i] ?? "").toString().trim()));
  if (rows.length > MAX_UPLOAD_ROWS) {
    throw new Error(`File has ${rows.length} rows; the limit is ${MAX_UPLOAD_ROWS}. Split it.`);
  }
  return { headers, rows };
}

export function parseCsv(text: string): ParsedTable {
  const clean = text.replace(/^﻿/, "");
  const res = Papa.parse<string[]>(clean, { header: false, skipEmptyLines: "greedy" });
  if (res.errors.length > 0 && res.data.length === 0) {
    throw new Error(`CSV could not be read: ${res.errors[0].message}`);
  }
  return toTable(res.data);
}

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as unknown as Record<string, unknown>;
    if ("result" in o) return cellText(o.result as ExcelJS.CellValue);
    if ("richText" in o && Array.isArray(o.richText))
      return (o.richText as Array<{ text: string }>).map((t) => t.text).join("");
    if ("text" in o) return String(o.text ?? "");
    if ("error" in o) return "";
  }
  return String(v);
}

export async function parseXlsx(buf: Buffer): Promise<ParsedTable> {
  const wb = new ExcelJS.Workbook();
  // exceljs' typings predate Buffer<ArrayBufferLike>; the runtime accepts it.
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return { headers: [], rows: [] };
  const matrix: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const out: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      out[col - 1] = cellText(cell.value).trim();
    });
    for (let i = 0; i < out.length; i++) if (out[i] === undefined) out[i] = "";
    matrix.push(out);
  });
  return toTable(matrix);
}

export async function parseUploadFile(buf: Buffer, filename: string): Promise<ParsedTable> {
  if (buf.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error(`File is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`);
  }
  const fmt = detectFormat(filename);
  if (fmt === "csv") return parseCsv(buf.toString("utf8"));
  if (fmt === "xlsx") return parseXlsx(buf);
  throw new Error("Unsupported file type: upload a .csv or .xlsx file.");
}

/* ── Mapping guess ───────────────────────────────────────────────────────── */

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

function pick(headers: string[], synonyms: string[]): string | null {
  const wanted = synonyms.map(norm);
  for (const w of wanted) {
    const h = headers.find((x) => norm(x) === w);
    if (h) return h;
  }
  return null;
}

export function guessIndicatorMapping(headers: string[]): IndicatorColumnMapping {
  const place =
    pick(headers, ["place", "name", "area", "location", "geography", "lga", "state", "ward", "region"]) ??
    headers[0] ??
    "";
  const stateColumn = place && norm(place) !== "state" ? pick(headers, ["state", "statename"]) : null;
  const levelGuess = norm(place);
  const level: IndicatorColumnMapping["level"] =
    levelGuess === "lga" ? "lga" : levelGuess === "ward" ? "ward" : "state";
  return {
    kind: "indicator_values",
    place,
    stateColumn,
    placeCode: pick(headers, ["code", "placecode", "geocode", "officialcode"]),
    level,
    year: pick(headers, ["year", "period", "surveyyear", "date"]) ?? "",
    indicatorColumn: pick(headers, ["indicator", "indicatorcode", "code_indicator", "metric"]),
    fixedIndicator: null,
    value: pick(headers, ["value", "val", "estimate", "number", "percent", "rate"]) ?? "",
    lower: pick(headers, ["lower", "low", "lci", "cilow", "lowerbound", "ci_lower"]),
    upper: pick(headers, ["upper", "high", "uci", "cihigh", "upperbound", "ci_upper"]),
    sex: pick(headers, ["sex", "gender"]),
    ageGroup: pick(headers, ["age", "agegroup", "age_group"]),
    residence: pick(headers, ["residence", "urbanrural", "urban_rural", "area_type"]),
    note: pick(headers, ["note", "notes", "comment", "comments"]),
    isEstimate: true,
    periodLabel: null,
  };
}

export function guessOutbreakMapping(headers: string[]): OutbreakColumnMapping {
  return {
    kind: "outbreak_reports",
    disease: pick(headers, ["disease", "condition"]) ?? "",
    state: pick(headers, ["state", "statename", "place"]) ?? "",
    year: pick(headers, ["year"]) ?? "",
    week: pick(headers, ["week", "epiweek", "epi_week", "epidemiologicalweek"]) ?? "",
    suspected: pick(headers, ["suspected", "suspectedcases", "cases"]),
    confirmed: pick(headers, ["confirmed", "confirmedcases"]),
    deaths: pick(headers, ["deaths", "death", "cfr_deaths"]),
  };
}

export function guessMapping(headers: string[], kind: ColumnMapping["kind"]): ColumnMapping {
  return kind === "outbreak_reports" ? guessOutbreakMapping(headers) : guessIndicatorMapping(headers);
}

/** Column accessor by header name ("" / null → ""). */
export function colGetter(headers: string[]) {
  const idx = new Map(headers.map((h, i) => [h, i]));
  return (row: string[], col: string | null | undefined): string => {
    if (!col) return "";
    const i = idx.get(col);
    return i === undefined ? "" : (row[i] ?? "").trim();
  };
}

/* ── Templates ───────────────────────────────────────────────────────────── */

export const INDICATOR_TEMPLATE_CSV =
  "state,lga,code,indicator,year,value,lower,upper,sex,age_group,residence,note\n" +
  "Kano,Gwale,,anc4,2023,,,,all,all,all,Replace this row with real values from your source\n";

export const OUTBREAK_TEMPLATE_CSV =
  "disease,state,year,week,suspected,confirmed,deaths\n" +
  "cholera,Borno,2024,1,,,\n";
