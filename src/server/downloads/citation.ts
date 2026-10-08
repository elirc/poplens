/**
 * Ready-made citations and download metadata (pure; unit-tested).
 * Source citation templates use {title} {year} {url} {accessed} {publisher}
 * placeholders (see sources.citation_template).
 */

import { formatLagosDate } from "@/lib/format";

export interface DatasetMeta {
  datasetId: number;
  datasetTitle: string;
  yearsCovered: string | null;
  releaseDate: string | null;
  isSynthetic: boolean;
  source: {
    id: number;
    key: string;
    publisher: string;
    title: string;
    url: string | null;
    licence: string;
    licenceUrl: string | null;
    allowsRedistribution: boolean;
    citationTemplate: string | null;
  };
}

export const SYNTHETIC_WARNING =
  "WARNING: SYNTHETIC demo data — these figures were generated for demonstration and are NOT real statistics. Do not cite them as fact.";

export const MISSING_NOTE = "Missing values are left blank (no data) — they are never zero.";

export function datasetYear(d: Pick<DatasetMeta, "yearsCovered" | "releaseDate">): string {
  if (d.yearsCovered) return d.yearsCovered;
  if (d.releaseDate) return d.releaseDate.slice(0, 4);
  return "n.d.";
}

export function fillCitation(
  template: string | null,
  v: { publisher: string; title: string; year: string; url: string; accessed: string },
): string {
  const tpl = template?.trim() || "{publisher}. {title}, {year}. {url}. Accessed {accessed} via PopLens.";
  return tpl.replace(/\{(title|year|url|accessed|publisher)\}/g, (_, k: keyof typeof v) => v[k]);
}

/** Full citation for one dataset, ending with the PopLens page link. */
export function citationFor(
  d: DatasetMeta,
  opts: { appUrl: string; pageUrl: string; accessed: Date },
): string {
  const accessed = formatLagosDate(opts.accessed);
  const text = fillCitation(d.source.citationTemplate, {
    publisher: d.source.publisher,
    title: d.datasetTitle,
    year: datasetYear(d),
    url: d.source.url ?? opts.appUrl,
    accessed,
  });
  return text.includes(opts.pageUrl) ? text : `${text} PopLens page: ${opts.pageUrl}`;
}

export function licenceLine(d: DatasetMeta): string {
  return `${d.source.publisher}: ${d.source.licence}${d.source.licenceUrl ? ` (${d.source.licenceUrl})` : ""}`;
}

/** Label/value metadata rows shared by the CSV header and the Excel "About" sheet. */
export function buildMetadata(input: {
  title: string;
  datasets: DatasetMeta[];
  appUrl: string;
  pagePath: string;
  accessed: Date;
}): Array<[string, string]> {
  const base = input.appUrl.replace(/\/+$/, "");
  const pageUrl = `${base}${input.pagePath.startsWith("/") ? "" : "/"}${input.pagePath}`;
  const rows: Array<[string, string]> = [
    ["Title", input.title],
    ["Downloaded from", pageUrl],
    ["Accessed", `${formatLagosDate(input.accessed)} (Africa/Lagos)`],
  ];
  if (input.datasets.some((d) => d.isSynthetic)) rows.push(["Warning", SYNTHETIC_WARNING]);
  const unique = [...new Map(input.datasets.map((d) => [d.datasetId, d])).values()];
  for (const d of unique) {
    rows.push(["Citation", citationFor(d, { appUrl: base, pageUrl, accessed: input.accessed })]);
  }
  const licences = [...new Set(unique.map(licenceLine))];
  for (const l of licences) rows.push(["Licence", l]);
  rows.push(["Note", MISSING_NOTE]);
  return rows;
}
