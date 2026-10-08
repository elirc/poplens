import type { Metadata } from "next";
import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { lagosDay } from "@/lib/limits";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { one, PageTitle } from "@/components/account/ui";
import { AdminNav, Pagination, pageFrom } from "@/components/admin/pagination";
import { requireAdminPage } from "../_gate";
import { likePattern } from "../queries";

export const metadata: Metadata = { title: "API usage · Admin" };

const PAGE_SIZE = 50;

export default async function AdminUsagePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPage();
  const sp = await searchParams;
  const dayRaw = one(sp.day) ?? "";
  const day = /^\d{4}-\d{2}-\d{2}$/.test(dayRaw) ? dayRaw : "";
  const q = one(sp.q)?.trim() ?? "";
  const page = pageFrom(sp.page);

  const conds = [];
  if (day) conds.push(eq(schema.apiUsage.day, day));
  if (q) conds.push(ilike(schema.user.email, likePattern(q)));
  const where = conds.length ? and(...conds) : undefined;

  const base = () =>
    db
      .select({
        day: schema.apiUsage.day,
        count: schema.apiUsage.count,
        keyId: schema.apiKeys.id,
        keyName: schema.apiKeys.name,
        prefix: schema.apiKeys.prefix,
        revokedAt: schema.apiKeys.revokedAt,
        email: schema.user.email,
      })
      .from(schema.apiUsage)
      .innerJoin(schema.apiKeys, eq(schema.apiKeys.id, schema.apiUsage.apiKeyId))
      .leftJoin(schema.user, eq(schema.user.id, schema.apiKeys.userId));

  const [rows, total, today] = await Promise.all([
    base()
      .where(where)
      .orderBy(desc(schema.apiUsage.day), desc(schema.apiUsage.count))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.apiUsage)
      .innerJoin(schema.apiKeys, eq(schema.apiKeys.id, schema.apiUsage.apiKeyId))
      .leftJoin(schema.user, eq(schema.user.id, schema.apiKeys.userId))
      .where(where),
    db
      .select({
        requests: sql<number>`coalesce(sum(${schema.apiUsage.count}), 0)::int`,
        keys: sql<number>`count(*)::int`,
      })
      .from(schema.apiUsage)
      .where(eq(schema.apiUsage.day, lagosDay())),
  ]);

  return (
    <div>
      <AdminNav active="/admin/usage" />
      <PageTitle title="API usage" />
      <p className="mb-4 text-sm text-muted-foreground">
        Today ({lagosDay()}, Africa/Lagos): {(today[0]?.requests ?? 0).toLocaleString("en-NG")} requests across{" "}
        {today[0]?.keys ?? 0} keys. Counts are per key per day (the quota store).
      </p>
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <Input name="day" type="date" defaultValue={day} className="w-44" aria-label="Day" />
        <Input name="q" defaultValue={q} placeholder="Owner email" className="max-w-xs" />
        <button type="submit" className="h-9 rounded-md border border-border px-3 text-sm hover:bg-muted">
          Filter
        </button>
      </form>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Day</TableHead>
            <TableHead>Key</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead className="text-right">Requests</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={`${r.keyId}-${r.day}`}>
              <TableCell className="whitespace-nowrap">{r.day}</TableCell>
              <TableCell>
                <span className="font-medium">{r.keyName}</span>{" "}
                <span className="font-mono text-xs text-muted-foreground">{r.prefix}…</span>{" "}
                {r.revokedAt && <Badge variant="destructive">revoked</Badge>}
              </TableCell>
              <TableCell className="break-all text-sm">{r.email ?? "—"}</TableCell>
              <TableCell className="text-right tabular-nums">{r.count.toLocaleString("en-NG")}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {rows.length === 0 && <p className="mt-3 text-sm text-muted-foreground">No API usage recorded.</p>}
      <Pagination basePath="/admin/usage" params={{ day, q }} page={page} pageSize={PAGE_SIZE} total={total[0]?.n ?? 0} />
    </div>
  );
}
