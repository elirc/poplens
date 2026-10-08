/** Display labels shared by indicator pages, profiles and the home page. */
import { MAP_LEVELS, exploreHref as mapExploreHref, type MapLevel } from "@/lib/map-state";

export const CATEGORY_ORDER = [
  "population",
  "health_outcomes",
  "health_services",
  "living_conditions",
  "outbreaks",
] as const;

export const CATEGORY_LABEL: Record<string, string> = {
  population: "Population",
  health_outcomes: "Health outcomes",
  health_services: "Health services",
  living_conditions: "Living conditions",
  outbreaks: "Outbreaks",
};

export const LEVEL_LABEL: Record<string, string> = {
  nation: "Country",
  zone: "Zone",
  state: "State",
  lga: "LGA",
  ward: "Ward",
};

export const LEVEL_PLURAL: Record<string, string> = {
  nation: "countries",
  zone: "zones",
  state: "states",
  lga: "LGAs",
  ward: "wards",
};

export const VALUE_TYPE_LABEL: Record<string, string> = {
  count: "Count",
  rate: "Rate",
  percent: "Percentage",
  ratio: "Ratio",
  index: "Index",
};

export const AGGREGATION_LABEL: Record<string, string> = {
  sum: "Summed from smaller areas",
  population_weighted_mean: "Population-weighted average of smaller areas",
  mean: "Simple average of smaller areas",
  none: "Not aggregated — shown only at the levels the source publishes",
};

export function directionLabel(higherIsBetter: boolean | null): string {
  if (higherIsBetter === true) return "Higher is better";
  if (higherIsBetter === false) return "Lower is better";
  return "Neither direction is better";
}

/**
 * Deep link into the map explorer, via A3's URL contract (src/lib/map-state.ts).
 * Levels the explorer cannot colour (nation/zone) fall back to states.
 */
export function exploreHref(
  code: string,
  year?: number | null,
  level: string = "state",
  parentStateCode?: string | null,
): string {
  const mapLevel: MapLevel = (MAP_LEVELS as readonly string[]).includes(level)
    ? (level as MapLevel)
    : "state";
  return mapExploreHref({
    indicator: code,
    year: year ?? null,
    level: mapLevel,
    parent: mapLevel === "lga" ? (parentStateCode ?? null) : null,
  });
}
