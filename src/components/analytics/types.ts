/**
 * Wire types for the analytics pages (compare, rankings, trends,
 * relationships, outbreaks). Type-only module: safe for server and client.
 * Server loaders in src/server/analytics produce these; client views consume
 * them as props.
 */

import type { IndicatorMeta } from "@/lib/format";
import type { Disease, RankingLevel } from "./params";

export type PlaceLevel = "nation" | "zone" | "state" | "lga" | "ward";

export interface PlaceOption {
  code: string;
  name: string;
  level: PlaceLevel;
  /** e.g. "LGA, Kano" — null for the nation/states. */
  context?: string | null;
}

export interface IndicatorOption extends IndicatorMeta {
  code: string;
  name: string;
  category: string;
  higherIsBetter: boolean | null;
}

/** One published value, trimmed for the client, with a display source label. */
export interface ValueCell {
  value: number;
  lower: number | null;
  upper: number | null;
  year: number;
  periodLabel: string | null;
  isEstimate: boolean;
  sourceId: number;
  /** Publisher, plus "SYNTHETIC demo data" when the dataset is synthetic. */
  source: string;
}

/* ── compare ─────────────────────────────────────────────────────────── */

export interface CompareBar {
  code: string;
  name: string;
  level: PlaceLevel;
  cell: ValueCell | null;
}

export interface CompareChartData {
  indicator: IndicatorOption;
  /** "common": every place with data shares `year`; "latest-each": years differ (each bar labelled). */
  mode: "common" | "latest-each" | "none";
  year: number | null;
  bars: CompareBar[];
  national: ValueCell | null;
}

export interface CompareData {
  places: PlaceOption[];
  unknownPlaces: string[];
  unknownIndicators: string[];
  charts: CompareChartData[];
}

/* ── rankings ────────────────────────────────────────────────────────── */

export interface RankingRow {
  rank: number;
  outOf: number;
  code: string;
  name: string;
  /** Parent state for LGAs. */
  parent: string | null;
  cell: ValueCell;
}

export interface NoDataPlace {
  code: string;
  name: string;
  parent: string | null;
}

export interface RankingsData {
  indicator: IndicatorOption;
  level: RankingLevel;
  years: number[];
  year: number | null;
  /** True when the requested year had no data and the latest was used instead. */
  yearFallback: boolean;
  rows: RankingRow[];
  noData: NoDataPlace[];
}

/* ── trends ──────────────────────────────────────────────────────────── */

export interface TrendPlaceSeries {
  code: string;
  name: string;
  level: PlaceLevel;
  points: ValueCell[];
}

export interface TrendsData {
  indicator: IndicatorOption;
  places: PlaceOption[];
  unknownPlaces: string[];
  series: TrendPlaceSeries[];
}

/* ── relationships ───────────────────────────────────────────────────── */

export interface ScatterPoint {
  code: string;
  name: string;
  x: number;
  y: number;
  xSource: string;
  ySource: string;
  xEstimate: boolean;
  yEstimate: boolean;
}

export interface RelationshipsData {
  x: IndicatorOption;
  y: IndicatorOption;
  /** Years in which BOTH indicators have state-level values. */
  commonYears: number[];
  year: number | null;
  yearFallback: boolean;
  points: ScatterPoint[];
  /** States (with a name) missing one or both values in `year`. */
  missing: Array<{ code: string; name: string; lacks: "x" | "y" | "both" }>;
  totalStates: number;
  stats: {
    n: number;
    r: number | null;
    slope: number | null;
    intercept: number | null;
    r2: number | null;
    skipped: "too_few_points" | "zero_variance_x" | "zero_variance_y" | null;
    description: string | null;
    skipText: string | null;
  };
}

/* ── outbreaks ───────────────────────────────────────────────────────── */

export interface OutbreakCell {
  stateId: number;
  code: string;
  name: string;
  week: number;
  suspected: number | null;
  confirmed: number | null;
  deaths: number | null;
}

export interface OutbreaksData {
  disease: Disease;
  /** Diseases with any published reports (others render "No data"). */
  diseasesWithData: Disease[];
  years: number[];
  year: number | null;
  /** Weekly state rows for the whole year (scrubbing is client-side). */
  rows: OutbreakCell[];
  /** Highest epi week with any report this year. */
  lastWeek: number | null;
  sources: string[];
}
