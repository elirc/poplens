/**
 * Hand-rolled RFC 4180 CSV (pure; unit-tested). Metadata (citation, licence,
 * synthetic warning) comes first as "# label: value" lines, then a blank
 * line, then the header row and data. UTF-8 with BOM + CRLF so Excel opens
 * it correctly. String cells that start with = + - @ are prefixed with ' to
 * defuse spreadsheet formula injection (numbers are written as-is).
 */

export type Cell = string | number | boolean | null | undefined;

export interface TableColumn {
  key: string;
  header: string;
}

export function csvCell(v: Cell): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  if (typeof v === "boolean") return v ? "true" : "false";
  let s = v;
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s) || /^\s|\s$/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(input: {
  metadata: Array<[string, string]>;
  columns: TableColumn[];
  rows: Array<Record<string, Cell>>;
}): string {
  const lines: string[] = [];
  for (const [label, value] of input.metadata) lines.push(csvCell(`# ${label}: ${value}`));
  if (input.metadata.length > 0) lines.push("");
  lines.push(input.columns.map((c) => csvCell(c.header)).join(","));
  for (const r of input.rows) lines.push(input.columns.map((c) => csvCell(r[c.key])).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}
