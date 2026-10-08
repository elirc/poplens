import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";

/**
 * Demo-data banner rule (spec): while ANY published dataset is synthetic,
 * every page shows the demo banner. Cached per request by the layout.
 */
export async function isDemoDataLoaded(): Promise<boolean> {
  const rows = await db
    .select({ id: schema.datasets.id })
    .from(schema.datasets)
    .where(
      and(
        eq(schema.datasets.status, "published"),
        eq(schema.datasets.isSynthetic, true),
      ),
    )
    .limit(1);
  return rows.length > 0;
}
