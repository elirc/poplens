import PgBoss from "pg-boss";
import { env } from "@/env";

/**
 * Enqueue-only pg-boss client for the web process. The worker process
 * (src/worker) does the actual work. Lazily started and cached per process.
 */
let bossPromise: Promise<PgBoss> | null = null;

async function getBoss(): Promise<PgBoss> {
  if (!bossPromise) {
    bossPromise = (async () => {
      const boss = new PgBoss({
        connectionString:
          env.NODE_ENV === "test" ? env.TEST_DATABASE_URL : env.DATABASE_URL,
        schema: "pgboss",
      });
      boss.on("error", (err) => console.error("[queue] pg-boss error", err));
      await boss.start();
      return boss;
    })();
  }
  return bossPromise;
}

export async function enqueue(
  name: string,
  data: Record<string, unknown> = {},
): Promise<string | null> {
  const boss = await getBoss();
  await boss.createQueue(name);
  return boss.send(name, data);
}
