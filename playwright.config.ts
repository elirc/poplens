import { defineConfig } from "@playwright/test";

/**
 * E2E against the dev server with the seeded dev database (mock mode).
 * Prerequisites (documented in README):
 *   pnpm db:setup && pnpm db:migrate && pnpm seed
 * The webServer block starts `pnpm dev` automatically unless one is running.
 * The journey runs once on a desktop viewport; individual specs opt into a
 * phone viewport with test.use where it matters (the market is phone-first,
 * but canvas interactions are steadier at desktop size).
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    // Tracing overhead is punishing on this low-memory box; error context +
    // the list reporter are enough. Flip to "retain-on-failure" to debug.
    trace: "off",
    viewport: { width: 1280, height: 800 },
    actionTimeout: 60_000,
    navigationTimeout: 90_000,
  },
  expect: { timeout: 20_000 },
  projects: [{ name: "e2e" }],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
