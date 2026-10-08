import "dotenv/config";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

/**
 * Global setup for the vitest db project: migrate TEST_DATABASE_URL once.
 * Individual test files clean the tables they use (see tests/db-helpers.ts);
 * files run serially so fixtures cannot stomp each other.
 */
export default async function setup() {
  const url =
    process.env.TEST_DATABASE_URL ??
    "postgres://postgres:postgres@localhost:5541/poplens_test";
  process.env.TEST_DATABASE_URL = url;
  const pool = new Pool({ connectionString: url, max: 1 });
  await pool.query("CREATE EXTENSION IF NOT EXISTS postgis");
  await pool.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  await pool.end();
}
