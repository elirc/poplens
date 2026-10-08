import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

/**
 * Applies drizzle migrations from ./drizzle to the target database.
 * Usage: tsx src/db/migrate.ts [--test]
 * (--test migrates TEST_DATABASE_URL instead of DATABASE_URL)
 */
async function main() {
  const target = process.argv.includes("--test")
    ? process.env.TEST_DATABASE_URL
    : process.env.DATABASE_URL;
  if (!target) throw new Error("DATABASE_URL (or TEST_DATABASE_URL) not set");
  const pool = new Pool({ connectionString: target, max: 1 });
  // Extensions must exist before any geometry column is created.
  await pool.query("CREATE EXTENSION IF NOT EXISTS postgis");
  await pool.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  await pool.end();
  console.log(`Migrated ${target.replace(/:[^:@/]+@/, ":***@")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
