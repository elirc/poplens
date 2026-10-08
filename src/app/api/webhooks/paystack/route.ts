import { getPayments } from "@/adapters";
import { limitOr429 } from "@/lib/rate-limit";
import { handleWebhookEvent } from "@/server/billing/subscriptions";
import { signatureFrom, verifyAndParseWebhook } from "@/server/billing/webhook";

export const dynamic = "force-dynamic";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/**
 * Paystack webhook. The signature (x-paystack-signature; HMAC-SHA512 in real
 * mode, the literal 'mock-signature' in mock mode) is verified on the RAW
 * body before anything is parsed. Handled: charge.success,
 * subscription.create, subscription.disable (+ not_renew noted). Every
 * handler is idempotent by reference/subscription code, so Paystack retries
 * are safe. Unhandled-but-valid events get 200 so Paystack stops retrying.
 */
export async function POST(req: Request): Promise<Response> {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limited = limitOr429(`paystack-webhook:${ip}`, 120, 60_000);
  if (limited) return limited;

  const raw = await req.text();
  const result = verifyAndParseWebhook(getPayments(), raw, signatureFrom(req.headers));
  switch (result.kind) {
    case "bad_signature":
      return json(401, { error: { code: "invalid_signature", message: "Signature verification failed" } });
    case "bad_payload":
      return json(400, { error: { code: "invalid_payload", message: result.message } });
    case "ignored":
      return json(200, { received: true, ignored: result.eventName });
    case "event": {
      try {
        const outcome = await handleWebhookEvent(result.event);
        // 200 even when not applicable (e.g. unknown customer) — retrying won't help.
        return json(200, { received: true, event: result.event.event, outcome });
      } catch (e) {
        console.error("[webhook/paystack] handler failed", e);
        // 500 → Paystack retries; handlers are idempotent.
        return json(500, { error: { code: "handler_failed", message: "Temporary failure" } });
      }
    }
  }
}
