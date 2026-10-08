import type { Metadata } from "next";
import { chartSpecFromRecord } from "@/server/content/shortcode";
import { loadChartData } from "@/server/content/charts";
import { ChartView } from "@/components/content/chart-view";
import { ChartErrorBox } from "@/components/content/chart-error";
import { EmbedFooter } from "@/components/embed/embed-footer";
import { env } from "@/env";

/**
 * /embed/chart?type=trend|bar|top5&indicator=<code>&places=NG,NG-KN&year=2018[&level=lga][&title=…]
 * Same parameters as story shortcodes. Minimal chrome: chart (with table
 * view + source line), demo note and a PopLens backlink.
 */
export const revalidate = 300;

export const metadata: Metadata = { title: "Chart" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function EmbedChart({ searchParams }: Props) {
  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const parsed = chartSpecFromRecord({
    type: one("type"),
    indicator: one("indicator"),
    places: one("places"),
    year: one("year"),
    level: one("level"),
    title: one("title"),
  });
  const base = env.APP_URL.replace(/\/+$/, "");
  if (!parsed.ok) {
    return (
      <>
        <ChartErrorBox message={parsed.message} />
        <EmbedFooter href={base} synthetic={false} />
      </>
    );
  }
  const r = await loadChartData(parsed.value);
  if (!r.ok) {
    return (
      <>
        <ChartErrorBox message={r.message} />
        <EmbedFooter href={base} synthetic={false} />
      </>
    );
  }
  return (
    <>
      <ChartView data={r.data} compact />
      <EmbedFooter href={`${base}/indicators/${encodeURIComponent(r.data.indicator.code)}`} synthetic={r.data.isSynthetic} />
    </>
  );
}
