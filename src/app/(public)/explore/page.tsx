import type { Metadata } from "next";
import { Suspense } from "react";
import { env } from "@/env";
import { listIndicators } from "@/server/indicators/queries";
import { Skeleton } from "@/components/ui/misc";
import { Explorer, type ExplorerIndicator } from "./explorer";

/**
 * /explore — the map explorer. The page shell (indicator catalogue + map
 * style) is server-rendered and revalidated; all view state lives in the URL
 * (src/lib/map-state.ts) and is read client-side, so this route stays static
 * and cacheable for slow networks.
 */
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Map explorer",
  description:
    "Colour Nigeria's states, LGAs and wards by any population or health indicator, step through years, and open place profiles. Every value with its source.",
};

async function loadIndicators(): Promise<ExplorerIndicator[]> {
  try {
    const rows = await listIndicators();
    return rows.map((r) => ({
      code: r.code,
      name: r.name,
      category: r.category,
      unit: r.unit,
      valueType: r.valueType,
      decimals: r.decimals,
    }));
  } catch (err) {
    // Builds run without a database (Dockerfile); the page revalidates later.
    console.error("[explore] could not load indicator catalogue", err);
    return [];
  }
}

export default async function ExplorePage() {
  const indicators = await loadIndicators();
  return (
    <div className="mx-auto max-w-7xl px-3 py-4 sm:px-4">
      <div className="mb-3">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Map explorer</h1>
        <p className="text-sm text-muted-foreground">
          Pick an indicator, year and level. Hover or tap a place for its value; open it for the
          full profile.
        </p>
      </div>
      <Suspense fallback={<Skeleton className="h-[60vh] w-full" />}>
        <Explorer indicators={indicators} styleUrl={env.MAP_STYLE_URL} />
      </Suspense>
    </div>
  );
}
