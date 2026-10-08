import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/env";
import * as schema from "./schema";

/**
 * Single shared pool per process. In tests, TEST_DATABASE_URL is selected
 * when NODE_ENV === 'test' (the vitest db project sets it).
 */
const connectionString =
  env.NODE_ENV === "test" ? env.TEST_DATABASE_URL : env.DATABASE_URL;

declare global {
  // eslint-disable-next-line no-var
  var __poplensPool: Pool | undefined;
}

export const pool: Pool =
  globalThis.__poplensPool ??
  new Pool({ connectionString, max: env.NODE_ENV === "production" ? 10 : 5 });

if (env.NODE_ENV !== "production") globalThis.__poplensPool = pool;

export const db = drizzle(pool, { schema });

export type Db = typeof db;
export { schema };
