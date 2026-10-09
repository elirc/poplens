import type { Metadata } from "next";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SubmitButton } from "@/components/account/submit-button";
import { Flash, flashFrom, one, PageTitle, When } from "@/components/account/ui";
import { AdminNav, Pagination, pageFrom } from "@/components/admin/pagination";
import { changeUserRoleAction } from "../actions";
import { requireAdminPage } from "../_gate";
import { likePattern } from "../queries";

export const metadata: Metadata = { title: "Users · Admin" };

const PAGE_SIZE = 25;
const ROLES = ["user", "data_editor", "content_editor", "admin"] as const;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const me = await requireAdminPage();
  const sp = await searchParams;
  const flash = flashFrom(sp);
  const q = one(sp.q)?.trim() ?? "";
  const role = ROLES.find((r) => r === one(sp.role));
  const page = pageFrom(sp.page);

  const conds = [];
  if (q) {
    const p = likePattern(q);
    conds.push(or(ilike(schema.user.email, p), ilike(schema.user.name, p), ilike(schema.user.phoneNumber, p))!);
  }
  if (role) conds.push(eq(schema.user.role, role));
  const where = conds.length ? and(...conds) : undefined;

  // Effective plan: own active subscription, else an active org subscription.
  // The outer column must be qualified by hand: drizzle renders an
  // interpolated column ref unqualified here, and inside the subquery a bare
  // "id" resolves to the subquery's own table (s.id is an integer → the
  // whole page 500s with `text = integer`).
  const planExpr = sql<string | null>`coalesce(
    (SELECT s.plan_code FROM subscriptions s WHERE s.user_id = "users"."id" AND s.status = 'active' ORDER BY s.id DESC LIMIT 1),
    (SELECT s.plan_code FROM members m JOIN subscriptions s ON s.organization_id = m.organization_id
      WHERE m.user_id = "users"."id" AND s.status = 'active' ORDER BY s.id DESC LIMIT 1)
  )`;

  const [rows, total] = await Promise.all([
    db
      .select({
        id: schema.user.id,
        name: schema.user.name,
        email: schema.user.email,
        phone: schema.user.phoneNumber,
        role: schema.user.role,
        createdAt: schema.user.createdAt,
        plan: planExpr,
      })
      .from(schema.user)
      .where(where)
      .orderBy(desc(schema.user.createdAt), asc(schema.user.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.user).where(where),
  ]);
  const returnTo = `/admin/users?${new URLSearchParams({ ...(q ? { q } : {}), ...(role ? { role } : {}), ...(page > 1 ? { page: String(page) } : {}) }).toString()}`;

  return (
    <div>
      <AdminNav active="/admin/users" />
      <PageTitle title="Users" />
      <Flash {...flash} />
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <Input name="q" defaultValue={q} placeholder="Search email, name or phone" className="max-w-xs" />
        <Select name="role" defaultValue={role ?? ""} className="w-44">
          <option value="">All roles</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r.replace("_", " ")}
            </option>
          ))}
        </Select>
        <button type="submit" className="h-9 rounded-md border border-border px-3 text-sm hover:bg-muted">
          Filter
        </button>
      </form>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead>Plan</TableHead>
            <TableHead>Joined</TableHead>
            <TableHead>Role</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((u) => (
            <TableRow key={u.id}>
              <TableCell>
                <p className="font-medium">{u.name}</p>
                <p className="break-all text-xs text-muted-foreground">
                  {u.email}
                  {u.phone ? ` · ${u.phone}` : ""}
                </p>
              </TableCell>
              <TableCell>
                <Badge variant={u.plan ? "success" : "secondary"}>{u.plan ?? "free"}</Badge>
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                <When d={u.createdAt} />
              </TableCell>
              <TableCell>
                {u.id === me.id ? (
                  <span className="text-sm">{u.role.replace("_", " ")} (you)</span>
                ) : (
                  <form action={changeUserRoleAction} className="flex items-center gap-2">
                    <input type="hidden" name="userId" value={u.id} />
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <Select name="role" defaultValue={u.role} className="w-40" aria-label={`Role for ${u.email}`}>
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r.replace("_", " ")}
                        </option>
                      ))}
                    </Select>
                    <SubmitButton size="sm" variant="outline" pendingText="…">
                      Save
                    </SubmitButton>
                  </form>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Pagination basePath="/admin/users" params={{ q, role }} page={page} pageSize={PAGE_SIZE} total={total[0]?.n ?? 0} />
    </div>
  );
}
