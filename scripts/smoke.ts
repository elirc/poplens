import "dotenv/config";
/**
 * Baseline runtime smoke against poplens_dev:
 * 1. PostGIS roundtrip through drizzle schema (insert geometry, read back).
 * 2. Dataset lifecycle: draft invisible → publish visible → v2 supersedes →
 *    rollback restores v1.
 * 3. Better Auth signup via server API (validates drizzle adapter mapping).
 * Cleans up after itself.
 */
import { sql, eq } from "drizzle-orm";
import { db, pool, schema } from "@/db";
import {
  nextVersionForSeries,
  publishDataset,
  rollbackDataset,
} from "@/server/datasets/versioning";
import { getPublishedValue } from "@/server/indicators/queries";
import { auth } from "@/lib/auth";

async function main() {
  // --- 1. PostGIS roundtrip
  await db.execute(sql`DELETE FROM geo_units WHERE code LIKE 'SMOKE-%'`);
  await db.execute(sql`
    INSERT INTO geo_units (level, name, code, boundary, boundary_simplified, centre, area_sq_km)
    VALUES ('state', 'Smoke State', 'SMOKE-ST',
      ST_Multi(ST_GeomFromText('POLYGON((7 9,8 9,8 10,7 10,7 9))',4326)),
      ST_Multi(ST_GeomFromText('POLYGON((7 9,8 9,8 10,7 10,7 9))',4326)),
      ST_SetSRID(ST_MakePoint(7.5,9.5),4326), 12100)
  `);
  const geo = await db.execute(
    sql`SELECT id, ST_AsGeoJSON(centre) g FROM geo_units WHERE code='SMOKE-ST'`,
  );
  const geoId = (geo.rows[0] as { id: number }).id;
  console.log("postgis roundtrip OK", (geo.rows[0] as { g: string }).g);

  // --- 2. dataset lifecycle
  const [src] = await db
    .insert(schema.sources)
    .values({
      key: `smoke-${Date.now()}`,
      publisher: "Smoke",
      title: "Smoke source",
      licence: "CC0",
      allowsRedistribution: true,
    })
    .returning();
  const [ind] = await db
    .insert(schema.indicators)
    .values({
      code: `smoke_ind_${Date.now()}`,
      name: "Smoke indicator",
      category: "population",
      definition: "d",
      unit: "people",
      valueType: "count",
      decimals: 0,
      aggregation: "sum",
    })
    .returning();

  const seriesKey = `smoke-series-${Date.now()}`;
  const mkDataset = async (title: string) => {
    const [d] = await db
      .insert(schema.datasets)
      .values({
        sourceId: src.id,
        seriesKey,
        version: await nextVersionForSeries(seriesKey),
        title,
        isSynthetic: true,
      })
      .returning();
    return d;
  };
  const d1 = await mkDataset("v1");
  await db.insert(schema.indicatorValues).values({
    indicatorId: ind.id,
    geoUnitId: geoId,
    year: 2023,
    value: 111,
    datasetId: d1.id,
    isEstimate: true,
  });
  let v = await getPublishedValue(ind.id, geoId);
  if (v !== null) throw new Error("draft leaked to public!");
  console.log("draft invisible OK");

  await publishDataset(d1.id, null);
  v = await getPublishedValue(ind.id, geoId);
  if (v?.value !== 111) throw new Error("publish failed");
  console.log("publish visible OK");

  const d2 = await mkDataset("v2");
  await db.insert(schema.indicatorValues).values({
    indicatorId: ind.id,
    geoUnitId: geoId,
    year: 2023,
    value: 222,
    datasetId: d2.id,
    isEstimate: true,
  });
  await publishDataset(d2.id, null);
  v = await getPublishedValue(ind.id, geoId);
  if (v?.value !== 222) throw new Error("supersede failed");
  console.log("supersede OK");

  await rollbackDataset(d2.id, null);
  v = await getPublishedValue(ind.id, geoId);
  if (v?.value !== 111) throw new Error("rollback failed");
  console.log("rollback restores v1 OK");

  // --- 3. Better Auth signup
  const email = `smoke-${Date.now()}@poplens.local`;
  const res = await auth.api.signUpEmail({
    body: { email, password: "smokepass123", name: "Smoke User" },
  });
  if (!res.user?.id) throw new Error("signup failed");
  console.log("better-auth signup OK", res.user.id);

  // cleanup
  await db.execute(sql`DELETE FROM indicator_values WHERE dataset_id IN (${d1.id}, ${d2.id})`);
  await db.execute(sql`DELETE FROM datasets WHERE series_key = ${seriesKey}`);
  await db.delete(schema.indicators).where(eq(schema.indicators.id, ind.id));
  await db.delete(schema.sources).where(eq(schema.sources.id, src.id));
  await db.execute(sql`DELETE FROM geo_units WHERE code LIKE 'SMOKE-%'`);
  await db.delete(schema.user).where(eq(schema.user.email, email));
  console.log("SMOKE-ALL-OK");
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
