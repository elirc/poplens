import { randomBytes } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { env } from "@/env";
import { getPayments } from "@/adapters";
import { auth } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { getPlan, resolvePlanCode, type PlanRow } from "./plans";
import { planCodeOf, type WebhookEvent } from "./webhook";

/**
 * Subscription lifecycle. Every path that grants a plan — the hosted
 * checkout callback, the mock-checkout "Pay" button and the charge.success
 * webhook — goes through applyVerifiedPayment(), which re-verifies the
 * transaction with the payments adapter and is idempotent by reference
 * (an advisory lock + a 'billing.payment_applied' marker written in the
 * same transaction), so a callback racing its webhook grants exactly once.
 */

export const BILLING_PERIOD_DAYS = 30;
const APPLIED_ACTION = "billing.payment_applied";

export type Subscriber = { userId: string; organizationId: null } | { userId: null; organizationId: string };

export interface BillingStatus {
  planCode: string;
  planName: string;
  status: "active" | "past_due" | "cancelled" | "none";
  via: "user" | "organization" | "none";
  organization: { id: string; name: string } | null;
  currentPeriodEnd: Date | null;
  subscriptionId: number | null;
  paystackSubscriptionCode: string | null;
}

/* ── Organisations ───────────────────────────────────────────────────────── */

/** The first organisation the user owns (role 'owner'), if any. */
export async function getOwnedOrganization(userId: string): Promise<{ id: string; name: string } | null> {
  const [r] = await db
    .select({ id: schema.organization.id, name: schema.organization.name })
    .from(schema.member)
    .innerJoin(schema.organization, eq(schema.member.organizationId, schema.organization.id))
    .where(and(eq(schema.member.userId, userId), eq(schema.member.role, "owner")))
    .orderBy(schema.organization.createdAt)
    .limit(1);
  return r ?? null;
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${base || "org"}-${randomBytes(3).toString("hex")}`;
}

/** Create an organisation owned by the user (Better Auth org plugin). */
export async function createOrganizationFor(userId: string, name: string): Promise<{ id: string; name: string }> {
  const org = await auth.api.createOrganization({
    body: { name, slug: slugify(name), userId },
  });
  if (!org?.id) throw new Error("Could not create the organisation");
  await writeAudit({ actorId: userId, action: "org.create", entity: "organization", entityId: org.id, detail: { name } });
  return { id: org.id, name: org.name };
}

/* ── Checkout ────────────────────────────────────────────────────────────── */

export function newReference(planCode: string): string {
  return `pl_${planCode}_${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
}

/**
 * Start a hosted checkout for a paid plan. Org plans attach to an
 * organisation the user owns (created here from `orgName` if needed).
 */
export async function startCheckout(input: {
  userId: string;
  email: string;
  planCode: string;
  orgName?: string | null;
}): Promise<{ checkoutUrl: string; reference: string }> {
  const plan = await getPlan(input.planCode);
  if (!plan) throw new Error("Unknown plan");
  if (plan.priceKoboMonthly <= 0) throw new Error("This plan is free — no checkout needed");

  let organizationId: string | null = null;
  if (plan.limits.seats > 1) {
    const owned = await getOwnedOrganization(input.userId);
    if (owned) organizationId = owned.id;
    else {
      const name = input.orgName?.trim();
      if (!name) throw new Error("Enter an organisation name for the Organisation plan");
      organizationId = (await createOrganizationFor(input.userId, name)).id;
    }
  }

  const session = await getPayments().createCheckout({
    email: input.email,
    planCode: plan.code,
    amountKobo: plan.priceKoboMonthly,
    reference: newReference(plan.code),
    callbackUrl: new URL("/billing/callback", env.APP_URL).toString(),
    metadata: { userId: input.userId, organizationId, planCode: plan.code },
  });
  await writeAudit({
    actorId: input.userId,
    action: "billing.checkout_start",
    entity: "payment",
    entityId: session.reference,
    detail: { planCode: plan.code, amountKobo: plan.priceKoboMonthly, organizationId },
  });
  return session;
}

/* ── Applying a payment ──────────────────────────────────────────────────── */

async function subscriberFor(plan: PlanRow, userId: string, organizationId?: string | null): Promise<Subscriber> {
  if (plan.limits.seats > 1) {
    const orgId = organizationId ?? (await getOwnedOrganization(userId))?.id ?? null;
    if (orgId) return { userId: null, organizationId: orgId };
  }
  return { userId, organizationId: null };
}

export type ApplyResult =
  | { ok: true; duplicate: boolean; subscriptionId: number; planCode: string }
  | { ok: false; reason: string };

/**
 * Verify a transaction with the adapter and grant its plan. Safe to call any
 * number of times for one reference.
 */
export async function applyVerifiedPayment(input: {
  reference: string;
  userId: string;
  organizationId?: string | null;
  via: "callback" | "mock-checkout" | "webhook";
  customerCode?: string | null;
}): Promise<ApplyResult> {
  const tx = await getPayments().verifyTransaction(input.reference);
  if (tx.status !== "success") return { ok: false, reason: `Payment ${tx.status}` };
  const plan = await resolvePlanCode(tx.planCode);
  if (!plan) return { ok: false, reason: `Unknown plan in payment: ${tx.planCode ?? "none"}` };
  const target = await subscriberFor(plan, input.userId, input.organizationId);
  const paidAt = tx.paidAt ? new Date(tx.paidAt) : new Date();
  const periodEnd = new Date(paidAt.getTime() + BILLING_PERIOD_DAYS * 24 * 60 * 60 * 1000);

  return db.transaction(async (t) => {
    // Serialise everything that touches this reference.
    await t.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`billing:${input.reference}`}))`);
    const [done] = await t
      .select({ detail: schema.auditLog.detail })
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.action, APPLIED_ACTION), eq(schema.auditLog.entityId, input.reference)))
      .limit(1);
    if (done) {
      const d = (done.detail ?? {}) as { subscriptionId?: number; planCode?: string };
      return { ok: true as const, duplicate: true, subscriptionId: d.subscriptionId ?? 0, planCode: d.planCode ?? plan.code };
    }

    const ownerCond = target.userId
      ? eq(schema.subscriptions.userId, target.userId)
      : eq(schema.subscriptions.organizationId, target.organizationId!);
    const [existing] = await t
      .select({ id: schema.subscriptions.id })
      .from(schema.subscriptions)
      .where(ownerCond)
      .orderBy(desc(schema.subscriptions.id))
      .limit(1);
    const values = {
      planCode: plan.code,
      status: "active" as const,
      paystackCustomerCode: tx.customerCode ?? input.customerCode ?? null,
      paystackSubscriptionCode: tx.subscriptionCode ?? null,
      currentPeriodEnd: periodEnd,
      updatedAt: new Date(),
    };
    let subscriptionId: number;
    if (existing) {
      await t.update(schema.subscriptions).set(values).where(eq(schema.subscriptions.id, existing.id));
      subscriptionId = existing.id;
    } else {
      const [row] = await t
        .insert(schema.subscriptions)
        .values({ ...values, userId: target.userId, organizationId: target.organizationId })
        .returning({ id: schema.subscriptions.id });
      subscriptionId = row.id;
    }
    // Idempotency marker + audit entry, atomic with the grant (written in
    // this transaction rather than via writeAudit so it commits or rolls
    // back together with the subscription change).
    await t.insert(schema.auditLog).values({
      actorId: input.userId,
      action: APPLIED_ACTION,
      entity: "payment",
      entityId: input.reference,
      detail: {
        subscriptionId,
        planCode: plan.code,
        via: input.via,
        organizationId: target.organizationId,
        periodEnd: periodEnd.toISOString(),
      },
    });
    return { ok: true as const, duplicate: false, subscriptionId, planCode: plan.code };
  });
}

/* ── Webhook events ──────────────────────────────────────────────────────── */

async function userIdByEmail(email: string | undefined): Promise<string | null> {
  if (!email) return null;
  const [u] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(sql`lower(${schema.user.email})`, email.toLowerCase()))
    .limit(1);
  return u?.id ?? null;
}

async function userExists(id: string | undefined): Promise<string | null> {
  if (!id) return null;
  const [u] = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.id, id)).limit(1);
  return u?.id ?? null;
}

export type WebhookOutcome =
  | { handled: true; action: string; duplicate?: boolean }
  | { handled: false; reason: string };

/** Apply a verified, parsed webhook event. Idempotent for every event type. */
export async function handleWebhookEvent(event: WebhookEvent): Promise<WebhookOutcome> {
  switch (event.event) {
    case "charge.success": {
      const d = event.data;
      const userId = (await userExists(d.metadata?.userId)) ?? (await userIdByEmail(d.customer?.email));
      if (!userId) return { handled: false, reason: "No PopLens user matches this payment" };
      const r = await applyVerifiedPayment({
        reference: d.reference,
        userId,
        organizationId: d.metadata?.organizationId ?? null,
        via: "webhook",
        customerCode: d.customer?.customer_code ?? null,
      });
      return r.ok ? { handled: true, action: "subscription.granted", duplicate: r.duplicate } : { handled: false, reason: r.reason };
    }
    case "subscription.create": {
      const d = event.data;
      const customerCode = d.customer?.customer_code;
      const plan = await resolvePlanCode(planCodeOf(d.plan));
      const conds = customerCode ? eq(schema.subscriptions.paystackCustomerCode, customerCode) : null;
      if (!conds) return { handled: false, reason: "subscription.create without customer code" };
      const updated = await db
        .update(schema.subscriptions)
        .set({
          paystackSubscriptionCode: d.subscription_code,
          ...(plan ? { planCode: plan.code } : {}),
          ...(d.next_payment_date ? { currentPeriodEnd: new Date(d.next_payment_date) } : {}),
          status: "active",
          updatedAt: new Date(),
        })
        .where(conds)
        .returning({ id: schema.subscriptions.id, userId: schema.subscriptions.userId });
      if (updated.length === 0) return { handled: false, reason: "No subscription for this customer yet" };
      await writeAudit({
        actorId: updated[0].userId,
        action: "billing.subscription_create",
        entity: "subscription",
        entityId: updated[0].id,
        detail: { subscriptionCode: d.subscription_code },
      });
      return { handled: true, action: "subscription.linked" };
    }
    case "subscription.disable":
    case "subscription.not_renew": {
      const code = event.data.subscription_code;
      // not_renew: the current period still runs; mark cancelled only on disable.
      if (event.event === "subscription.not_renew") return { handled: true, action: "noted" };
      const updated = await db
        .update(schema.subscriptions)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(
          and(
            eq(schema.subscriptions.paystackSubscriptionCode, code),
            sql`${schema.subscriptions.status} <> 'cancelled'`,
          ),
        )
        .returning({ id: schema.subscriptions.id, userId: schema.subscriptions.userId });
      if (updated.length > 0) {
        await writeAudit({
          actorId: updated[0].userId,
          action: "billing.subscription_disable",
          entity: "subscription",
          entityId: updated[0].id,
          detail: { subscriptionCode: code },
        });
        return { handled: true, action: "subscription.cancelled" };
      }
      return { handled: true, action: "subscription.cancelled", duplicate: true };
    }
  }
}

/* ── Status / cancel ─────────────────────────────────────────────────────── */

export async function getBillingStatus(userId: string): Promise<BillingStatus> {
  const own = await db
    .select({
      id: schema.subscriptions.id,
      planCode: schema.subscriptions.planCode,
      planName: schema.plans.name,
      status: schema.subscriptions.status,
      currentPeriodEnd: schema.subscriptions.currentPeriodEnd,
      code: schema.subscriptions.paystackSubscriptionCode,
    })
    .from(schema.subscriptions)
    .innerJoin(schema.plans, eq(schema.plans.code, schema.subscriptions.planCode))
    .where(eq(schema.subscriptions.userId, userId))
    .orderBy(sql`${schema.subscriptions.status} = 'active' DESC`, desc(schema.subscriptions.id))
    .limit(1);
  const viaOrg = await db
    .select({
      id: schema.subscriptions.id,
      planCode: schema.subscriptions.planCode,
      planName: schema.plans.name,
      status: schema.subscriptions.status,
      currentPeriodEnd: schema.subscriptions.currentPeriodEnd,
      code: schema.subscriptions.paystackSubscriptionCode,
      orgId: schema.organization.id,
      orgName: schema.organization.name,
    })
    .from(schema.member)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.member.organizationId))
    .innerJoin(schema.subscriptions, eq(schema.subscriptions.organizationId, schema.member.organizationId))
    .innerJoin(schema.plans, eq(schema.plans.code, schema.subscriptions.planCode))
    .where(eq(schema.member.userId, userId))
    .orderBy(sql`${schema.subscriptions.status} = 'active' DESC`, desc(schema.subscriptions.id))
    .limit(1);

  const o = own[0];
  const g = viaOrg[0];
  // Same precedence as getUserPlan: an active own subscription wins, then an active org one.
  if (o && o.status === "active") {
    return {
      planCode: o.planCode,
      planName: o.planName,
      status: o.status,
      via: "user",
      organization: null,
      currentPeriodEnd: o.currentPeriodEnd,
      subscriptionId: o.id,
      paystackSubscriptionCode: o.code,
    };
  }
  if (g && g.status === "active") {
    return {
      planCode: g.planCode,
      planName: g.planName,
      status: g.status,
      via: "organization",
      organization: { id: g.orgId, name: g.orgName },
      currentPeriodEnd: g.currentPeriodEnd,
      subscriptionId: g.id,
      paystackSubscriptionCode: g.code,
    };
  }
  const lapsed = o ?? null;
  return {
    planCode: "free",
    planName: "Free",
    status: lapsed ? lapsed.status : "none",
    via: lapsed ? "user" : "none",
    organization: null,
    currentPeriodEnd: lapsed?.currentPeriodEnd ?? null,
    subscriptionId: lapsed?.id ?? null,
    paystackSubscriptionCode: lapsed?.code ?? null,
  };
}

/**
 * Cancel the subscription the user controls: their own, or one on an
 * organisation they own. Members of an org cannot cancel the org plan.
 */
export async function cancelSubscriptionFor(userId: string): Promise<boolean> {
  const status = await getBillingStatus(userId);
  if (status.status !== "active" || !status.subscriptionId) return false;
  if (status.via === "organization") {
    const owned = await getOwnedOrganization(userId);
    if (!owned || owned.id !== status.organization?.id) {
      throw new Error("Only the organisation owner can cancel the organisation plan");
    }
  }
  if (status.paystackSubscriptionCode) {
    await getPayments().cancelSubscription(status.paystackSubscriptionCode);
  }
  await db
    .update(schema.subscriptions)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(schema.subscriptions.id, status.subscriptionId));
  await writeAudit({
    actorId: userId,
    action: "billing.cancel",
    entity: "subscription",
    entityId: status.subscriptionId,
    detail: { planCode: status.planCode, via: status.via },
  });
  return true;
}
