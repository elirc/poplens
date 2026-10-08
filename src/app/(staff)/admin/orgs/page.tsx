import type { Metadata } from "next";
import Link from "next/link";
import { asc, desc, eq, ilike, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmSubmitButton, SubmitButton } from "@/components/account/submit-button";
import { Flash, flashFrom, one, PageTitle, When } from "@/components/account/ui";
import { AdminNav, Pagination, pageFrom } from "@/components/admin/pagination";
import { addOrgMemberAction, removeOrgMemberAction } from "../actions";
import { requireAdminPage } from "../_gate";
import { likePattern, orgSeatInfo } from "../queries";

export const metadata: Metadata = { title: "Organisations · Admin" };

const PAGE_SIZE = 25;

async function OrgDetail({ orgId }: { orgId: string }) {
  const [org] = await db.select().from(schema.organization).where(eq(schema.organization.id, orgId)).limit(1);
  if (!org) return <p className="text-sm text-muted-foreground">Organisation not found.</p>;
  const [members, seats] = await Promise.all([
    db
      .select({
        id: schema.member.id,
        role: schema.member.role,
        createdAt: schema.member.createdAt,
        email: schema.user.email,
        name: schema.user.name,
      })
      .from(schema.member)
      .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
      .where(eq(schema.member.organizationId, orgId))
      .orderBy(asc(schema.member.createdAt)),
    orgSeatInfo(orgId),
  ]);
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {org.name} <Badge variant="outline">{org.slug}</Badge>
          {seats && (
            <Badge variant={seats.used >= seats.seats ? "warning" : "secondary"}>
              {seats.planCode} · {seats.used}/{seats.seats} seats
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Since</TableHead>
              <TableHead className="text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => (
              <TableRow key={m.id}>
                <TableCell>
                  <p>{m.name}</p>
                  <p className="text-xs text-muted-foreground">{m.email}</p>
                </TableCell>
                <TableCell>{m.role}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  <When d={m.createdAt} />
                </TableCell>
                <TableCell className="text-right">
                  <form action={removeOrgMemberAction}>
                    <input type="hidden" name="memberId" value={m.id} />
                    <input type="hidden" name="organizationId" value={orgId} />
                    <ConfirmSubmitButton size="sm" variant="ghost" confirmText={`Remove ${m.email} from ${org.name}?`}>
                      Remove
                    </ConfirmSubmitButton>
                  </form>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <form action={addOrgMemberAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="organizationId" value={orgId} />
          <div className="space-y-1.5">
            <Label htmlFor="member-email">Add member by email</Label>
            <Input id="member-email" name="email" type="email" required className="w-64" />
          </div>
          <Select name="role" defaultValue="member" className="w-32" aria-label="Member role">
            <option value="member">member</option>
            <option value="admin">admin</option>
            <option value="owner">owner</option>
          </Select>
          <SubmitButton size="default" pendingText="Adding…">
            Add
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

export default async function AdminOrgsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPage();
  const sp = await searchParams;
  const flash = flashFrom(sp);
  const q = one(sp.q)?.trim() ?? "";
  const orgId = one(sp.org);
  const page = pageFrom(sp.page);
  const where = q ? ilike(schema.organization.name, likePattern(q)) : undefined;

  const [rows, total] = await Promise.all([
    db
      .select({
        id: schema.organization.id,
        name: schema.organization.name,
        createdAt: schema.organization.createdAt,
        members: sql<number>`(SELECT count(*)::int FROM members m WHERE m.organization_id = ${schema.organization.id})`,
        plan: sql<string | null>`(SELECT s.plan_code FROM subscriptions s WHERE s.organization_id = ${schema.organization.id} AND s.status = 'active' ORDER BY s.id DESC LIMIT 1)`,
      })
      .from(schema.organization)
      .where(where)
      .orderBy(desc(schema.organization.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.organization).where(where),
  ]);

  return (
    <div>
      <AdminNav active="/admin/orgs" />
      <PageTitle title="Organisations" />
      <Flash {...flash} />
      {orgId && <OrgDetail orgId={orgId} />}
      <form className="mb-4 flex gap-2" role="search">
        <Input name="q" defaultValue={q} placeholder="Search organisations" className="max-w-xs" />
        <button type="submit" className="h-9 rounded-md border border-border px-3 text-sm hover:bg-muted">
          Search
        </button>
      </form>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No organisations yet. They are created when a user buys the Organisation plan.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Organisation</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead className="text-right">Members</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((o) => (
              <TableRow key={o.id}>
                <TableCell>
                  <Link href={`/admin/orgs?org=${encodeURIComponent(o.id)}`} className="font-medium underline-offset-2 hover:underline">
                    {o.name}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant={o.plan ? "success" : "secondary"}>{o.plan ?? "none"}</Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">{o.members}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  <When d={o.createdAt} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Pagination basePath="/admin/orgs" params={{ q }} page={page} pageSize={PAGE_SIZE} total={total[0]?.n ?? 0} />
    </div>
  );
}
