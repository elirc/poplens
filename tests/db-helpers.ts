import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Truncate all app data tables (order-safe via CASCADE), keeping schema and
 * migrations. Call in beforeEach of db tests that need a clean slate.
 * The db vitest project runs files serially, so this cannot race another file.
 */
export async function truncateAll(): Promise<void> {
  await db.execute(sql`
    TRUNCATE TABLE
      indicator_values, outbreak_reports, population_cells, health_facilities,
      geo_aliases, import_runs, datasets, indicators, sources,
      insight_cards, stories, saved_views, custom_reports,
      download_log, usage_counters, api_usage, api_keys,
      subscriptions, plans, audit_log,
      invitations, members, organizations,
      verifications, accounts, sessions, users,
      geo_units
    RESTART IDENTITY CASCADE
  `);
}
