import "dotenv/config";
import { Pool } from "pg";

/**
 * Idempotent database bootstrap: ensures both app databases exist with the
 * required extensions, then the caller runs `pnpm db:migrate` (and
 * `pnpm db:migrate --test`). Connects to the server's `postgres` database
 * derived from DATABASE_URL.
 */
async function ensureDb(adminUrl: string, dbName: string) {
  const admin = new Pool({ connectionString: adminUrl, max: 1 });
  const exists = await admin.query(
    "SELECT 1 FROM pg_database WHERE datname = $1",
    [dbName],
  );
  if (exists.rowCount === 0) {
    await admin.query(`CREATE DATABASE "${dbName}"`);
    console.log(`created database ${dbName}`);
  }
  await admin.end();
}

async function ensureExtensions(url: string) {
  const pool = new Pool({ connectionString: url, max: 1 });
  await pool.query("CREATE EXTENSION IF NOT EXISTS postgis");
  await pool.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");
  await pool.end();
}

async function main() {
  const dev = process.env.DATABASE_URL;
  const test = process.env.TEST_DATABASE_URL;
  if (!dev) throw new Error("DATABASE_URL not set");
  const parsed = new URL(dev);
  const adminUrl = new URL(dev);
  adminUrl.pathname = "/postgres";
  await ensureDb(adminUrl.toString(), parsed.pathname.slice(1));
  await ensureExtensions(dev);
  if (test) {
    await ensureDb(adminUrl.toString(), new URL(test).pathname.slice(1));
    await ensureExtensions(test);
  }
  console.log("db-setup OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
