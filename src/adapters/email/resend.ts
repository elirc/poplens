import { env } from "@/env";
import type { EmailAdapter } from "../types";

/** Real driver: Resend HTTP API (https://resend.com/docs/api-reference/emails/send-email). */
export const resendEmail: EmailAdapter = {
  async send(msg) {
    if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY not set");
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [msg.to],
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
      }),
    });
    if (!res.ok) {
      throw new Error(`Resend failed: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as { id: string };
    return { id: data.id };
  },
};
