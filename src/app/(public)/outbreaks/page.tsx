import type { Metadata } from "next";
import { env } from "@/env";
import { AnalyticsHeader, AnalyticsPage } from "@/components/analytics/page-header";
import { parseOutbreaks, type ParamRecord } from "@/components/analytics/params";
import { cachedOutbreaks } from "@/server/analytics/cached";
import { OutbreaksView } from "./outbreaks-view";

/**
 * /outbreaks?disease=cholera&year=2024&week=12 — weekly cases by disease and
 * state: map for the selected week, national epi curve, per-state table.
 * Case counts only (no derived rates). Dynamic page; data cached per URL
 * for 300 s.
 */

export const metadata: Metadata = {
  title: "Outbreaks",
  description:
    "Weekly cholera, Lassa fever, meningitis and measles cases by Nigerian state, as a map and an epidemic curve, from published NCDC situation reports.",
};

export default async function OutbreaksPage({ searchParams }: { searchParams: Promise<ParamRecord> }) {
  const state = parseOutbreaks(await searchParams);
  const data = await cachedOutbreaks(state.disease, state.year);
  return (
    <AnalyticsPage>
      <AnalyticsHeader
        title="Outbreaks"
        description={`Weekly reported cases by state. Figures are counts as published in situation reports, entered by staff — not live surveillance.`}
      />
      <OutbreaksView
        key={`${data.disease}-${data.year ?? "none"}`}
        data={data}
        requestedWeek={state.week}
        styleUrl={env.MAP_STYLE_URL}
      />
    </AnalyticsPage>
  );
}
