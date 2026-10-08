import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Two projects:
 *  - unit: pure logic, no database, parallel. Files: *.test.ts
 *  - db:   integration tests against TEST_DATABASE_URL, SERIAL (one shared
 *          test db — never run db test files in parallel). Files: *.db.test.ts
 * Run: pnpm test | pnpm test:unit | pnpm test:db
 */
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    projects: [
      {
        resolve: { alias: { "@": path.resolve(__dirname, "src") } },
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts", "tests/unit/**/*.test.ts"],
          exclude: ["**/*.db.test.ts", "**/node_modules/**"],
        },
      },
      {
        resolve: { alias: { "@": path.resolve(__dirname, "src") } },
        test: {
          name: "db",
          environment: "node",
          include: ["src/**/*.db.test.ts", "tests/db/**/*.db.test.ts"],
          globalSetup: ["./tests/db-global-setup.ts"],
          pool: "forks",
          poolOptions: { forks: { singleFork: true } },
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
