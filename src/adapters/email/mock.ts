import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "@/env";
import type { EmailAdapter } from "../types";

/**
 * Mock email: no network. Writes each message to the mock outbox
 * (<LOCAL_STORAGE_DIR>/mock-outbox/email-<timestamp>.json) so tests and
 * developers can inspect what would have been sent.
 */
export const mockEmail: EmailAdapter = {
  async send(msg) {
    const id = `mock-email-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const dir = path.join(env.LOCAL_STORAGE_DIR, "mock-outbox");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, `${id}.json`),
      JSON.stringify({ id, ...msg, at: new Date().toISOString() }, null, 2),
    );
    console.log(`[mock-email] to=${msg.to} subject="${msg.subject}"`);
    return { id };
  },
};
