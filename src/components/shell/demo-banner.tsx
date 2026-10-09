import { isDemoDataLoaded } from "@/server/demo";

/**
 * Site-wide banner, shown while any published dataset is synthetic (spec).
 * Server component; cached with the page's revalidation window.
 */
export async function DemoBanner() {
  let demo = false;
  try {
    demo = await isDemoDataLoaded();
  } catch (e) {
    // In production (including `next build` prerendering) a failed check
    // must fail the render — otherwise a transient DB error bakes a page
    // WITHOUT the legally-required synthetic-data banner into the ISR cache.
    // ISR keeps serving the previous good page when a revalidation throws.
    if (process.env.NODE_ENV === "production") throw e;
    // Dev nicety: database not migrated yet — render without the banner.
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
