import type { Metadata } from "next";
import { Alert } from "@/components/ui/misc";
import { AnalyticsHeader, AnalyticsPage } from "@/components/analytics/page-header";
import { DEFAULTS, parseTrends, type ParamRecord } from "@/components/analytics/params";
import {
  cachedIndicatorOptions,
  cachedPlaceOptions,
  cachedTrends,
} from "@/server/analytics/cached";
import { TrendsView } from "./trends-view";

/**
 * /trends?indicator=u5mr&places=NG,NG-KN — an indicator over time, one line
 * per place (max 6). Lines break where the source changes (spec rule).
 * Dynamic page; data cached per URL for 300 s.
 */

export const metadata: Metadata = {
  title: "Trends",
  description:
    "See how a population or health indicator has changed over time for Nigeria, its states, LGAs and wards — survey years marked, sources never silently joined.",
};

export default async function TrendsPage({ searchParams }: { searchParams: Promise<ParamRecord> }) {
  const state = parseTrends(await searchParams);
  const places = state.places ?? [...DEFAULTS.trends.places];
  const [indicators, quickPlaces, requested] = await Promise.all([
    cachedIndicatorOptions(),
    cachedPlaceOptions(),
    cachedTrends(state.indicator ?? DEFAULTS.trends.indicator, places),
  ]);
  const data = requested ?? (await cachedTrends(DEFAULTS.trends.indicator, places));
  return (
    <AnalyticsPage>
      <AnalyticsHeader
        title="Trends"
        description="An indicator over time for one or more places. Dots mark survey and estimate years; a change of source breaks the line."
      />
      {!requested && state.indicator && (
        <Alert variant="warning">Unknown indicator “{state.indicator}” — showing the default instead.</Alert>
      )}
      {data ? (
        <TrendsView data={data} indicators={indicators} quickPlaces={quickPlaces} />
      ) : (
        <Alert>The indicator catalogue is not loaded yet.</Alert>
      )}
    </AnalyticsPage>
  );
}
