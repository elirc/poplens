import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { SearchBox } from "@/components/search/search-box";
import { Skeleton } from "@/components/ui/misc";
import { FeaturedCards, HeadlineFigures, LatestStories } from "@/components/home/home-sections";

export const revalidate = 300;

/**
 * Home: light hero with the combined place + indicator search, headline
 * national figures, featured insight cards and latest stories. No map here —
 * visitors are mostly on slow phone connections.
 */

function HomeSection({
  id,
  title,
  more,
  children,
}: {
  id: string;
  title: string;
  more?: { href: string; label: string };
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id={id} className="text-lg font-semibold tracking-tight">
          {title}
        </h2>
        {more && (
          <Link href={more.href} className="text-sm text-emerald-700 hover:underline">
            {more.label} →
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

const grid = (n: number, h: string) => (
  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
    {Array.from({ length: n }, (_, i) => (
      <Skeleton key={i} className={h} />
    ))}
  </div>
);

export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-8 sm:py-12">
      <section className="space-y-4">
        <h1 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
          Nigeria&apos;s population and health, by place
        </h1>
        <p className="max-w-xl text-muted-foreground">
          Clear numbers, maps and comparisons for every state, LGA and ward — each with its
          source and year.
        </p>
        <div className="max-w-2xl">
          <SearchBox />
        </div>
        <p className="text-sm text-muted-foreground">
          Or start from the <Link href="/explore" className="text-emerald-700 hover:underline">map</Link>,{" "}
          <Link href="/rankings" className="text-emerald-700 hover:underline">rankings</Link> or the{" "}
          <Link href="/indicators" className="text-emerald-700 hover:underline">indicator catalogue</Link>.
        </p>
      </section>

      <HomeSection id="headline" title="Nigeria at a glance" more={{ href: "/places/NG", label: "National profile" }}>
        <Suspense fallback={grid(8, "h-28")}>
          <HeadlineFigures />
        </Suspense>
      </HomeSection>

      <HomeSection id="cards" title="Featured insights">
        <Suspense fallback={grid(4, "h-24")}>
          <FeaturedCards />
        </Suspense>
      </HomeSection>

      <HomeSection id="stories" title="Latest stories" more={{ href: "/stories", label: "All stories" }}>
        <Suspense fallback={grid(3, "h-28")}>
          <LatestStories />
        </Suspense>
      </HomeSection>

      <p className="text-xs text-muted-foreground">
        Population figures are modelled estimates — Nigeria&apos;s last census was in 2006.{" "}
        <Link href="/about-data" className="hover:underline">
          About the data
        </Link>
      </p>
    </div>
  );
}
