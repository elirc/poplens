/**
 * Wire types shared by the content server modules (src/server/content,
 * src/server/downloads) and the content/embed client components. Type-only
 * module: safe to import from both sides.
 */

import type { IndicatorMeta } from "@/lib/format";
import type { TrendSeriesInput } from "@/components/indicators/trend-series";

/* ── Story shortcodes / chart specs ─────────────────────────────────── */

export const CHART_TYPES = ["trend", "bar", "top5"] as const;
export type ChartType = (typeof CHART_TYPES)[number];

export const CHART_LEVELS = ["state", "lga"] as const;
export type ChartLevel = (typeof CHART_LEVELS)[number];

/** A parsed, validated `{{chart …}}` shortcode (also the /embed/chart params). */
export interface ChartSpec {
  type: ChartType;
  indicator: string;
  /** Place codes, e.g. ["NG", "NG-KN"]. Empty for top5. */
  places: string[];
  year: number | null;
  /** Level ranked by top5 (default state). */
  level: ChartLevel;
  /** Optional title override. */
  title: string | null;
}

export interface ChartIndicator extends IndicatorMeta {
  code: string;
  name: string;
  higherIsBetter: boolean | null;
}

export interface BarRow {
  code: string;
  name: string;
  value: number;
  lower: number | null;
  upper: number | null;
  year: number;
  isEstimate: boolean;
  sourceName: string;
  /** Rank among all units of the level (top5 only). */
  rank?: number;
  outOf?: number;
}

export type ChartData =
  | {
      type: "trend";
      spec: ChartSpec;
      title: string;
      indicator: ChartIndicator;
      series: TrendSeriesInput[];
      /** Requested places with no published values at all. */
      missing: Array<{ code: string; name: string }>;
      isSynthetic: boolean;
    }
  | {
      type: "bar" | "top5";
      spec: ChartSpec;
      title: string;
      indicator: ChartIndicator;
      rows: BarRow[];
      missing: Array<{ code: string; name: string }>;
      /** The year shown (null when values come from each place's latest year). */
      year: number | null;
      isSynthetic: boolean;
    };

export type ChartResult =
  | { ok: true; data: ChartData }
  | { ok: false; message: string };

/* ── Restricted markdown AST (stories) ─────────────────────────────── */

export type Inline =
  | { t: "text"; v: string }
  | { t: "strong"; c: Inline[] }
  | { t: "em"; c: Inline[] }
  | { t: "code"; v: string }
  | { t: "link"; href: string; c: Inline[] };

export type Block =
  | { t: "heading"; level: 2 | 3 | 4; c: Inline[] }
  | { t: "paragraph"; c: Inline[] }
  | { t: "quote"; c: Block[] }
  | { t: "list"; ordered: boolean; items: Inline[][] }
  | { t: "hr" }
  | { t: "chart"; spec: ChartSpec; raw: string }
  | { t: "chart_error"; raw: string; message: string };

/* ── Insight cards ─────────────────────────────────────────────────── */

export const CARD_KINDS = ["top5", "vs_national", "single_stat", "trend"] as const;
export type CardKind = (typeof CARD_KINDS)[number];

/** The `insight_cards.spec` jsonb shape (see src/db/schema/content.ts). */
export interface CardSpec {
  kind: CardKind;
  indicatorCode: string;
  placeCodes?: string[];
  year?: number;
  level?: ChartLevel;
}

/** Everything an insight card image / preview needs, assembled from live data. */
export interface CardData {
  kind: CardKind;
  title: string;
  indicator: ChartIndicator;
  year: number | null;
  /** Main place (null for top5). */
  place: { code: string; name: string; level: string } | null;
  /** Formatted headline value (or NO_DATA). */
  headline: string;
  headlineRaw: number | null;
  /** vs_national: the national figure. */
  national: { formatted: string; raw: number | null } | null;
  /** Formatted rank line, e.g. "Ranks 3rd of 37 states". */
  rankLine: string | null;
  /** top5 rows (formatted). */
  rows: Array<{ rank: number; name: string; formatted: string; raw: number }>;
  /** trend: one bar per year (formatted). */
  points: Array<{ year: number; raw: number; formatted: string; sourceId: number }>;
  /** True when the trend spans more than one source (never joined silently). */
  sourcesDiffer: boolean;
  sourceLine: string;
  isSynthetic: boolean;
  isEstimate: boolean;
  /** Deep links for the share page. */
  exploreHref: string;
  profileHref: string | null;
}

/* ── Downloads ─────────────────────────────────────────────────────── */

export type DownloadFormat = "csv" | "xlsx";

/**
 * Addressable downloadable tables. The server re-validates every field.
 *  - level:   rankings-style table (every unit of a level for one year)
 *  - places:  one indicator for chosen places (one year, or all years = trend)
 *  - place:   place-profile indicator table (latest value of every indicator)
 *  - dataset: a whole published dataset
 */
export type DownloadSpec =
  | { kind: "level"; indicator: string; level: "state" | "lga" | "ward"; year?: number | null; parent?: string | null }
  | { kind: "places"; indicator: string; places: string[]; year?: number | null }
  | { kind: "place"; place: string }
  | { kind: "dataset"; datasetId: number };
