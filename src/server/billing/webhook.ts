import { z } from "zod";
import type { PaymentsAdapter } from "@/adapters/types";

/**
 * Paystack webhook parsing. Spec: the signature is verified on the RAW body
 * (adapter.verifyWebhookSignature) BEFORE anything is parsed; only then is
 * the JSON decoded and validated. Pure — no database — so it is unit-tested
 * against the mock adapter.
 */

/** Paystack sometimes sends metadata as a JSON string; accept either. */
const metadataSchema = z.preprocess(
  (v) => {
    if (typeof v === "string") {
      try {
        return JSON.parse(v);
      } catch {
        return {};
      }
    }
    return v ?? {};
  },
  z
    .object({
      userId: z.string().optional(),
      organizationId: z.string().nullable().optional(),
      planCode: z.string().optional(),
    })
    .passthrough(),
);

const customerSchema = z
  .object({ email: z.string().optional(), customer_code: z.string().optional() })
  .passthrough()
  .nullish();

const planRefSchema = z
  .union([z.object({ plan_code: z.string().optional() }).passthrough(), z.string(), z.null()])
  .optional();

export const chargeSuccessSchema = z.object({
  event: z.literal("charge.success"),
  data: z
    .object({
      reference: z.string().min(1),
      status: z.string().optional(),
      paid_at: z.string().nullish(),
      customer: customerSchema,
      metadata: metadataSchema.optional(),
      plan: planRefSchema,
    })
    .passthrough(),
});

export const subscriptionCreateSchema = z.object({
  event: z.literal("subscription.create"),
  data: z
    .object({
      subscription_code: z.string().min(1),
      status: z.string().optional(),
      next_payment_date: z.string().nullish(),
      customer: customerSchema,
      plan: planRefSchema,
    })
    .passthrough(),
});

const subscriptionEndData = z
  .object({ subscription_code: z.string().min(1), status: z.string().optional() })
  .passthrough();

export const webhookEventSchema = z.discriminatedUnion("event", [
  chargeSuccessSchema,
  subscriptionCreateSchema,
  z.object({ event: z.literal("subscription.disable"), data: subscriptionEndData }),
  z.object({ event: z.literal("subscription.not_renew"), data: subscriptionEndData }),
]);

export type WebhookEvent = z.infer<typeof webhookEventSchema>;

export const HANDLED_EVENTS = [
  "charge.success",
  "subscription.create",
  "subscription.disable",
  "subscription.not_renew",
] as const;

export type VerifyResult =
  | { kind: "event"; event: WebhookEvent }
  | { kind: "ignored"; eventName: string }
  | { kind: "bad_signature" }
  | { kind: "bad_payload"; message: string };

/** Read the signature header Paystack uses. */
export function signatureFrom(headers: Headers): string {
  return headers.get("x-paystack-signature") ?? "";
}

/**
 * Verify then parse. Order is the point: a payload with a bad signature is
 * rejected without being JSON-decoded at all.
 */
export function verifyAndParseWebhook(
  adapter: Pick<PaymentsAdapter, "verifyWebhookSignature">,
  rawBody: string,
  signature: string,
): VerifyResult {
  let valid = false;
  try {
    valid = signature.length > 0 && adapter.verifyWebhookSignature(rawBody, signature);
  } catch {
    valid = false; // e.g. real driver without a secret configured
  }
  if (!valid) return { kind: "bad_signature" };

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return { kind: "bad_payload", message: "Body is not valid JSON" };
  }
  const name =
    json && typeof json === "object" && typeof (json as { event?: unknown }).event === "string"
      ? (json as { event: string }).event
      : null;
  if (!name) return { kind: "bad_payload", message: "Missing event name" };
  if (!(HANDLED_EVENTS as readonly string[]).includes(name)) return { kind: "ignored", eventName: name };
  const parsed = webhookEventSchema.safeParse(json);
  if (!parsed.success) {
    return {
      kind: "bad_payload",
      message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    };
  }
  return { kind: "event", event: parsed.data };
}

/** Plan code carried by a Paystack plan reference (object or bare string). */
export function planCodeOf(plan: z.infer<typeof planRefSchema>): string | undefined {
  if (!plan) return undefined;
  if (typeof plan === "string") return plan || undefined;
  return plan.plan_code;
}
