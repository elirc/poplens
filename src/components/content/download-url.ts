import type { DownloadFormat, DownloadSpec } from "./types";

/**
 * URL for a download (pure; shared by client buttons and server tests).
 * Tables:   /api/download/table?kind=level&indicator=u5mr&level=state&year=2018&format=csv
 * Datasets: /api/download/dataset/<id>?format=xlsx
 * The server re-validates every parameter (src/server/downloads/spec.ts).
 */
export function downloadHref(spec: DownloadSpec, format: DownloadFormat): string {
  if (spec.kind === "dataset") {
    return `/api/download/dataset/${encodeURIComponent(String(spec.datasetId))}?format=${format}`;
  }
  const q = new URLSearchParams({ kind: spec.kind });
  switch (spec.kind) {
    case "level":
      q.set("indicator", spec.indicator);
      q.set("level", spec.level);
      if (spec.year != null) q.set("year", String(spec.year));
      if (spec.parent) q.set("parent", spec.parent);
      break;
    case "places":
      q.set("indicator", spec.indicator);
      q.set("places", spec.places.join(","));
      if (spec.year != null) q.set("year", String(spec.year));
      break;
    case "place":
      q.set("place", spec.place);
      break;
  }
  q.set("format", format);
  return `/api/download/table?${q.toString()}`;
}
