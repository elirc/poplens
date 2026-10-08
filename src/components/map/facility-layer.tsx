"use client";

import { Layer, Source } from "react-map-gl/maplibre";
import type { ExpressionSpecification } from "maplibre-gl";
import { useJson } from "./use-json";
import { facilitiesUrl, type FacilityFilters } from "./facility-url";
import type { FacilityProps } from "./types";

/**
 * Health-facility points, clustered, coloured by level of care with the
 * Okabe-Ito palette (colour-blind safe). Generic for reuse: filter by
 * state / LGA / care levels / ownership / type, or pass your own `data`.
 *
 * Layer ids (for interactiveLayerIds): `${id}-clusters`, `${id}-points`.
 * Cluster features carry `cluster: true` + `point_count`; point features
 * carry FacilityProps.
 */

export const FACILITY_COLORS: Record<FacilityProps["careLevel"], string> = {
  primary: "#009E73",
  secondary: "#E69F00",
  tertiary: "#CC79A7",
};
export const FACILITY_CLUSTER_COLOR = "#0072B2";

export const FACILITY_LEVEL_LABELS: Record<FacilityProps["careLevel"], string> = {
  primary: "Primary care",
  secondary: "Secondary care",
  tertiary: "Tertiary care",
};

export const facilityLayerIds = (id = "facilities") => ({
  clusters: `${id}-clusters`,
  clusterCount: `${id}-cluster-count`,
  points: `${id}-points`,
});

export interface FacilityLayerProps {
  id?: string;
  filters?: FacilityFilters;
  /** Supply data directly (skips the fetch). */
  data?: GeoJSON.FeatureCollection;
  visible?: boolean;
  /** Clustering on by default; turn off for small LGA-level lists. */
  cluster?: boolean;
}

const pointColor: ExpressionSpecification = [
  "match",
  ["get", "careLevel"],
  "primary",
  FACILITY_COLORS.primary,
  "secondary",
  FACILITY_COLORS.secondary,
  "tertiary",
  FACILITY_COLORS.tertiary,
  "#56B4E9",
];

export function FacilityLayer({
  id = "facilities",
  filters,
  data,
  visible = true,
  cluster = true,
}: FacilityLayerProps) {
  const url = data || !visible ? null : facilitiesUrl(filters);
  const fetched = useJson<GeoJSON.FeatureCollection>(url);
  const fc = data ?? fetched.data;
  if (!visible || !fc) return null;
  const ids = facilityLayerIds(id);

  return (
    <Source
      id={id}
      type="geojson"
      data={fc}
      cluster={cluster}
      clusterRadius={40}
      clusterMaxZoom={11}
    >
      <Layer
        id={ids.clusters}
        type="circle"
        filter={["has", "point_count"]}
        paint={{
          "circle-color": FACILITY_CLUSTER_COLOR,
          "circle-opacity": 0.85,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.5,
          "circle-radius": ["step", ["get", "point_count"], 12, 50, 16, 250, 21, 1000, 26],
        }}
      />
      <Layer
        id={ids.clusterCount}
        type="symbol"
        filter={["has", "point_count"]}
        layout={{
          "text-field": ["get", "point_count_abbreviated"],
          "text-size": 11,
          "text-font": ["Noto Sans Regular"],
        }}
        paint={{ "text-color": "#ffffff" }}
      />
      <Layer
        id={ids.points}
        type="circle"
        filter={["!", ["has", "point_count"]]}
        paint={{
          "circle-color": pointColor,
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 3.5, 12, 6],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1,
        }}
      />
    </Source>
  );
}

/** Small key for the facility layer (colours + labels). */
export function FacilityLegend({ className }: { className?: string }) {
  return (
    <ul className={`flex flex-wrap gap-x-3 gap-y-1 text-xs ${className ?? ""}`} aria-label="Facility layer key">
      {(Object.keys(FACILITY_COLORS) as Array<FacilityProps["careLevel"]>).map((k) => (
        <li key={k} className="flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-3 rounded-full border border-white shadow-sm"
            style={{ background: FACILITY_COLORS[k] }}
            aria-hidden
          />
          {FACILITY_LEVEL_LABELS[k]}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span
          className="inline-block h-3 w-3 rounded-full border border-white shadow-sm"
          style={{ background: FACILITY_CLUSTER_COLOR }}
          aria-hidden
        />
        Cluster (count)
      </li>
    </ul>
  );
}
