import "dotenv/config";
import PgBoss from "pg-boss";
import { env } from "@/env";
import { JOBS } from "./jobs";

/**
 * The worker process (`pnpm worker`). Runs pg-boss against the app database,
 * registers every job in the registry and schedules the cron ones.
 * Enqueue from the web app with pg-boss's send() via src/server/queue.ts.
 */
async function main() {
  const boss = new PgBoss({
    connectionString: env.DATABASE_URL,
    schema: "pgboss",
  });
  boss.on("error", (err) => console.error("[worker] pg-boss error", err));
  await boss.start();
  console.log(`[worker] started (${JOBS.length} job types)`);

  for (const job of JOBS) {
    await boss.createQueue(job.name);
    await boss.work(job.name, async (jobs) => {
      for (const j of jobs) {
        console.log(`[worker] ${job.name} #${j.id} start`);
        try {
          await job.handler(j.data);
          console.log(`[worker] ${job.name} #${j.id} done`);
        } catch (e) {
          console.error(`[worker] ${job.name} #${j.id} FAILED`, e);
          throw e;
        }
      }
    });
    if (job.cron) {
      await boss.schedule(job.name, job.cron, undefined, { tz: "Africa/Lagos" });
    }
  }

  const shutdown = async () => {
    console.log("[worker] stopping…");
    await boss.stop({ graceful: true, timeout: 15_000 });
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  console.error("[worker] fatal", e);
  process.exit(1);
});
