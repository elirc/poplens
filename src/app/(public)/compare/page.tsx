import type { Metadata } from "next";
import { AnalyticsHeader, AnalyticsPage } from "@/components/analytics/page-header";
import { DEFAULTS, parseCompare, type ParamRecord } from "@/components/analytics/params";
import {
  cachedCompare,
  cachedIndicatorOptions,
  cachedPlaceOptions,
} from "@/server/analytics/cached";
import { CompareView } from "./compare-view";

/**
 * /compare?places=NG-KN,NG-LA&indicators=u5mr,anc4 — up to four places side
 * by side, one chart per indicator. The page reads searchParams (dynamic);
 * the data for each URL is cached for 300 s (src/server/analytics/cached.ts).
 */

export const metadata: Metadata = {
  title: "Compare places",
  description:
    "Compare up to four Nigerian states, LGAs or wards side by side on population and health indicators, with the national figure for reference and every value's source.",
};

export default async function ComparePage({ searchParams }: { searchParams: Promise<ParamRecord> }) {
  const state = parseCompare(await searchParams);
  const places = state.places ?? [...DEFAULTS.compare.places];
  const indicators = state.indicators ?? [...DEFAULTS.compare.indicators];
  const [data, indicatorOptions, quickPlaces] = await Promise.all([
    cachedCompare(places, indicators),
    cachedIndicatorOptions(),
    cachedPlaceOptions(),
  ]);
  return (
    <AnalyticsPage>
      <AnalyticsHeader
        title="Compare places"
        description="Up to four places side by side — one chart per indicator, with Nigeria's figure as a reference line."
      />
      <CompareView data={data} indicators={indicatorOptions} quickPlaces={quickPlaces} />
    </AnalyticsPage>
  );
}
