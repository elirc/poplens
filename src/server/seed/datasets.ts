import { db, pool, schema } from "@/db";
import {
  nextVersionForSeries,
  publishDataset,
} from "@/server/datasets/versioning";
import type { GeoLevel } from "@/server/geo/queries";

/**
 * Dataset plumbing for the synthetic seed. Every seeded dataset is
 * isSynthetic=true, from source 'synthetic', created as a draft and then
 * PUBLISHED through the shared versioning module (publishDataset) so the
 * normal lifecycle/audit applies.
 */

export const SYNTHETIC_NOTE = "SYNTHETIC demo value — not a real statistic";
export const SERIES_PREFIX = "synthetic-";

export async function createSyntheticDraft(opts: {
  sourceId: number;
  seriesKey: string;
  title: string;
  description: string;
  yearsCovered: string;
  levelsCovered: GeoLevel[];
  uploadedBy: string | null;
}): Promise<number> {
  const [d] = await db
    .insert(schema.datasets)
    .values({
      sourceId: opts.sourceId,
      seriesKey: opts.seriesKey,
      version: await nextVersionForSeries(opts.seriesKey),
      title: opts.title,
      description: opts.description,
      releaseDate: new Date().toISOString().slice(0, 10),
      yearsCovered: opts.yearsCovered,
      levelsCovered: opts.levelsCovered,
      status: "draft",
      isSynthetic: true,
      uploadedBy: opts.uploadedBy,
      changeSummary: { seeded: true, note: SYNTHETIC_NOTE },
    })
    .returning({ id: schema.datasets.id });
  return d.id;
}

export async function publishSynthetic(datasetId: number, actorId: string | null): Promise<void> {
  await publishDataset(datasetId, actorId);
}

export interface ValueRow {
  indicatorId: number;
  geoUnitId: number;
  year: number;
  periodLabel: string | null;
  value: number;
  lower: number | null;
  upper: number | null;
  sex?: string;
  ageGroup?: string;
  residence?: string;
  isEstimate?: boolean;
  note?: string;
}

/** Bulk insert indicator values with one unnest() statement per chunk. */
export async function insertValues(datasetId: number, rows: ValueRow[]): Promise<number> {
  const CHUNK = 5000;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const p = rows.slice(i, i + CHUNK);
    await pool.query(
      `INSERT INTO indicator_values
         (indicator_id, geo_unit_id, year, period_label, value, lower, upper,
          sex, age_group, residence, dataset_id, is_estimate, note)
       SELECT ind, geo, yr, lbl, val, lo, up, sx, ag, res, $11::int, est, nt
       FROM unnest($1::int[], $2::int[], $3::int[], $4::text[], $5::float8[],
                   $6::float8[], $7::float8[], $8::text[], $9::text[], $10::text[],
                   $12::bool[], $13::text[])
         AS t(ind, geo, yr, lbl, val, lo, up, sx, ag, res, est, nt)`,
      [
        p.map((r) => r.indicatorId),
        p.map((r) => r.geoUnitId),
        p.map((r) => r.year),
        p.map((r) => r.periodLabel),
        p.map((r) => r.value),
        p.map((r) => r.lower),
        p.map((r) => r.upper),
        p.map((r) => r.sex ?? "all"),
        p.map((r) => r.ageGroup ?? "all"),
        p.map((r) => r.residence ?? "all"),
        datasetId,
        p.map((r) => r.isEstimate ?? true),
        p.map((r) => r.note ?? SYNTHETIC_NOTE),
      ],
    );
  }
  return rows.length;
}

/**
 * Remove everything previously seeded from the 'synthetic' source so the
 * seed can be re-run: facilities, population cells, values and outbreak rows
 * (the last two cascade from datasets). FK references from logs are nulled
 * rather than deleting other people's rows.
 */
export async function wipeSyntheticData(syntheticSourceId: number): Promise<number> {
  const ids = await pool.query<{ id: number }>(
    `SELECT id FROM datasets WHERE source_id = $1`,
    [syntheticSourceId],
  );
  const list = ids.rows.map((r) => r.id);
  if (list.length === 0) return 0;
  await pool.query(`UPDATE import_runs SET dataset_id = NULL WHERE dataset_id = ANY($1::int[])`, [list]);
  await pool.query(`UPDATE download_log SET dataset_id = NULL WHERE dataset_id = ANY($1::int[])`, [list]);
  await pool.query(`DELETE FROM health_facilities WHERE dataset_id = ANY($1::int[])`, [list]);
  await pool.query(`DELETE FROM population_cells WHERE dataset_id = ANY($1::int[])`, [list]);
  await pool.query(`DELETE FROM indicator_values WHERE dataset_id = ANY($1::int[])`, [list]);
  await pool.query(`DELETE FROM outbreak_reports WHERE dataset_id = ANY($1::int[])`, [list]);
  await pool.query(`DELETE FROM datasets WHERE id = ANY($1::int[])`, [list]);
  return list.length;
}
