import type { Metadata } from "next";
import Link from "next/link";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { lagosDay } from "@/lib/limits";
import { AdminNav } from "@/components/admin/pagination";
import { PageTitle } from "@/components/account/ui";
import { requireAdminPage } from "./_gate";

export const metadata: Metadata = { title: "Platform admin" };

async function count(q: Promise<Array<{ n: number }>>): Promise<number> {
  const r = await q;
  return r[0]?.n ?? 0;
}

export default async function AdminHome() {
  await requireAdminPage();
  const n = sql<number>`count(*)::int`;
  const [users, orgs, activeSubs, activeKeys, apiToday, downloadsToday, auditToday] = await Promise.all([
    count(db.select({ n }).from(schema.user)),
    count(db.select({ n }).from(schema.organization)),
    count(db.select({ n }).from(schema.subscriptions).where(eq(schema.subscriptions.status, "active"))),
    count(db.select({ n }).from(schema.apiKeys).where(sql`${schema.apiKeys.revokedAt} IS NULL`)),
    count(
      db
        .select({ n: sql<number>`coalesce(sum(${schema.apiUsage.count}), 0)::int` })
        .from(schema.apiUsage)
        .where(eq(schema.apiUsage.day, lagosDay())),
    ),
    count(
      db
        .select({ n })
        .from(schema.downloadLog)
        .where(sql`${schema.downloadLog.createdAt} >= date_trunc('day', now() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos'`),
    ),
    count(
      db
        .select({ n })
        .from(schema.auditLog)
        .where(sql`${schema.auditLog.createdAt} >= date_trunc('day', now() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos'`),
    ),
  ]);
  const tiles: Array<[string, number, string]> = [
    ["Users", users, "/admin/users"],
    ["Organisations", orgs, "/admin/orgs"],
    ["Active subscriptions", activeSubs, "/admin/users"],
    ["Active API keys", activeKeys, "/admin/usage"],
    ["API requests today", apiToday, "/admin/usage"],
    ["Downloads today", downloadsToday, "/admin/downloads"],
    ["Audit events today", auditToday, "/admin/audit"],
  ];
  return (
    <div>
      <AdminNav active="/admin" />
      <PageTitle title="Platform admin" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map(([label, value, href]) => (
          <Link key={label} href={href} className="rounded-lg border border-border p-4 hover:bg-muted/50">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold tabular-nums">{value.toLocaleString("en-NG")}</p>
          </Link>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">“Today” is the current day in Africa/Lagos time.</p>
    </div>
  );
}
