"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { ReactNode, Ref } from "react";
import Map, {
  AttributionControl,
  NavigationControl,
  type MapLayerMouseEvent,
  type MapRef,
  type ViewStateChangeEvent,
} from "react-map-gl/maplibre";

/**
 * Shared MapLibre base map (react-map-gl v8). The style URL must come from
 * a server component (env.MAP_STYLE_URL) via props — never read env here.
 * Defaults frame Nigeria; pass `initialCamera` to restore a saved view.
 */

/** Nigeria bounding box [[west, south], [east, north]]. */
export const NIGERIA_BOUNDS: [[number, number], [number, number]] = [
  [2.67, 4.27],
  [14.68, 13.89],
];
/** Generous pan limit around Nigeria [west, south, east, north]. */
const MAX_BOUNDS: [number, number, number, number] = [-4, -1, 22, 20];

export interface BaseMapProps {
  styleUrl: string;
  initialCamera?: { lng: number; lat: number; zoom: number } | null;
  children?: ReactNode;
  interactiveLayerIds?: string[];
  cursor?: string;
  onClick?: (e: MapLayerMouseEvent) => void;
  onMouseMove?: (e: MapLayerMouseEvent) => void;
  onMouseOut?: (e: MapLayerMouseEvent) => void;
  onMoveEnd?: (e: ViewStateChangeEvent) => void;
  onLoad?: () => void;
  className?: string;
  /** Accessible label for the map region. */
  label?: string;
  ref?: Ref<MapRef>;
}

export function BaseMap({
  styleUrl,
  initialCamera,
  children,
  interactiveLayerIds,
  cursor,
  onClick,
  onMouseMove,
  onMouseOut,
  onMoveEnd,
  onLoad,
  className,
  label = "Map",
  ref,
}: BaseMapProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-lg border border-border ${className ?? "h-[60vh] min-h-[320px]"}`}
      role="region"
      aria-label={label}
    >
      <Map
        ref={ref}
        mapStyle={styleUrl}
        initialViewState={
          initialCamera
            ? { longitude: initialCamera.lng, latitude: initialCamera.lat, zoom: initialCamera.zoom }
            : { bounds: NIGERIA_BOUNDS, fitBoundsOptions: { padding: 16 } }
        }
        maxBounds={MAX_BOUNDS}
        minZoom={3.5}
        maxZoom={16}
        dragRotate={false}
        pitchWithRotate={false}
        touchPitch={false}
        attributionControl={false}
        interactiveLayerIds={interactiveLayerIds}
        cursor={cursor}
        onClick={onClick}
        onMouseMove={onMouseMove}
        onMouseOut={onMouseOut}
        onMoveEnd={onMoveEnd}
        onLoad={onLoad}
        style={{ width: "100%", height: "100%" }}
      >
        <NavigationControl position="top-right" showCompass={false} />
        <AttributionControl position="bottom-right" compact />
        {children}
      </Map>
    </div>
  );
}
