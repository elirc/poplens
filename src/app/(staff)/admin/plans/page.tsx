import type { Metadata } from "next";
import { formatNaira } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/misc";
import { SubmitButton } from "@/components/account/submit-button";
import { Flash, flashFrom, PageTitle } from "@/components/account/ui";
import { AdminNav } from "@/components/admin/pagination";
import { listPlans, type PlanRow } from "@/server/billing/plans";
import { savePlanAction } from "../actions";
import { requireAdminPage } from "../_gate";

export const metadata: Metadata = { title: "Plans · Admin" };

function NumberField({ id, name, label, value, hint }: { id: string; name: string; label: string; value: number | null; hint: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={name} type="number" min={0} defaultValue={value ?? ""} placeholder="Unlimited" />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function PlanForm({ plan }: { plan?: PlanRow }) {
  const p = plan ? `p-${plan.code}` : "p-new";
  const l = plan?.limits;
  return (
    <form action={savePlanAction} className="grid gap-3 sm:grid-cols-3">
      <input type="hidden" name="isNew" value={plan ? "0" : "1"} />
      <div className="space-y-1.5">
        <Label htmlFor={`${p}-code`}>Code</Label>
        {plan ? (
          <>
            <input type="hidden" name="code" value={plan.code} />
            <Input id={`${p}-code`} value={plan.code} disabled />
          </>
        ) : (
          <Input id={`${p}-code`} name="code" required pattern="[a-z][a-z0-9_]{1,31}" placeholder="e.g. edu" />
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${p}-name`}>Name</Label>
        <Input id={`${p}-name`} name="name" required defaultValue={plan?.name} maxLength={60} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${p}-price`}>Price (₦ / month)</Label>
        <Input id={`${p}-price`} name="priceNaira" type="number" min={0} step="1" required defaultValue={plan ? plan.priceKoboMonthly / 100 : 0} />
      </div>
      <NumberField id={`${p}-dl`} name="downloadsPerDay" label="Downloads / day" value={l ? l.downloadsPerDay : 0} hint="Empty = unlimited, 0 = none" />
      <NumberField id={`${p}-area`} name="areaAnalysesPerDay" label="Area analyses / day" value={l ? l.areaAnalysesPerDay : 3} hint="Empty = unlimited" />
      <NumberField id={`${p}-api`} name="apiRequestsPerDay" label="API requests / day (per key)" value={l ? l.apiRequestsPerDay : 0} hint="Empty = unlimited" />
      <div className="space-y-1.5">
        <Label htmlFor={`${p}-seats`}>Seats</Label>
        <Input id={`${p}-seats`} name="seats" type="number" min={1} required defaultValue={l?.seats ?? 1} />
        <p className="text-xs text-muted-foreground">More than 1 = organisation plan</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${p}-pstk`}>Paystack plan code</Label>
        <Input id={`${p}-pstk`} name="paystackPlanCode" defaultValue={plan?.paystackPlanCode ?? ""} placeholder="PLN_…" />
      </div>
      <div className="flex flex-col justify-center gap-2 text-sm">
        <label className="flex items-center gap-2">
          <Checkbox name="customReports" defaultChecked={l?.customReports ?? false} /> Custom reports
        </label>
        <label className="flex items-center gap-2">
          <Checkbox name="apiAccess" defaultChecked={l?.apiAccess ?? false} /> API access
        </label>
      </div>
      <div className="sm:col-span-3">
        <SubmitButton size="sm" pendingText="Saving…">
          {plan ? "Save plan" : "Create plan"}
        </SubmitButton>
      </div>
    </form>
  );
}

export default async function AdminPlansPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPage();
  const flash = flashFrom(await searchParams);
  const plans = await listPlans();
  return (
    <div>
      <AdminNav active="/admin/plans" />
      <PageTitle title="Plans" />
      <Flash {...flash} />
      <p className="mb-4 text-sm text-muted-foreground">
        Limits are enforced on the server for every user on the plan. Changes apply immediately and are audited.
      </p>
      <div className="space-y-4">
        {plans.map((plan) => (
          <Card key={plan.code}>
            <CardHeader>
              <CardTitle>
                {plan.name} <span className="text-sm font-normal text-muted-foreground">· {formatNaira(plan.priceKoboMonthly)} / month</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PlanForm plan={plan} />
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardHeader>
            <CardTitle>New plan</CardTitle>
          </CardHeader>
          <CardContent>
            <PlanForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
