/**
 * Shapes returned by GET /api/search and consumed by the search combobox.
 * Pure types (no runtime imports) so both server and client can use them.
 */

export type PlaceLevel = "nation" | "zone" | "state" | "lga" | "ward";

export interface PlaceHit {
  kind: "place";
  code: string;
  name: string;
  level: PlaceLevel;
  /** "Gwale LGA, Kano" style context; null for the nation. */
  context: string | null;
  /** Alias that matched, when the hit came via an alternative spelling. */
  matchedAlias: string | null;
}

export interface IndicatorHit {
  kind: "indicator";
  code: string;
  name: string;
  category: string;
  unit: string;
}

export interface SearchResponse {
  query: string;
  places: PlaceHit[];
  indicators: IndicatorHit[];
}
