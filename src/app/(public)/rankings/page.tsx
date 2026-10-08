import type { Metadata } from "next";
import { Alert } from "@/components/ui/misc";
import { AnalyticsHeader, AnalyticsPage } from "@/components/analytics/page-header";
import { DEFAULTS, parseRankings, type ParamRecord } from "@/components/analytics/params";
import { cachedIndicatorOptions, cachedRankings } from "@/server/analytics/cached";
import { DownloadButtonsClient } from "@/components/content/download-buttons-client";
import { RankingsView } from "./rankings-view";

/**
 * /rankings?indicator=u5mr&level=state&year=2018 — all states or LGAs
 * ordered by an indicator (rank direction from higherIsBetter via
 * computeRanks). Dynamic page; data cached per URL for 300 s.
 */

export const metadata: Metadata = {
  title: "Rankings",
  description:
    "Rank Nigeria's states or LGAs by any population or health indicator, as a sortable table and bar chart, with every value's source and year.",
};

export default async function RankingsPage({ searchParams }: { searchParams: Promise<ParamRecord> }) {
  const state = parseRankings(await searchParams);
  const [indicators, requested] = await Promise.all([
    cachedIndicatorOptions(),
    cachedRankings(state.indicator ?? DEFAULTS.rankings.indicator, state.level, state.year),
  ]);
  // Unknown indicator in the URL → fall back to the default one.
  const data =
    requested ?? (await cachedRankings(DEFAULTS.rankings.indicator, state.level, state.year));
  return (
    <AnalyticsPage>
      <AnalyticsHeader
        title="Rankings"
        description="Every state or LGA ordered by an indicator. Places without data are listed separately and never ranked."
      />
      {!requested && state.indicator && (
        <Alert variant="warning">Unknown indicator “{state.indicator}” — showing the default instead.</Alert>
      )}
      {data ? (
        <>
          <RankingsView data={data} indicators={indicators} requestedYear={state.year} />
          {data.year !== null && (
            <DownloadButtonsClient
              spec={{
                kind: "level",
                indicator: data.indicator.code,
                level: data.level,
                year: data.year,
              }}
              label="Download this table"
            />
          )}
        </>
      ) : (
        <Alert>The indicator catalogue is not loaded yet.</Alert>
      )}
    </AnalyticsPage>
  );
}
