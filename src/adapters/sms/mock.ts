import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "@/env";
import type { SmsAdapter } from "../types";

/**
 * Mock SMS: no network. Writes the message to
 * <LOCAL_STORAGE_DIR>/mock-outbox/sms-<phone>.json (phone digits only), so
 * OTP codes can be read back by e2e tests and the dev.
 */
export const mockSms: SmsAdapter = {
  async sendSms(msg) {
    const id = `mock-sms-${Date.now()}`;
    const dir = path.join(env.LOCAL_STORAGE_DIR, "mock-outbox");
    await fs.mkdir(dir, { recursive: true });
    const phoneKey = msg.to.replace(/\D/g, "");
    await fs.writeFile(
      path.join(dir, `sms-${phoneKey}.json`),
      JSON.stringify({ id, ...msg, at: new Date().toISOString() }, null, 2),
    );
    console.log(`[mock-sms] to=${msg.to} message="${msg.message}"`);
    return { id };
  },
};
