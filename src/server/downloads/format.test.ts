import { describe, expect, it } from "vitest";
import { downloadHref } from "@/components/content/download-url";
import type { DownloadSpec } from "@/components/content/types";
import { buildMetadata, citationFor, fillCitation, SYNTHETIC_WARNING, type DatasetMeta } from "./citation";
import { csvCell, toCsv } from "./csv";
import { parseDatasetId, parseFormat, parseTableSpec } from "./spec";

const synthetic: DatasetMeta = {
  datasetId: 11,
  datasetTitle: "Survey-style indicators — SYNTHETIC demo data",
  yearsCovered: "2013–2023",
  releaseDate: null,
  isSynthetic: true,
  source: {
    id: 11,
    key: "synthetic",
    publisher: "PopLens (demo data)",
    title: "PopLens synthetic demo dataset",
    url: null,
    licence: "CC0 1.0 (synthetic, generated)",
    licenceUrl: null,
    allowsRedistribution: true,
    citationTemplate: "PopLens synthetic demo data ({title}, {year}). SYNTHETIC — not real statistics. Do not cite as fact.",
  },
};

const wb: DatasetMeta = {
  ...synthetic,
  datasetId: 3,
  datasetTitle: "Under-5 mortality",
  yearsCovered: null,
  releaseDate: "2024-05-01",
  isSynthetic: false,
  source: {
    ...synthetic.source,
    id: 6,
    key: "worldbank",
    publisher: "The World Bank",
    url: "https://data.worldbank.org",
    licence: "CC BY 4.0",
    licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
    citationTemplate: "The World Bank. World Development Indicators: {title}, {year}. {url}. CC BY 4.0. Accessed {accessed} via PopLens.",
  },
};

const accessed = new Date("2026-10-08T23:30:00Z"); // 9 Oct in Lagos (UTC+1)

describe("citations", () => {
  it("fills the source template with title, year, url and the Lagos access date", () => {
    const c = citationFor(wb, { appUrl: "https://poplens.ng", pageUrl: "https://poplens.ng/explore?i=u5mr", accessed });
    expect(c).toContain("World Development Indicators: Under-5 mortality, 2024.");
    expect(c).toContain("https://data.worldbank.org");
    expect(c).toMatch(/Accessed 9 Oct 2026/);
    expect(c).toContain("PopLens page: https://poplens.ng/explore?i=u5mr");
  });

  it("falls back to a generic template", () => {
    expect(fillCitation(null, { publisher: "NBS", title: "T", year: "2020", url: "u", accessed: "a" })).toBe(
      "NBS. T, 2020. u. Accessed a via PopLens.",
    );
  });

  it("metadata carries link, citation, licence and the synthetic warning", () => {
    const rows = buildMetadata({
      title: "Test table",
      datasets: [synthetic, wb, synthetic],
      appUrl: "https://poplens.ng/",
      pagePath: "/explore?i=u5mr",
      accessed,
    });
    const labels = rows.map((r) => r[0]);
    expect(rows).toContainEqual(["Downloaded from", "https://poplens.ng/explore?i=u5mr"]);
    expect(rows).toContainEqual(["Warning", SYNTHETIC_WARNING]);
    expect(labels.filter((l) => l === "Citation")).toHaveLength(2);
    expect(labels.filter((l) => l === "Licence")).toHaveLength(2);
  });

  it("no synthetic warning for real data", () => {
    const rows = buildMetadata({ title: "t", datasets: [wb], appUrl: "http://x", pagePath: "/", accessed });
    expect(rows.map((r) => r[0])).not.toContain("Warning");
  });
});

describe("csv", () => {
  it("quotes, escapes, blanks missing values and defuses formulas", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(0)).toBe("0");
    expect(csvCell(-1.5)).toBe("-1.5");
    expect(csvCell(Number.NaN)).toBe("");
    expect(csvCell(true)).toBe("true");
    expect(csvCell('a "b", c')).toBe('"a ""b"", c"');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
  });

  it("writes metadata lines, a blank line, then header + rows with BOM and CRLF", () => {
    const out = toCsv({
      metadata: [["Title", "T, with comma"]],
      columns: [
        { key: "a", header: "a" },
        { key: "b", header: "b" },
      ],
      rows: [{ a: "x", b: 1 }, { a: "y", b: null }],
    });
    expect(out.startsWith("﻿")).toBe(true);
    expect(out.slice(1).split("\r\n")).toEqual(['"# Title: T, with comma"', "", "a,b", "x,1", "y,", ""]);
  });
});

describe("download spec round-trip", () => {
  const cases: DownloadSpec[] = [
    { kind: "level", indicator: "u5mr", level: "state", year: 2018, parent: null },
    { kind: "level", indicator: "pop_total", level: "lga", year: null, parent: "NG-KN" },
    { kind: "places", indicator: "anc4", places: ["NG", "NG-KN"], year: 2018 },
    { kind: "places", indicator: "anc4", places: ["NG-LA"], year: null },
    { kind: "place", place: "NG-KN" },
  ];
  it.each(cases)("parses what downloadHref builds: %o", (spec) => {
    const url = new URL(downloadHref(spec, "xlsx"), "http://x");
    expect(url.pathname).toBe("/api/download/table");
    expect(parseFormat(url.searchParams.get("format"))).toBe("xlsx");
    expect(parseTableSpec(url.searchParams)).toEqual({ ok: true, value: spec });
  });

  it("dataset hrefs and ids", () => {
    expect(downloadHref({ kind: "dataset", datasetId: 11 }, "csv")).toBe("/api/download/dataset/11?format=csv");
    expect(parseDatasetId("11")).toBe(11);
    expect(parseDatasetId("0")).toBeNull();
    expect(parseDatasetId("1;drop")).toBeNull();
  });

  it("rejects bad input", () => {
    expect(parseFormat("pdf")).toBeNull();
    expect(parseFormat(null)).toBe("csv");
    expect(parseTableSpec(new URLSearchParams("kind=level&indicator=u5mr&level=nation")).ok).toBe(false);
    expect(parseTableSpec(new URLSearchParams("kind=places&indicator=u5mr&places=")).ok).toBe(false);
    expect(parseTableSpec(new URLSearchParams("kind=sql&indicator=u5mr")).ok).toBe(false);
  });
});
