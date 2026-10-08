import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-border py-8 text-sm text-muted-foreground">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 sm:grid-cols-3">
        <div>
          <p className="font-medium text-foreground">PopLens</p>
          <p className="mt-1">
            Nigeria&apos;s population and health indicators, by place, with
            sources. Figures from modelled estimates are labelled as estimates.
          </p>
        </div>
        <nav className="grid gap-1">
          <Link href="/indicators" className="hover:text-foreground">
            Indicator catalogue
          </Link>
          <Link href="/updates" className="hover:text-foreground">
            Data updates
          </Link>
          <Link href="/cards" className="hover:text-foreground">
            Insight cards
          </Link>
          <Link href="/area" className="hover:text-foreground">
            Area analysis
          </Link>
        </nav>
        <nav className="grid gap-1">
          <Link href="/pricing" className="hover:text-foreground">
            Plans &amp; pricing
          </Link>
          <Link href="/docs/api" className="hover:text-foreground">
            API documentation
          </Link>
          <Link href="/about-data" className="hover:text-foreground">
            Sources &amp; licences
          </Link>
        </nav>
      </div>
    </footer>
  );
}
