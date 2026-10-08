import "dotenv/config";
/**
 * PopLens demo seed (idempotent — safe to re-run).
 *
 *   pnpm seed                    real geoBoundaries shapes if downloadable
 *   pnpm seed --placeholder-geo  force placeholder geometry (offline)
 *
 * Loads accounts, plans, sources, the indicator catalogue, geography and a
 * clearly labelled SYNTHETIC demo dataset, then prints a summary table.
 * See docs/DATA-LOADING.md for loading real GRID3 / population files.
 */
import { pool } from "@/db";
import { runSeed } from "@/server/seed/run";

async function main() {
  const summary = await runSeed({
    forcePlaceholderGeo: process.argv.includes("--placeholder-geo"),
  });
  console.log("\n=== PopLens seed summary ===");
  console.log(
    `geography: ${summary.geographyPath} (${summary.boundaryVersion})${
      summary.geographyReason ? ` — fallback reason: ${summary.geographyReason}` : ""
    }`,
  );
  console.log("demo accounts:");
  for (const [email, how] of Object.entries(summary.accountMethods)) {
    console.log(`  ${email.padEnd(22)} ${how}`);
  }
  console.table(
    Object.fromEntries(summary.tableCounts.map((r) => [r.table, { rows: r.rows }])),
  );
  console.log(`seed finished in ${summary.seconds.toFixed(1)}s — ALL VALUES ARE SYNTHETIC DEMO DATA`);
  await pool.end();
}

main().catch(async (e) => {
  console.error("SEED FAILED:", e);
  await pool.end().catch(() => {});
  process.exit(1);
});
