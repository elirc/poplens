import { loadChartData } from "@/server/content/charts";
import { ChartErrorBox, ChartView } from "./chart-view";
import { DownloadButtons } from "./download-buttons";
import { EmbedButton } from "./embed-button";
import { chartEmbedPath } from "./embed-url";
import type { ChartData, ChartSpec, DownloadSpec } from "./types";

/** Download spec matching what a chart shows. */
export function chartDownloadSpec(data: ChartData): DownloadSpec {
  if (data.type === "top5") {
    return { kind: "level", indicator: data.indicator.code, level: data.spec.level, year: data.year };
  }
  return {
    kind: "places",
    indicator: data.indicator.code,
    places: data.spec.places,
    year: data.type === "bar" ? data.spec.year : null,
  };
}

/**
 * A live story chart (server component): loads published values for the
 * shortcode spec and renders it with the shared chart components, plus the
 * Embed and (signed-in) download buttons. Bad specs render an error box.
 */
export async function StoryChart({ spec, raw }: { spec: ChartSpec; raw?: string }) {
  const r = await loadChartData(spec);
  if (!r.ok) return <ChartErrorBox message={r.message} raw={raw} />;
  return (
    <div>
      <ChartView data={r.data} />
      <div className="mt-1 flex flex-wrap items-start justify-between gap-2">
        <EmbedButton path={chartEmbedPath(spec)} title={r.data.title} />
        <DownloadButtons spec={chartDownloadSpec(r.data)} label={`Download data: ${r.data.title}`} />
      </div>
    </div>
  );
}
