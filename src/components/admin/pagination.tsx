import Link from "next/link";
import { SubNav } from "@/components/account/ui";

/** Server-side pagination links that preserve the current filters. */
export function Pagination({
  basePath,
  params,
  page,
  pageSize,
  total,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  page: number;
  pageSize: number;
  total: number;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
    if (p > 1) qs.set("page", String(p));
    const s = qs.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
      <span>
        {from.toLocaleString("en-NG")}–{to.toLocaleString("en-NG")} of {total.toLocaleString("en-NG")}
      </span>
      <span className="flex gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className="rounded-md border border-border px-3 py-1 hover:bg-muted">
            Previous
          </Link>
        ) : null}
        <span className="px-1 py-1">
          Page {page} of {pages}
        </span>
        {page < pages ? (
          <Link href={href(page + 1)} className="rounded-md border border-border px-3 py-1 hover:bg-muted">
            Next
          </Link>
        ) : null}
      </span>
    </div>
  );
}

export const ADMIN_TABS: Array<[string, string]> = [
  ["/admin", "Overview"],
  ["/admin/users", "Users"],
  ["/admin/orgs", "Organisations"],
  ["/admin/plans", "Plans"],
  ["/admin/usage", "API usage"],
  ["/admin/downloads", "Download log"],
  ["/admin/audit", "Audit log"],
];

export function AdminNav({ active }: { active: string }) {
  return <SubNav items={ADMIN_TABS} active={active} label="Platform admin" />;
}

/** Parse ?page= safely. */
export function pageFrom(v: string | string[] | undefined): number {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isInteger(n) && n >= 1 && n <= 100_000 ? n : 1;
}
