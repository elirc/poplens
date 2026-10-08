import type { CardData, ChartSpec, DownloadSpec } from "./types";

/** The chart (for Embed) that shows the same data as an insight card. */
export function cardChartSpec(d: CardData): ChartSpec {
  const base = { indicator: d.indicator.code, title: null, level: "state" as const };
  switch (d.kind) {
    case "top5":
      return { ...base, type: "top5", places: [], year: d.year, level: inferLevel(d) };
    case "vs_national":
      return { ...base, type: "bar", places: [d.place!.code, "NG"], year: d.year };
    case "single_stat":
      return { ...base, type: "bar", places: [d.place?.code ?? "NG"], year: d.year };
    case "trend":
      return { ...base, type: "trend", places: [d.place?.code ?? "NG"], year: null };
  }
}

function inferLevel(d: CardData): "state" | "lga" {
  return /[?&]l=lga\b/.test(d.exploreHref) ? "lga" : "state";
}

/** The downloadable table behind an insight card. */
export function cardDownloadSpec(d: CardData): DownloadSpec {
  const c = cardChartSpec(d);
  if (c.type === "top5") return { kind: "level", indicator: c.indicator, level: c.level, year: c.year };
  return { kind: "places", indicator: c.indicator, places: c.places, year: c.year };
}
