import type { ChartSpec } from "./types";

/** /embed/chart path for a chart spec (same parameters as story shortcodes). */
export function chartEmbedPath(spec: ChartSpec): string {
  const q = new URLSearchParams({ type: spec.type, indicator: spec.indicator });
  if (spec.places.length > 0) q.set("places", spec.places.join(","));
  if (spec.year != null) q.set("year", String(spec.year));
  if (spec.type === "top5" && spec.level !== "state") q.set("level", spec.level);
  if (spec.title) q.set("title", spec.title);
  return `/embed/chart?${q.toString()}`;
}

/** /embed/map path: i = indicator, y = year, l = level, p = parent state (lga only). */
export function mapEmbedPath(p: { indicator: string; year?: number | null; level?: string; parent?: string | null }): string {
  const q = new URLSearchParams({ i: p.indicator });
  if (p.year != null) q.set("y", String(p.year));
  if (p.level && p.level !== "state") q.set("l", p.level);
  if (p.parent && p.level === "lga") q.set("p", p.parent);
  return `/embed/map?${q.toString()}`;
}

/** The iframe snippet shown by the Embed button. */
export function iframeSnippet(src: string, title: string, height = 420): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return `<iframe src="${esc(src)}" title="${esc(title)}" width="100%" height="${height}" style="border:0;max-width:720px" loading="lazy"></iframe>`;
}
