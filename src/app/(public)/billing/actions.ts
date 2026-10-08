"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { env } from "@/env";
import { requireUser } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { applyVerifiedPayment, cancelSubscriptionFor, startCheckout } from "@/server/billing/subscriptions";

/**
 * Billing Server Actions. Checkout start → adapter's hosted checkout (the
 * mock driver returns /billing/mock-checkout). The mock "Pay" button
 * completes the flow exactly like the real callback: verifyTransaction +
 * subscription upsert + audit, via applyVerifiedPayment.
 */

function fail(path: string, message: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(message.slice(0, 200))}`);
}

const checkoutInput = z.object({
  planCode: z.string().trim().min(1).max(32),
  orgName: z.string().trim().max(80).optional(),
});

export async function startCheckoutAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = checkoutInput.safeParse({
    planCode: fd.get("planCode"),
    orgName: (fd.get("orgName") as string | null) || undefined,
  });
  if (!parsed.success) fail("/account/billing", "Choose a plan");
  let url: string;
  try {
    const session = await startCheckout({
      userId: user.id,
      email: user.email,
      planCode: parsed.data.planCode,
      orgName: parsed.data.orgName ?? null,
    });
    url = session.checkoutUrl;
  } catch (e) {
    fail("/account/billing", e instanceof Error ? e.message : "Could not start checkout");
  }
  redirect(url);
}

const reference = z.string().trim().min(6).max(120).regex(/^[A-Za-z0-9_-]+$/);

/** Mock checkout "Pay" — mock payments driver only. */
export async function completeMockCheckoutAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  if (env.ADAPTER_PAYMENTS !== "mock") fail("/account/billing", "Mock checkout is disabled");
  const ref = reference.safeParse(fd.get("reference"));
  if (!ref.success) fail("/account/billing", "Invalid payment reference");
  const res = await applyVerifiedPayment({ reference: ref.data, userId: user.id, via: "mock-checkout" });
  if (!res.ok) fail("/account/billing", res.reason);
  redirect(`/account/billing?ok=${encodeURIComponent(`Payment received — you are on the ${res.planCode} plan`)}`);
}

export async function cancelMockCheckoutAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  const ref = reference.safeParse(fd.get("reference"));
  await writeAudit({
    actorId: user.id,
    action: "billing.checkout_abandon",
    entity: "payment",
    entityId: ref.success ? ref.data : undefined,
  });
  redirect("/account/billing?error=Checkout+cancelled");
}

export async function cancelSubscriptionAction(): Promise<void> {
  const user = await requireUser();
  let ok = false;
  try {
    ok = await cancelSubscriptionFor(user.id);
  } catch (e) {
    fail("/account/billing", e instanceof Error ? e.message : "Could not cancel");
  }
  redirect(ok ? "/account/billing?ok=Subscription+cancelled" : "/account/billing?error=No+active+subscription");
}
