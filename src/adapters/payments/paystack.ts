import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/env";
import type { PaymentsAdapter } from "../types";

const BASE = "https://api.paystack.co";

function secret(): string {
  if (!env.PAYSTACK_SECRET_KEY) throw new Error("PAYSTACK_SECRET_KEY not set");
  return env.PAYSTACK_SECRET_KEY;
}

async function paystack<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret()}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const body = (await res.json()) as { status: boolean; message: string; data: T };
  if (!res.ok || !body.status) {
    throw new Error(`Paystack ${path} failed: ${res.status} ${body.message}`);
  }
  return body.data;
}

/**
 * Real driver: Paystack (https://paystack.com/docs/api/).
 * Subscriptions use transaction/initialize with a plan code; Paystack then
 * manages recurring charges and emits webhook events. Webhook signature is
 * HMAC-SHA512 of the raw body with the secret key (x-paystack-signature).
 */
export const paystackPayments: PaymentsAdapter = {
  async createCheckout(input) {
    const data = await paystack<{ authorization_url: string; reference: string }>(
      "/transaction/initialize",
      {
        method: "POST",
        body: JSON.stringify({
          email: input.email,
          amount: input.amountKobo,
          reference: input.reference,
          callback_url: input.callbackUrl,
          metadata: { ...input.metadata, planCode: input.planCode },
        }),
      },
    );
    return { checkoutUrl: data.authorization_url, reference: data.reference };
  },

  async verifyTransaction(reference) {
    const data = await paystack<{
      status: string;
      reference: string;
      paid_at: string | null;
      customer: { customer_code: string } | null;
      metadata: { planCode?: string } | null;
      plan_object?: { plan_code?: string } | null;
    }>(`/transaction/verify/${encodeURIComponent(reference)}`);
    return {
      status:
        data.status === "success"
          ? "success"
          : data.status === "failed"
            ? "failed"
            : "pending",
      reference: data.reference,
      planCode: data.metadata?.planCode ?? data.plan_object?.plan_code,
      customerCode: data.customer?.customer_code,
      paidAt: data.paid_at ?? undefined,
    };
  },

  verifyWebhookSignature(rawBody, signature) {
    const expected = createHmac("sha512", secret()).update(rawBody).digest("hex");
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  },

  async cancelSubscription(subscriptionCode) {
    // Disabling requires the email token from the subscription object.
    const sub = await paystack<{ email_token: string }>(
      `/subscription/${encodeURIComponent(subscriptionCode)}`,
    );
    await paystack("/subscription/disable", {
      method: "POST",
      body: JSON.stringify({ code: subscriptionCode, token: sub.email_token }),
    });
  },
};
