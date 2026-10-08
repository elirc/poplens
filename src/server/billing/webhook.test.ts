import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { mockPayments } from "@/adapters/payments/mock";
import type { PaymentsAdapter } from "@/adapters/types";
import { planCodeOf, signatureFrom, verifyAndParseWebhook } from "./webhook";

const charge = JSON.stringify({
  event: "charge.success",
  data: {
    reference: "mockpay_pro_abc12345",
    status: "success",
    paid_at: "2026-10-01T10:00:00.000Z",
    customer: { email: "user@poplens.ng", customer_code: "CUS_1" },
    metadata: { userId: "u1", planCode: "pro" },
  },
});

describe("verifyAndParseWebhook with the mock adapter", () => {
  it("accepts the mock signature and parses charge.success", () => {
    const r = verifyAndParseWebhook(mockPayments, charge, "mock-signature");
    expect(r.kind).toBe("event");
    if (r.kind === "event" && r.event.event === "charge.success") {
      expect(r.event.data.reference).toBe("mockpay_pro_abc12345");
      expect(r.event.data.metadata?.userId).toBe("u1");
    }
  });

  it("rejects a wrong or missing signature", () => {
    expect(verifyAndParseWebhook(mockPayments, charge, "nope").kind).toBe("bad_signature");
    expect(verifyAndParseWebhook(mockPayments, charge, "").kind).toBe("bad_signature");
  });

  it("checks the signature before parsing (garbage body + bad signature → bad_signature)", () => {
    expect(verifyAndParseWebhook(mockPayments, "{not json", "wrong").kind).toBe("bad_signature");
    expect(verifyAndParseWebhook(mockPayments, "{not json", "mock-signature").kind).toBe("bad_payload");
  });

  it("ignores unhandled events and rejects malformed handled ones", () => {
    const other = JSON.stringify({ event: "transfer.success", data: {} });
    expect(verifyAndParseWebhook(mockPayments, other, "mock-signature")).toEqual({
      kind: "ignored",
      eventName: "transfer.success",
    });
    const broken = JSON.stringify({ event: "charge.success", data: {} });
    expect(verifyAndParseWebhook(mockPayments, broken, "mock-signature").kind).toBe("bad_payload");
  });

  it("parses subscription.create and subscription.disable", () => {
    const create = JSON.stringify({
      event: "subscription.create",
      data: { subscription_code: "SUB_1", customer: { customer_code: "CUS_1" }, plan: { plan_code: "PLN_x" } },
    });
    const r = verifyAndParseWebhook(mockPayments, create, "mock-signature");
    expect(r.kind).toBe("event");
    if (r.kind === "event" && r.event.event === "subscription.create") {
      expect(planCodeOf(r.event.data.plan)).toBe("PLN_x");
    }
    const disable = JSON.stringify({ event: "subscription.disable", data: { subscription_code: "SUB_1" } });
    expect(verifyAndParseWebhook(mockPayments, disable, "mock-signature")).toMatchObject({
      kind: "event",
      event: { event: "subscription.disable" },
    });
  });

  it("accepts metadata sent as a JSON string", () => {
    const body = JSON.stringify({
      event: "charge.success",
      data: { reference: "r1", metadata: JSON.stringify({ userId: "u9" }) },
    });
    const r = verifyAndParseWebhook(mockPayments, body, "mock-signature");
    expect(r.kind === "event" && r.event.event === "charge.success" && r.event.data.metadata?.userId).toBe("u9");
  });
});

describe("verifyAndParseWebhook with an HMAC-SHA512 adapter (Paystack scheme)", () => {
  const secret = "sk_test_unit";
  const hmacAdapter: Pick<PaymentsAdapter, "verifyWebhookSignature"> = {
    verifyWebhookSignature: (raw, sig) => createHmac("sha512", secret).update(raw).digest("hex") === sig,
  };
  it("verifies the raw body, so any re-serialisation breaks the signature", () => {
    const sig = createHmac("sha512", secret).update(charge).digest("hex");
    expect(verifyAndParseWebhook(hmacAdapter, charge, sig).kind).toBe("event");
    const reserialised = JSON.stringify(JSON.parse(charge), null, 2);
    expect(verifyAndParseWebhook(hmacAdapter, reserialised, sig).kind).toBe("bad_signature");
  });
  it("treats an adapter that throws (no secret configured) as a bad signature", () => {
    const throwing = {
      verifyWebhookSignature: () => {
        throw new Error("PAYSTACK_SECRET_KEY not set");
      },
    };
    expect(verifyAndParseWebhook(throwing, charge, "x").kind).toBe("bad_signature");
  });
});

describe("signatureFrom", () => {
  it("reads x-paystack-signature", () => {
    expect(signatureFrom(new Headers({ "x-paystack-signature": "abc" }))).toBe("abc");
    expect(signatureFrom(new Headers())).toBe("");
  });
});
