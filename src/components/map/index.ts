/**
 * Shared map components (client). Import from "@/components/map".
 * Data comes from the geo routes: /api/geo/levels/[level], /api/geo/unit/[code],
 * /api/geo/values, /api/geo/facilities and /api/tiles/{wards|lgas}/{z}/{x}/{y}.
 */
export { BaseMap, NIGERIA_BOUNDS, type BaseMapProps } from "./base-map";
export {
  ChoroplethLayer,
  choroplethFillLayerId,
  type ChoroplethLayerProps,
} from "./choropleth-layer";
export {
  FacilityLayer,
  FacilityLegend,
  FACILITY_COLORS,
  FACILITY_CLUSTER_COLOR,
  FACILITY_LEVEL_LABELS,
  facilityLayerIds,
  type FacilityLayerProps,
} from "./facility-layer";
export { facilitiesUrl, type FacilityFilters } from "./facility-url";
export { MapLegend, METHOD_LABELS, type MapLegendProps } from "./map-legend";
export { HoverPopup, type HoverPopupProps } from "./hover-popup";
export {
  computeScheme,
  colorFor,
  fillColorExpression,
  legendItems,
  pickColors,
  type ClassScheme,
  type LegendItem,
} from "./choropleth";
export { useJson, fetchJsonCached } from "./use-json";
export type * from "./types";
