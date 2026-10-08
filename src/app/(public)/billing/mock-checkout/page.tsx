import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { env } from "@/env";
import { getCurrentUser } from "@/lib/session";
import { formatNaira } from "@/lib/format";
import { Alert } from "@/components/ui/misc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getPlan } from "@/server/billing/plans";
import { cancelMockCheckoutAction, completeMockCheckoutAction } from "../actions";

export const metadata: Metadata = { title: "Mock checkout", robots: { index: false } };

/**
 * Stand-in for Paystack's hosted checkout page in mock mode. "Pay" completes
 * the purchase through the same path as the real callback.
 */
export default async function MockCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (env.ADAPTER_PAYMENTS !== "mock") notFound();
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : (sp[k] as string | undefined)) ?? "";
  const reference = one("reference");
  const user = await getCurrentUser();
  if (!user) {
    const qs = new URLSearchParams(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : (v ?? "")]));
    redirect(`/sign-in?next=${encodeURIComponent(`/billing/mock-checkout?${qs.toString()}`)}`);
  }
  const m = /^mockpay_([a-z0-9_-]+)_/i.exec(reference);
  const plan = m ? await getPlan(m[1]) : null;
  const amount = Number(one("amount"));

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <Alert variant="warning" className="mb-4">
        Mock payments mode — no money moves and no external call is made. In production this step is Paystack&apos;s
        hosted checkout.
      </Alert>
      <Card>
        <CardHeader>
          <CardTitle>Pay PopLens</CardTitle>
          <CardDescription>
            {plan ? `${plan.name} plan · monthly` : "Unknown plan"} · {one("email") || user.email}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-3xl font-semibold" data-testid="mock-amount">
            {Number.isFinite(amount) && amount > 0 ? formatNaira(amount) : plan ? formatNaira(plan.priceKoboMonthly) : "—"}
          </p>
          <p className="break-all font-mono text-xs text-muted-foreground">Reference: {reference || "missing"}</p>
          {!plan && <Alert variant="destructive">This checkout link is not valid.</Alert>}
          <div className="flex gap-2">
            <form action={completeMockCheckoutAction}>
              <input type="hidden" name="reference" value={reference} />
              <Button type="submit" disabled={!plan}>
                Pay {plan ? formatNaira(plan.priceKoboMonthly) : ""}
              </Button>
            </form>
            <form action={cancelMockCheckoutAction}>
              <input type="hidden" name="reference" value={reference} />
              <Button type="submit" variant="outline">
                Cancel
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
