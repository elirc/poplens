import { sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { INDICATOR_CATALOGUE } from "@/server/indicators/catalogue-data";

/** Upsert every catalogue entry by code (definitions only); returns code → id. */
export async function seedCatalogue(): Promise<Map<string, number>> {
  for (const e of INDICATOR_CATALOGUE) {
    const values = {
      code: e.code,
      name: e.name,
      category: e.category,
      definition: e.definition,
      unit: e.unit,
      valueType: e.valueType,
      higherIsBetter: e.higherIsBetter,
      decimals: e.decimals,
      aggregation: e.aggregation,
      methodNotes: e.methodNotes ?? null,
    };
    await db
      .insert(schema.indicators)
      .values(values)
      .onConflictDoUpdate({
        target: schema.indicators.code,
        set: {
          name: values.name,
          category: values.category,
          definition: values.definition,
          unit: values.unit,
          valueType: values.valueType,
          higherIsBetter: values.higherIsBetter,
          decimals: values.decimals,
          aggregation: values.aggregation,
          methodNotes: values.methodNotes,
        },
      });
  }
  const rows = await db.execute(sql`SELECT id, code FROM indicators`);
  return new Map(
    (rows.rows as Array<{ id: number; code: string }>).map((r) => [r.code, r.id]),
  );
}
