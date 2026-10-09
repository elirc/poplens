"use client";

import { useMemo } from "react";
import { Layer, Source } from "react-map-gl/maplibre";
import type { ExpressionSpecification } from "maplibre-gl";
import { NO_DATA_COLOR } from "@/lib/class-breaks";
import type { GeoFeatureCollection } from "./types";

/**
 * Filled polygons coloured by a precomputed fill expression (see
 * `fillColorExpression` in ./choropleth). Two data modes:
 *  - `geojson`: simplified state/LGA FeatureCollection (properties id/code/name);
 *  - `tiles`:   MVT tile route (wards/LGAs), source-layer = `sourceLayer`.
 * Layer ids are `${id}-fill`, `${id}-line`, `${id}-hover` — add `${id}-fill`
 * to the map's interactiveLayerIds for hover/click.
 */

type DataProps =
  | { mode: "geojson"; data: GeoFeatureCollection }
  | {
      mode: "tiles";
      /** Path template, e.g. "/api/tiles/wards/{z}/{x}/{y}" (made absolute client-side). */
      tilePath: string;
      sourceLayer: string;
      minzoom?: number;
      maxzoom?: number;
    };

export type ChoroplethLayerProps = DataProps & {
  id: string;
  fillColor: ExpressionSpecification | string;
  /** geo_units.id currently hovered/selected (outlined). */
  highlightId?: number | null;
  fillOpacity?: number;
  beforeId?: string;
};

export const choroplethFillLayerId = (id: string) => `${id}-fill`;

export function ChoroplethLayer(props: ChoroplethLayerProps) {
  const { id, fillColor, highlightId, fillOpacity = 0.78, beforeId } = props;
  const sourceLayer = props.mode === "tiles" ? props.sourceLayer : undefined;
  const tilePath = props.mode === "tiles" ? props.tilePath : null;

  const tilesUrl = useMemo(() => {
    if (!tilePath) return null;
    if (/^https?:\/\//.test(tilePath)) return tilePath;
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    return `${origin}${tilePath}`;
  }, [tilePath]);

  const highlightFilter: ExpressionSpecification = [
    "==",
    ["to-number", ["get", "id"], -1],
    highlightId ?? -1,
  ];

  const layers = (
    <>
      {/* source must be EXPLICIT: react-map-gl v8's <Source> injects it by
          cloning direct children only — these layers sit inside a fragment,
          so without the prop addLayer fires sourceless and maplibre rejects
          every layer (blank choropleths). */}
      <Layer
        id={`${id}-fill`}
        source={id}
        type="fill"
        {...(sourceLayer ? { "source-layer": sourceLayer } : {})}
        beforeId={beforeId}
        paint={{
          "fill-color": (fillColor || NO_DATA_COLOR) as ExpressionSpecification,
          "fill-opacity": fillOpacity,
        }}
      />
      <Layer
        id={`${id}-line`}
        source={id}
        type="line"
        {...(sourceLayer ? { "source-layer": sourceLayer } : {})}
        beforeId={beforeId}
        paint={{
          "line-color": "#ffffff",
          "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.4, 9, 1.2],
          "line-opacity": 0.9,
        }}
      />
      <Layer
        id={`${id}-hover`}
        source={id}
        type="line"
        {...(sourceLayer ? { "source-layer": sourceLayer } : {})}
        beforeId={beforeId}
        filter={highlightFilter}
        paint={{ "line-color": "#111827", "line-width": 2.2 }}
      />
    </>
  );

  if (props.mode === "geojson") {
    return (
      <Source id={id} type="geojson" data={props.data as GeoJSON.FeatureCollection} promoteId="id">
        {layers}
      </Source>
    );
  }
  if (!tilesUrl) return null;
  return (
    <Source
      id={id}
      type="vector"
      tiles={[tilesUrl]}
      minzoom={props.minzoom ?? 6}
      maxzoom={props.maxzoom ?? 12}
    >
      {layers}
    </Source>
  );
}
