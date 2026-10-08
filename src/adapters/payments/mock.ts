import { env } from "@/env";
import type { PaymentsAdapter } from "../types";

/**
 * Mock payments: no network, fully deterministic. The checkout URL points at
 * the in-app mock checkout page (/billing/mock-checkout), which "pays" by
 * calling back into billing with the same reference. The plan code is encoded
 * in the reference so verification is stateless:
 *   reference format: mockpay_<planCode>_<random>
 */
export const mockPayments: PaymentsAdapter = {
  async createCheckout(input) {
    const reference = `mockpay_${input.planCode}_${Math.random().toString(36).slice(2, 10)}`;
    const url = new URL("/billing/mock-checkout", env.APP_URL);
    url.searchParams.set("reference", reference);
    url.searchParams.set("email", input.email);
    url.searchParams.set("amount", String(input.amountKobo));
    url.searchParams.set("callback", input.callbackUrl);
    return { checkoutUrl: url.toString(), reference };
  },

  async verifyTransaction(reference) {
    const m = /^mockpay_([a-z0-9_-]+)_/i.exec(reference);
    if (!m) return { status: "failed", reference };
    return {
      status: "success",
      reference,
      planCode: m[1],
      customerCode: `MOCK_CUS_${m[1]}`,
      subscriptionCode: `MOCK_SUB_${reference.slice(-8)}`,
      paidAt: new Date().toISOString(),
    };
  },

  verifyWebhookSignature(_rawBody, signature) {
    return signature === "mock-signature";
  },

  async cancelSubscription() {
    // Nothing to do in mock mode.
  },
};
