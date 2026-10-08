/**
 * Wire types shared by the geo routes (server) and the map components
 * (client). Type-only module: safe to import from both sides.
 */

import type { IndicatorMeta } from "@/lib/format";

export type ChoroplethLevel = "state" | "lga" | "ward";

export interface ValuesIndicator extends IndicatorMeta {
  code: string;
  name: string;
  category: string;
  higherIsBetter: boolean | null;
}

export interface ValuesSource {
  id: number;
  key: string;
  publisher: string;
  title: string;
  isSynthetic: boolean;
}

export interface PlaceValue {
  /** geo_units.id — joins onto GeoJSON `properties.id` / MVT feature id. */
  id: number;
  code: string;
  name: string;
  value: number;
  lower: number | null;
  upper: number | null;
  isEstimate: boolean;
  sourceId: number;
}

/** GET /api/geo/values?indicator=&level=&year=[&parent=] */
export interface ValuesResponse {
  indicator: ValuesIndicator;
  level: ChoroplethLevel;
  /** Resolved year: the requested one if available, else the latest; null when no data at all. */
  year: number | null;
  /** All years with published values for this indicator at this level. */
  years: number[];
  sources: Record<string, ValuesSource>;
  values: PlaceValue[];
}

export interface GeoFeatureProps {
  id: number;
  code: string;
  name: string;
}

export interface GeoFeatureCollection {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: GeoFeatureProps;
    geometry: unknown;
  }>;
}

export interface FacilityProps {
  id: number;
  name: string;
  type: string;
  careLevel: "primary" | "secondary" | "tertiary";
  ownership: string;
  /** Facility-list version recorded for the facility's state (e.g. GRID3 release). */
  sourceVersion: string | null;
}
