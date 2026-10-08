import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

/**
 * Embeds render without the site chrome (the shell lives in route-group
 * layouts, not the root layout), so iframes on other sites stay minimal.
 * Every embed shows its own source line, demo-data note and PopLens backlink.
 */
export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-3xl p-2">{children}</div>;
}
