import { unstable_cache } from "next/cache";
import {
  loadCompare,
  loadIndicatorOptions,
  loadOutbreaks,
  loadPlaceOptions,
  loadRankings,
  loadRelationships,
  loadTrends,
} from "./loaders";

/**
 * Cached wrappers for the analytics loaders. The pages read searchParams and
 * are therefore dynamic; the data behind each distinct URL is cached here for
 * ANALYTICS_REVALIDATE seconds (arguments are part of the cache key; results
 * are plain JSON). Publishing calls revalidatePath("/", "layout"), which also
 * refreshes these entries.
 */
export const ANALYTICS_REVALIDATE = 300;

const opts = { revalidate: ANALYTICS_REVALIDATE, tags: ["published-data", "analytics"] };

export const cachedIndicatorOptions = unstable_cache(loadIndicatorOptions, ["analytics-indicators"], opts);
export const cachedPlaceOptions = unstable_cache(loadPlaceOptions, ["analytics-places"], opts);
export const cachedCompare = unstable_cache(loadCompare, ["analytics-compare"], opts);
export const cachedRankings = unstable_cache(loadRankings, ["analytics-rankings"], opts);
export const cachedTrends = unstable_cache(loadTrends, ["analytics-trends"], opts);
export const cachedRelationships = unstable_cache(loadRelationships, ["analytics-relationships"], opts);
export const cachedOutbreaks = unstable_cache(loadOutbreaks, ["analytics-outbreaks"], opts);
