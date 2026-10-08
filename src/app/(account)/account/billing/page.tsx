import type { Metadata } from "next";
import Link from "next/link";
import { env } from "@/env";
import { formatLagosDate, formatNaira } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/misc";
import { ConfirmSubmitButton, SubmitButton } from "@/components/account/submit-button";
import { AccountNav, Flash, flashFrom, one, PageTitle } from "@/components/account/ui";
import { cancelSubscriptionAction, startCheckoutAction } from "@/app/(public)/billing/actions";
import { describeLimit, listPlans } from "@/server/billing/plans";
import { getBillingStatus, getOwnedOrganization } from "@/server/billing/subscriptions";

export const metadata: Metadata = { title: "Billing" };

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const flash = flashFrom(sp);
  const highlight = one(sp.plan);
  const [status, plans, ownedOrg] = await Promise.all([
    getBillingStatus(user.id),
    listPlans(),
    getOwnedOrganization(user.id),
  ]);
  const paid = plans.filter((p) => p.priceKoboMonthly > 0);
  const active = status.status === "active";
  const canCancel = active && (status.via === "user" || ownedOrg?.id === status.organization?.id);

  return (
    <div>
      <AccountNav active="/account/billing" />
      <PageTitle title="Billing" />
      <Flash {...flash} />
      {env.ADAPTER_PAYMENTS === "mock" && (
        <Alert variant="warning" className="mb-4">
          Payments are in mock mode: checkout uses a demo page and no money moves.
        </Alert>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Current plan: {status.planName}
            <Badge variant={active ? "success" : "secondary"} data-testid="billing-status">
              {active ? "active" : status.status === "none" ? "free" : status.status.replace("_", " ")}
            </Badge>
          </CardTitle>
          <CardDescription>
            {status.via === "organization" && status.organization
              ? `Provided by your organisation “${status.organization.name}”.`
              : active
                ? "Your personal subscription."
                : "Browsing is free. Upgrade for downloads, custom reports and the API."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {status.currentPeriodEnd && (
            <p>
              {active ? "Renews" : "Ended"} on {formatLagosDate(status.currentPeriodEnd)}.
            </p>
          )}
          {canCancel && (
            <form action={cancelSubscriptionAction}>
              <ConfirmSubmitButton
                variant="outline"
                size="sm"
                confirmText="Cancel your subscription? Paid features stop straight away."
              >
                Cancel subscription
              </ConfirmSubmitButton>
            </form>
          )}
          {active && status.via === "organization" && !canCancel && (
            <p className="text-muted-foreground">Only the organisation owner can change this plan.</p>
          )}
        </CardContent>
      </Card>

      <h2 className="mb-3 text-lg font-semibold">{active ? "Change plan" : "Upgrade"}</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {paid.map((p) => {
          const isCurrent = active && status.planCode === p.code;
          const needsOrg = p.limits.seats > 1;
          return (
            <Card key={p.code} className={highlight === p.code ? "border-emerald-600" : ""}>
              <CardHeader>
                <CardTitle>
                  {p.name} · {formatNaira(p.priceKoboMonthly)}
                  <span className="text-sm font-normal text-muted-foreground"> / month</span>
                </CardTitle>
                <CardDescription>
                  Downloads, custom reports, unlimited area analysis, API ({describeLimit(p.limits.apiRequestsPerDay, "requests")})
                  {needsOrg ? `, ${p.limits.seats} seats` : ""}.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isCurrent ? (
                  <Badge variant="success">Your current plan</Badge>
                ) : (
                  <form action={startCheckoutAction} className="space-y-3">
                    <input type="hidden" name="planCode" value={p.code} />
                    {needsOrg &&
                      (ownedOrg ? (
                        <p className="text-sm text-muted-foreground">For your organisation “{ownedOrg.name}”.</p>
                      ) : (
                        <div className="space-y-1.5">
                          <Label htmlFor={`org-${p.code}`}>Organisation name</Label>
                          <Input id={`org-${p.code}`} name="orgName" required maxLength={80} placeholder="e.g. Kano Health Research" />
                        </div>
                      ))}
                    <SubmitButton pendingText="Starting checkout…">Subscribe to {p.name}</SubmitButton>
                  </form>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
      <p className="mt-6 text-xs text-muted-foreground">
        Payments by Paystack. Prices are placeholders.{" "}
        <Link href="/pricing" className="underline">
          Compare plans
        </Link>
      </p>
    </div>
  );
}
