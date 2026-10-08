import { isDemoDataLoaded } from "@/server/demo";

/**
 * Site-wide banner, shown while any published dataset is synthetic (spec).
 * Server component; cached with the page's revalidation window.
 */
export async function DemoBanner() {
  let demo = false;
  try {
    demo = await isDemoDataLoaded();
  } catch {
    // Database not ready (first boot) — show nothing rather than crash.
    return null;
  }
  if (!demo) return null;
  return (
    <div className="bg-amber-400 px-4 py-1.5 text-center text-sm font-medium text-amber-950">
      Demo data — the figures on this site are synthetic examples, not real
      statistics.
    </div>
  );
}
