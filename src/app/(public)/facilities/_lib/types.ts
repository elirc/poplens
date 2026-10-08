/**
 * Wire types between the facilities server queries and the client
 * components (type-only module; safe on both sides).
 */
import type { CareLevel, Ownership } from "./filters";

export interface FacilityListRow {
  id: number;
  name: string;
  type: string;
  careLevel: CareLevel;
  ownership: Ownership;
  lgaCode: string | null;
  lgaName: string | null;
  wardName: string | null;
  stateName: string | null;
  sourceVersion: string | null;
}

export interface FacilitySource {
  /** Publisher (or "Facility list" when the rows carry no dataset). */
  publisher: string;
  datasetTitle: string | null;
  sourceVersion: string | null;
  year: string | null;
  isSynthetic: boolean;
}

export interface NearestFacility {
  id: number;
  name: string;
  type: string;
  careLevel: CareLevel;
  ownership: Ownership;
  lgaCode: string | null;
  lgaName: string | null;
  lng: number;
  lat: number;
  /** Geodesic distance in metres (ST_Distance on geography). */
  meters: number;
}

export interface NearestResponse {
  point: { lng: number; lat: number };
  facilities: NearestFacility[];
}

export interface PpfRow {
  /** geo_units.id of the LGA (joins onto LGA GeoJSON `properties.id`). */
  id: number;
  code: string;
  name: string;
  stateName: string | null;
  value: number;
  isEstimate: boolean;
  sourceId: number;
}

export interface PpfSource {
  id: number;
  publisher: string;
  title: string;
  isSynthetic: boolean;
}

export interface PeoplePerFacilityByLga {
  indicator: {
    code: string;
    name: string;
    unit: string;
    valueType: "count" | "rate" | "percent" | "ratio" | "index";
    decimals: number;
    definition: string;
  };
  year: number | null;
  /** Sorted by value descending (most people per facility first). */
  rows: PpfRow[];
  sources: PpfSource[];
}
