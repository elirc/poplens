import { NextResponse } from "next/server";
import { env } from "@/env";
import { getCurrentUser } from "@/lib/session";
import { applyVerifiedPayment } from "@/server/billing/subscriptions";

export const dynamic = "force-dynamic";

/**
 * Hosted-checkout return URL (Paystack appends ?reference=&trxref=).
 * Re-verifies the transaction server-side and grants the plan — idempotent
 * with the charge.success webhook, whichever arrives first.
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const reference = url.searchParams.get("reference") ?? url.searchParams.get("trxref") ?? "";
  const to = (path: string) => NextResponse.redirect(new URL(path, env.APP_URL));
  if (!/^[A-Za-z0-9_-]{6,120}$/.test(reference)) return to("/account/billing?error=Missing+payment+reference");

  const user = await getCurrentUser();
  if (!user) {
    return to(`/sign-in?next=${encodeURIComponent(`/billing/callback?reference=${reference}`)}`);
  }
  try {
    const res = await applyVerifiedPayment({ reference, userId: user.id, via: "callback" });
    if (!res.ok) return to(`/account/billing?error=${encodeURIComponent(res.reason)}`);
    return to(`/account/billing?ok=${encodeURIComponent(`Payment received — you are on the ${res.planCode} plan`)}`);
  } catch (e) {
    console.error("[billing/callback] failed", e);
    return to("/account/billing?error=Could+not+confirm+the+payment+yet.+It+will+apply+when+Paystack+notifies+us.");
  }
}
