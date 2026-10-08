import { env } from "@/env";
import type { SmsAdapter } from "../types";

/** Real driver: Termii messaging API (https://developers.termii.com/messaging). */
export const termiiSms: SmsAdapter = {
  async sendSms(msg) {
    if (!env.TERMII_API_KEY) throw new Error("TERMII_API_KEY not set");
    const res = await fetch("https://api.ng.termii.com/api/sms/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: env.TERMII_API_KEY,
        to: msg.to,
        from: env.TERMII_SENDER_ID,
        sms: msg.message,
        type: "plain",
        channel: "generic",
      }),
    });
    if (!res.ok) {
      throw new Error(`Termii failed: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as { message_id: string };
    return { id: data.message_id };
  },
};
