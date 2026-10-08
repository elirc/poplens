import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";
import { DemoBanner } from "./demo-banner";

/**
 * The site shell (demo banner, header, footer) applied by route-group
 * layouts: (public), (auth), (account), (staff). /embed/** deliberately
 * renders without it so iframes stay chrome-free and cacheable.
 */
export function SiteChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <DemoBanner />
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
