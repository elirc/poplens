import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { DEFAULT_PLAN_LIMITS, getUserPlan } from "@/lib/limits";
import { _resetRateLimiter } from "@/lib/rate-limit";
import {
  applyVerifiedPayment,
  cancelSubscriptionFor,
  getBillingStatus,
  handleWebhookEvent,
  startCheckout,
} from "@/server/billing/subscriptions";
import { POST as webhookPOST } from "@/app/api/webhooks/paystack/route";
import { truncateAll } from "../db-helpers";

/**
 * Billing in mock mode (ADAPTER_PAYMENTS=mock): checkout start, the
 * verify+grant path shared by callback / mock checkout / webhook, webhook
 * signature verification on the raw body, and idempotency by reference.
 */

const USER = "u-bill";

async function setup() {
  await truncateAll();
  _resetRateLimiter();
  for (const [code, price] of [
    ["free", 0],
    ["pro", 500_000],
    ["org", 5_000_000],
  ] as const) {
    await db.insert(schema.plans).values({ code, name: code, priceKoboMonthly: price, limits: DEFAULT_PLAN_LIMITS[code] });
  }
  await db.insert(schema.user).values({ id: USER, name: "Bill", email: "bill@test.local" });
}

function hook(body: unknown, signature = "mock-signature") {
  return new Request("http://localhost/api/webhooks/paystack", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-paystack-signature": signature },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const markers = (reference: string) =>
  db
    .select()
    .from(schema.auditLog)
    .where(and(eq(schema.auditLog.action, "billing.payment_applied"), eq(schema.auditLog.entityId, reference)));

beforeEach(setup);
afterAll(async () => {
  _resetRateLimiter();
  await truncateAll();
});

describe("checkout", () => {
  it("starts a mock checkout pointing at /billing/mock-checkout and audits it", async () => {
    const s = await startCheckout({ userId: USER, email: "bill@test.local", planCode: "pro" });
    expect(s.reference).toMatch(/^mockpay_pro_/);
    expect(s.checkoutUrl).toContain("/billing/mock-checkout");
    const audits = await db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "billing.checkout_start"));
    expect(audits).toHaveLength(1);
  });

  it("refuses free or unknown plans", async () => {
    await expect(startCheckout({ userId: USER, email: "b@t", planCode: "free" })).rejects.toThrow();
    await expect(startCheckout({ userId: USER, email: "b@t", planCode: "gold" })).rejects.toThrow();
  });
});

describe("applyVerifiedPayment", () => {
  it("grants the plan once and is idempotent by reference", async () => {
    const ref = "mockpay_pro_abc12345";
    const first = await applyVerifiedPayment({ reference: ref, userId: USER, via: "mock-checkout" });
    expect(first).toMatchObject({ ok: true, duplicate: false, planCode: "pro" });
    const second = await applyVerifiedPayment({ reference: ref, userId: USER, via: "callback" });
    expect(second).toMatchObject({ ok: true, duplicate: true });
    expect(await db.select().from(schema.subscriptions)).toHaveLength(1);
    expect(await markers(ref)).toHaveLength(1);
    expect((await getUserPlan(USER)).planCode).toBe("pro");
    const status = await getBillingStatus(USER);
    expect(status).toMatchObject({ planCode: "pro", status: "active", via: "user" });
    expect(status.currentPeriodEnd).not.toBeNull();
  });

  it("serialises concurrent callback + webhook for one reference", async () => {
    const ref = "mockpay_pro_race0001";
    const results = await Promise.all([
      applyVerifiedPayment({ reference: ref, userId: USER, via: "callback" }),
      applyVerifiedPayment({ reference: ref, userId: USER, via: "webhook" }),
      applyVerifiedPayment({ reference: ref, userId: USER, via: "mock-checkout" }),
    ]);
    expect(results.filter((r) => r.ok && !r.duplicate)).toHaveLength(1);
    expect(await markers(ref)).toHaveLength(1);
    expect(await db.select().from(schema.subscriptions)).toHaveLength(1);
  });

  it("rejects references that do not verify or name an unknown plan", async () => {
    expect(await applyVerifiedPayment({ reference: "not-a-mock-ref", userId: USER, via: "callback" })).toMatchObject({
      ok: false,
    });
    expect(await applyVerifiedPayment({ reference: "mockpay_gold_abc", userId: USER, via: "callback" })).toMatchObject({
      ok: false,
    });
    expect(await db.select().from(schema.subscriptions)).toHaveLength(0);
  });

  it("puts organisation plans on the organisation the user owns; members inherit it", async () => {
    await db.insert(schema.organization).values({ id: "org1", name: "Org", slug: "org-1" });
    await db.insert(schema.member).values({ id: "m-owner", organizationId: "org1", userId: USER, role: "owner" });
    await db.insert(schema.user).values({ id: "u-member", name: "Mem", email: "mem@test.local" });
    await db.insert(schema.member).values({ id: "m-2", organizationId: "org1", userId: "u-member", role: "member" });
    const r = await applyVerifiedPayment({ reference: "mockpay_org_zz000001", userId: USER, via: "mock-checkout" });
    expect(r).toMatchObject({ ok: true, planCode: "org" });
    const [sub] = await db.select().from(schema.subscriptions);
    expect(sub.organizationId).toBe("org1");
    expect(sub.userId).toBeNull();
    expect((await getUserPlan("u-member")).planCode).toBe("org");
  });
});

describe("Paystack webhook route", () => {
  const charge = (reference: string) => ({
    event: "charge.success",
    data: {
      reference,
      status: "success",
      customer: { email: "bill@test.local", customer_code: "CUS_x" },
      metadata: { userId: USER, planCode: "pro" },
    },
  });

  it("rejects a bad signature before doing anything", async () => {
    const res = await webhookPOST(hook(charge("mockpay_pro_sig00001"), "forged"));
    expect(res.status).toBe(401);
    expect(await db.select().from(schema.subscriptions)).toHaveLength(0);
  });

  it("applies charge.success once even when Paystack retries", async () => {
    const body = charge("mockpay_pro_hook0001");
    const r1 = await webhookPOST(hook(body));
    expect(r1.status).toBe(200);
    expect(await r1.json()).toMatchObject({ outcome: { handled: true, duplicate: false } });
    const r2 = await webhookPOST(hook(body));
    expect(r2.status).toBe(200);
    expect(await r2.json()).toMatchObject({ outcome: { handled: true, duplicate: true } });
    expect(await db.select().from(schema.subscriptions)).toHaveLength(1);
    expect((await getUserPlan(USER)).planCode).toBe("pro");
  });

  it("falls back to the customer email when metadata has no user", async () => {
    const body = { event: "charge.success", data: { reference: "mockpay_pro_mail0001", customer: { email: "BILL@test.local" } } };
    expect((await webhookPOST(hook(body))).status).toBe(200);
    expect((await getUserPlan(USER)).planCode).toBe("pro");
  });

  it("returns 400 for malformed payloads and 200 for ignored events", async () => {
    expect((await webhookPOST(hook("{oops"))).status).toBe(400);
    expect((await webhookPOST(hook({ event: "transfer.success", data: {} }))).status).toBe(200);
  });

  it("subscription.disable cancels the matching subscription (idempotently)", async () => {
    const ref = "mockpay_pro_dis00001";
    await applyVerifiedPayment({ reference: ref, userId: USER, via: "callback" });
    const [sub] = await db.select().from(schema.subscriptions);
    expect(sub.paystackSubscriptionCode).toBeTruthy();
    const ev = { event: "subscription.disable", data: { subscription_code: sub.paystackSubscriptionCode } };
    expect((await webhookPOST(hook(ev))).status).toBe(200);
    expect((await webhookPOST(hook(ev))).status).toBe(200);
    const [after] = await db.select().from(schema.subscriptions);
    expect(after.status).toBe("cancelled");
    expect((await getUserPlan(USER)).planCode).toBe("free");
  });

  it("subscription.create links the Paystack subscription code by customer", async () => {
    await applyVerifiedPayment({ reference: "mockpay_pro_lnk00001", userId: USER, via: "callback" });
    const [sub] = await db.select().from(schema.subscriptions);
    const out = await handleWebhookEvent({
      event: "subscription.create",
      data: { subscription_code: "SUB_real", customer: { customer_code: sub.paystackCustomerCode! } },
    });
    expect(out).toMatchObject({ handled: true });
    const [after] = await db.select().from(schema.subscriptions);
    expect(after.paystackSubscriptionCode).toBe("SUB_real");
  });
});

describe("cancel", () => {
  it("cancels the user's own subscription and audits it", async () => {
    await applyVerifiedPayment({ reference: "mockpay_pro_can00001", userId: USER, via: "callback" });
    expect(await cancelSubscriptionFor(USER)).toBe(true);
    expect((await getUserPlan(USER)).planCode).toBe("free");
    expect(await cancelSubscriptionFor(USER)).toBe(false);
    const audits = await db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "billing.cancel"));
    expect(audits).toHaveLength(1);
  });
});
