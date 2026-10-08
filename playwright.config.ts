import { defineConfig } from "@playwright/test";

/**
 * E2E against the dev server with the seeded dev database (mock mode).
 * Prerequisites (documented in README):
 *   pnpm db:setup && pnpm db:migrate && pnpm seed
 * The webServer block starts `pnpm dev` automatically unless one is running.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    viewport: { width: 390, height: 844 }, // phone-first, per spec market
  },
  projects: [
    { name: "phone", use: {} },
    {
      name: "desktop",
      use: { viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
