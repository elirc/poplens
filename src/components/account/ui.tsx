import Link from "next/link";
import { Alert } from "@/components/ui/misc";
import { formatLagosDate } from "@/lib/format";

/** Shared presentational bits for account + admin pages (server components). */

export function Flash({ ok, error }: { ok?: string; error?: string }) {
  if (!ok && !error) return null;
  return (
    <div className="mb-4 space-y-2">
      {ok && <Alert role="status">{ok}</Alert>}
      {error && <Alert variant="destructive">{error}</Alert>}
    </div>
  );
}

export function flashFrom(sp: Record<string, string | string[] | undefined>): { ok?: string; error?: string } {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  return { ok: one(sp.ok), error: one(sp.error) };
}

export function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function When({ d }: { d: Date | string | null | undefined }) {
  if (!d) return <span className="text-muted-foreground">—</span>;
  const date = new Date(d);
  return (
    <time dateTime={date.toISOString()}>
      {formatLagosDate(date)}{" "}
      {date.toLocaleTimeString("en-NG", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit" })}
    </time>
  );
}

export function SubNav({ items, active, label }: { items: Array<[string, string]>; active: string; label: string }) {
  return (
    <nav aria-label={label} className="-mx-1 mb-5 flex gap-1 overflow-x-auto pb-1 text-sm">
      {items.map(([href, text]) => (
        <Link
          key={href}
          href={href}
          aria-current={active === href ? "page" : undefined}
          className={
            "whitespace-nowrap rounded-md px-3 py-1.5 " +
            (active === href ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground")
          }
        >
          {text}
        </Link>
      ))}
    </nav>
  );
}

export const ACCOUNT_TABS: Array<[string, string]> = [
  ["/account", "Overview"],
  ["/account/views", "Saved views"],
  ["/account/reports", "Reports"],
  ["/account/api-keys", "API keys"],
  ["/account/billing", "Billing"],
];

export function AccountNav({ active }: { active: string }) {
  return <SubNav items={ACCOUNT_TABS} active={active} label="Account" />;
}

export function PageTitle({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <h1 className="text-xl font-semibold">{title}</h1>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}
