import type { Metadata } from "next";
import { Alert } from "@/components/ui/misc";
import { AnalyticsHeader, AnalyticsPage } from "@/components/analytics/page-header";
import { DEFAULTS, parseRelationships, type ParamRecord } from "@/components/analytics/params";
import { cachedIndicatorOptions, cachedRelationships } from "@/server/analytics/cached";
import { RelationshipsView } from "./relationships-view";

/**
 * /relationships?x=female_literacy&y=u5mr&year=2018 — scatter of two
 * indicators across states with a least-squares line and Pearson r
 * (src/server/analytics/stats.ts). Dynamic page; data cached per URL for 300 s.
 */

export const metadata: Metadata = {
  title: "Relationships",
  description:
    "Plot two population or health indicators against each other across Nigeria's states, with a trend line, the correlation, and a reminder that correlation is not cause.",
};

export default async function RelationshipsPage({ searchParams }: { searchParams: Promise<ParamRecord> }) {
  const state = parseRelationships(await searchParams);
  let xCode = state.x ?? DEFAULTS.relationships.x;
  let yCode = state.y ?? DEFAULTS.relationships.y;
  if (xCode === yCode) yCode = xCode === DEFAULTS.relationships.y ? DEFAULTS.relationships.x : DEFAULTS.relationships.y;
  const [indicators, requested] = await Promise.all([
    cachedIndicatorOptions(),
    cachedRelationships(xCode, yCode, state.year),
  ]);
  let data = requested;
  if (!data) {
    xCode = DEFAULTS.relationships.x;
    yCode = DEFAULTS.relationships.y;
    data = await cachedRelationships(xCode, yCode, state.year);
  }
  return (
    <AnalyticsPage>
      <AnalyticsHeader
        title="Relationships"
        description="Two indicators across states: each dot is a state with both values. A pattern here is a correlation, not proof of cause."
      />
      {!requested && (state.x || state.y) && (
        <Alert variant="warning">Unknown indicator in the link — showing the default pair instead.</Alert>
      )}
      {data ? (
        <RelationshipsView data={data} indicators={indicators} requestedYear={state.year} />
      ) : (
        <Alert>The indicator catalogue is not loaded yet.</Alert>
      )}
    </AnalyticsPage>
  );
}
