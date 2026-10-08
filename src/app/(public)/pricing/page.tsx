import type { Metadata } from "next";
import Link from "next/link";
import { Check, Minus } from "lucide-react";
import { formatNaira } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { describeLimit, listPlans, type PlanRow } from "@/server/billing/plans";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "Pricing",
  description: "Browsing PopLens is free. Pro adds downloads, custom reports, unlimited area analysis and API access.",
};

function Feature({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      {on ? (
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-label="Included" />
      ) : (
        <Minus className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-label="Not included" />
      )}
      <span className={on ? "" : "text-muted-foreground"}>{children}</span>
    </li>
  );
}

function PlanCard({ plan }: { plan: PlanRow }) {
  const l = plan.limits;
  const free = plan.priceKoboMonthly === 0;
  const href = free ? "/sign-up" : `/account/billing?plan=${encodeURIComponent(plan.code)}`;
  return (
    <Card className={plan.code === "pro" ? "border-emerald-600 shadow-sm" : ""}>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>{plan.name}</CardTitle>
          {plan.code === "pro" && <Badge variant="success">Most popular</Badge>}
        </div>
        <CardDescription>
          <span className="text-2xl font-semibold text-foreground">{free ? "₦0" : formatNaira(plan.priceKoboMonthly)}</span>
          {!free && " / month"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-sm">
          <Feature on>Maps, profiles, rankings, compare, trends, stories</Feature>
          <Feature on>Save views and places</Feature>
          <Feature on={l.areaAnalysesPerDay !== 0}>{describeLimit(l.areaAnalysesPerDay, "area analyses")}</Feature>
          <Feature on={l.downloadsPerDay !== 0}>
            {l.downloadsPerDay === 0 ? "No downloads" : `${describeLimit(l.downloadsPerDay, "downloads")} (CSV & Excel)`}
          </Feature>
          <Feature on={l.customReports}>Custom PDF reports</Feature>
          <Feature on={l.apiAccess}>
            {l.apiAccess ? `API access — ${describeLimit(l.apiRequestsPerDay, "requests")}` : "No API access"}
          </Feature>
          <Feature on={l.seats > 1}>{l.seats > 1 ? `${l.seats} seats for your team` : "1 seat"}</Feature>
        </ul>
      </CardContent>
      <CardFooter>
        <Link
          href={href}
          className={
            "inline-flex h-9 w-full items-center justify-center rounded-md px-4 text-sm font-medium " +
            (free ? "border border-border hover:bg-muted" : "bg-primary text-primary-foreground hover:bg-primary/90")
          }
        >
          {free ? "Create a free account" : `Choose ${plan.name}`}
        </Link>
      </CardFooter>
    </Card>
  );
}

export default async function PricingPage() {
  let plans: PlanRow[] = [];
  try {
    plans = await listPlans();
  } catch {
    plans = [];
  }
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Pricing</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Browsing PopLens is free for everyone. Pro adds downloads, custom reports, unlimited area analysis and API
        access; Organisation adds seats for your team. Prices are placeholders while PopLens is in preview.
      </p>
      {plans.length === 0 ? (
        <p className="mt-8 text-muted-foreground">Plans are not available right now.</p>
      ) : (
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {plans.map((p) => (
            <PlanCard key={p.code} plan={p} />
          ))}
        </div>
      )}
      <div className="mt-10 grid gap-4 text-sm text-muted-foreground md:grid-cols-2">
        <p>
          Payments are handled by Paystack. Subscriptions renew monthly in Naira and can be cancelled at any time from
          your account; plan limits are enforced on our servers.
        </p>
        <p>
          Downloads and API responses only include datasets whose licence allows redistribution. See the{" "}
          <Link href="/docs/api" className="underline">
            API documentation
          </Link>{" "}
          for details.
        </p>
      </div>
    </div>
  );
}
