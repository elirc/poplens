import type { TrendPoint } from "./trend-series";

/** Minimal structural shape of a published value (PublicValue from the queries contract). */
export interface PublishedLike {
  value: number;
  lower: number | null;
  upper: number | null;
  year: number;
  isEstimate: boolean;
  geoUnitId: number;
  sourceId: number;
  sourcePublisher: string;
}

/** Trim published rows down to the small payload a client chart needs. */
export function toTrendPoints(rows: PublishedLike[], geoUnitId?: number): TrendPoint[] {
  return rows
    .filter((r) => geoUnitId === undefined || r.geoUnitId === geoUnitId)
    .map((r) => ({
      year: Number(r.year),
      value: Number(r.value),
      lower: r.lower == null ? null : Number(r.lower),
      upper: r.upper == null ? null : Number(r.upper),
      isEstimate: Boolean(r.isEstimate),
      sourceId: Number(r.sourceId),
      sourceName: r.sourcePublisher,
    }));
}

/** Okabe-Ito categorical colours (COMMON.md). */
export const OKABE_ITO = [
  "#0072B2",
  "#E69F00",
  "#009E73",
  "#CC79A7",
  "#56B4E9",
  "#D55E00",
  "#F0E442",
] as const;
