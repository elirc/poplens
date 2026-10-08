/**
 * Wire types between the area-analysis server code and the client tool
 * (type-only module; safe on both sides).
 */

export type CareLevelKey = "primary" | "secondary" | "tertiary";

export interface FacilityCount {
  type: string;
  careLevel: CareLevelKey;
  count: number;
}

export interface FacilitySummary {
  total: number;
  byType: Array<{ type: string; count: number }>;
  byCareLevel: Record<CareLevelKey, number>;
  rows: FacilityCount[];
}

export interface AreaPopulation {
  /** Sum of pop_total over cells inside; null when no cell centre is inside. */
  total: number | null;
  /** null when no cell inside carries the field. */
  under5: number | null;
  women1549: number | null;
  /** Cells counted; under5Cells/women1549Cells < cells means partial coverage. */
  cells: number;
  under5Cells: number;
  women1549Cells: number;
}

export interface AreaPopulationSource {
  datasetId: number | null;
  datasetTitle: string | null;
  year: number;
  sourceVersion: string | null;
  publisher: string | null;
  sourceTitle: string | null;
  isSynthetic: boolean;
}

export interface LgaTouched {
  id: number;
  code: string;
  name: string;
  stateName: string | null;
}

export interface AreaFacilitySource {
  publisher: string;
  datasetTitle: string | null;
  sourceVersion: string | null;
  isSynthetic: boolean;
}

export interface AreaAnalysisResult {
  shapeAreaSqKm: number;
  population: AreaPopulation;
  /** null when no population grid is loaded/published at all. */
  populationSource: AreaPopulationSource | null;
  facilities: FacilitySummary;
  /** Sources/versions of the facilities counted (empty when none inside). */
  facilitySources: AreaFacilitySource[];
  /** Estimated people per facility; null when no population or no facilities. */
  peoplePerFacility: number | null;
  lgas: LgaTouched[];
}

/** "2 of 3 free analyses left today" state. */
export interface AreaQuotaView {
  planCode: string;
  /** null = unlimited. */
  limit: number | null;
  used: number;
  remaining: number | null;
  message: string;
}
