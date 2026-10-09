import Link from "next/link";
import { MobileNav } from "./mobile-nav";
import { HeaderAccount } from "./header-account";

const NAV = [
  { href: "/explore", label: "Map" },
  { href: "/rankings", label: "Rankings" },
  { href: "/compare", label: "Compare" },
  { href: "/trends", label: "Trends" },
  { href: "/facilities", label: "Facilities" },
  { href: "/outbreaks", label: "Outbreaks" },
  { href: "/stories", label: "Stories" },
];

/**
 * Stateless server shell + a client-side account corner (HeaderAccount), so
 * chromed public pages remain static/ISR-cacheable.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
        <Link href="/" className="flex items-center gap-1.5 font-semibold">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-600" />
          PopLens
        </Link>
        <nav className="hidden items-center gap-4 text-sm text-muted-foreground md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="transition-colors hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <HeaderAccount />
          <MobileNav items={NAV} />
        </div>
      </div>
    </header>
  );
}
