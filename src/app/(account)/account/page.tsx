import type { Metadata } from "next";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getUserPlan, lagosDay } from "@/lib/limits";
import { requireUser } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SignOutButton } from "@/components/account/auth-forms";
import { SubmitButton } from "@/components/account/submit-button";
import { AccountNav, Flash, flashFrom, PageTitle } from "@/components/account/ui";
import { describeLimit } from "@/server/billing/plans";
import { updateProfileAction } from "./actions";

export const metadata: Metadata = { title: "Your account" };

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const flash = flashFrom(await searchParams);
  const [plan, profileRows, usage] = await Promise.all([
    getUserPlan(user.id),
    db
      .select({ phone: schema.user.phoneNumber, createdAt: schema.user.createdAt })
      .from(schema.user)
      .where(eq(schema.user.id, user.id))
      .limit(1),
    db
      .select({ kind: schema.usageCounters.kind, count: schema.usageCounters.count })
      .from(schema.usageCounters)
      .where(and(eq(schema.usageCounters.userId, user.id), eq(schema.usageCounters.day, lagosDay()))),
  ]);
  const used = (k: string) => usage.find((u) => u.kind === k)?.count ?? 0;
  const profile = profileRows[0];
  const tempEmail = user.email.endsWith("@phone.poplens.local");
  const l = plan.limits;

  return (
    <div>
      <AccountNav active="/account" />
      <PageTitle title="Your account">
        <SignOutButton />
      </PageTitle>
      <Flash {...flash} />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-[7rem_1fr] gap-y-1 text-sm">
              <dt className="text-muted-foreground">Email</dt>
              <dd className="break-all">{tempEmail ? <span className="text-muted-foreground">— (phone account)</span> : user.email}</dd>
              <dt className="text-muted-foreground">Phone</dt>
              <dd>{profile?.phone ?? <span className="text-muted-foreground">—</span>}</dd>
              <dt className="text-muted-foreground">Role</dt>
              <dd>{user.role.replace("_", " ")}</dd>
            </dl>
            <form action={updateProfileAction} className="space-y-2">
              <Label htmlFor="name">Display name</Label>
              <div className="flex gap-2">
                <Input id="name" name="name" defaultValue={user.name} maxLength={80} required />
                <SubmitButton size="default" pendingText="Saving…">
                  Save
                </SubmitButton>
              </div>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Plan <Badge variant={plan.planCode === "free" ? "secondary" : "success"}>{plan.planCode}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ul className="space-y-1">
              <li>
                Area analyses today: {used("area_analysis")}
                {l.areaAnalysesPerDay === null ? " (unlimited)" : ` of ${l.areaAnalysesPerDay}`}
              </li>
              <li>
                Downloads today: {used("download")}
                {l.downloadsPerDay === null ? " (unlimited)" : l.downloadsPerDay === 0 ? " (not included)" : ` of ${l.downloadsPerDay}`}
              </li>
              <li>Custom reports: {l.customReports ? "included" : "not included"}</li>
              <li>API: {l.apiAccess ? describeLimit(l.apiRequestsPerDay, "requests") : "not included"}</li>
            </ul>
            <div className="flex flex-wrap gap-3">
              <Link href="/account/billing" className="underline">
                {plan.planCode === "free" ? "Upgrade" : "Manage billing"}
              </Link>
              <Link href="/pricing" className="text-muted-foreground underline">
                Compare plans
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
      <div className="mt-6 grid gap-3 text-sm sm:grid-cols-3">
        <Link href="/account/views" className="rounded-lg border border-border p-4 hover:bg-muted/50">
          <p className="font-medium">Saved views</p>
          <p className="text-muted-foreground">Maps, comparisons and places you saved.</p>
        </Link>
        <Link href="/account/reports" className="rounded-lg border border-border p-4 hover:bg-muted/50">
          <p className="font-medium">Custom reports</p>
          <p className="text-muted-foreground">PDF reports with charts, tables and maps.</p>
        </Link>
        <Link href="/account/api-keys" className="rounded-lg border border-border p-4 hover:bg-muted/50">
          <p className="font-medium">API keys</p>
          <p className="text-muted-foreground">Programmatic access to published data.</p>
        </Link>
      </div>
    </div>
  );
}
