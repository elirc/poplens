import type { Metadata } from "next";
import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { one, PageTitle, When } from "@/components/account/ui";
import { AdminNav, Pagination, pageFrom } from "@/components/admin/pagination";
import { requireAdminPage } from "../_gate";
import { likePattern } from "../queries";

export const metadata: Metadata = { title: "Audit log · Admin" };

const PAGE_SIZE = 50;

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPage();
  const sp = await searchParams;
  const action = one(sp.action)?.trim() ?? "";
  const actor = one(sp.actor)?.trim() ?? "";
  const page = pageFrom(sp.page);

  const conds = [];
  // "dataset" matches dataset.publish, dataset.rollback, …; exact actions match too.
  if (action) conds.push(ilike(schema.auditLog.action, `${action.replace(/[%_\\]/g, (c) => `\\${c}`)}%`));
  if (actor) conds.push(ilike(schema.user.email, likePattern(actor)));
  const where = conds.length ? and(...conds) : undefined;

  const [rows, total, actions] = await Promise.all([
    db
      .select({
        id: schema.auditLog.id,
        createdAt: schema.auditLog.createdAt,
        action: schema.auditLog.action,
        entity: schema.auditLog.entity,
        entityId: schema.auditLog.entityId,
        detail: schema.auditLog.detail,
        email: schema.user.email,
      })
      .from(schema.auditLog)
      .leftJoin(schema.user, eq(schema.user.id, schema.auditLog.actorId))
      .where(where)
      .orderBy(desc(schema.auditLog.createdAt), desc(schema.auditLog.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.auditLog)
      .leftJoin(schema.user, eq(schema.user.id, schema.auditLog.actorId))
      .where(where),
    db.selectDistinct({ action: schema.auditLog.action }).from(schema.auditLog).orderBy(schema.auditLog.action).limit(200),
  ]);

  return (
    <div>
      <AdminNav active="/admin/audit" />
      <PageTitle title="Audit log" />
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <Input name="action" defaultValue={action} placeholder="Action (e.g. billing or user.role_change)" className="max-w-xs" list="audit-actions" />
        <datalist id="audit-actions">
          {actions.map((a) => (
            <option key={a.action} value={a.action} />
          ))}
        </datalist>
        <Input name="actor" defaultValue={actor} placeholder="Actor email" className="max-w-xs" />
        <button type="submit" className="h-9 rounded-md border border-border px-3 text-sm hover:bg-muted">
          Filter
        </button>
      </form>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Actor</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Entity</TableHead>
            <TableHead>Detail</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                <When d={r.createdAt} />
              </TableCell>
              <TableCell className="break-all text-sm">{r.email ?? "system"}</TableCell>
              <TableCell>
                <Badge variant="outline">{r.action}</Badge>
              </TableCell>
              <TableCell className="whitespace-nowrap text-xs">
                {r.entity ?? "—"}
                {r.entityId ? ` #${r.entityId}` : ""}
              </TableCell>
              <TableCell className="max-w-md">
                <code className="block truncate text-xs text-muted-foreground" title={r.detail ? JSON.stringify(r.detail) : ""}>
                  {r.detail ? JSON.stringify(r.detail).slice(0, 200) : ""}
                </code>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {rows.length === 0 && <p className="mt-3 text-sm text-muted-foreground">No audit entries match.</p>}
      <Pagination basePath="/admin/audit" params={{ action, actor }} page={page} pageSize={PAGE_SIZE} total={total[0]?.n ?? 0} />
    </div>
  );
}
