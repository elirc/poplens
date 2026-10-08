import "dotenv/config";
/**
 * REAL gridded-population load (spec, Data pipeline §2). See
 * docs/DATA-LOADING.md for downloading the GRID3 / WorldPop raster and turning
 * it into XYZ text with GDAL (Node has no raster reader in this repo):
 *
 *   gdal2xyz.py -skipnodata -csv NGA_population_v2_0_gridded.tif pop.xyz
 *
 * This script then:
 *   1. streams the XYZ file(s) and sums values into ~1 km cells
 *      (30 arc-seconds by default, --cell <degrees> to change);
 *   2. creates a DRAFT dataset (source 'grid3') and loads population_cells;
 *   3. sums the cells to ward, LGA, state and national pop_total (and pop_u5 /
 *      pop_w1549 when those rasters are given) as indicator_values in the same
 *      draft dataset;
 *   4. leaves the dataset as a draft for a data editor to review and publish
 *      (or pass --publish).
 *
 *   pnpm load:population --xyz pop.xyz [--u5 u5.xyz] [--w1549 w1549.xyz]
 *        [--year 2020] [--version "GRID3 NGA population v2.0"] [--cell 0.008333]
 *        [--replace-synthetic] [--publish] [--dry-run]
 *
 * Area analysis sums population_cells, so the script refuses to load next to
 * synthetic cells unless --replace-synthetic is given (which deletes them).
 */
import { createReadStream, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { pool } from "@/db";
import { nextVersionForSeries, publishDataset } from "@/server/datasets/versioning";
import { argString, GridAccumulator, parseArgs, parseXyzLine } from "@/server/seed/loader-utils";

const args = parseArgs(process.argv.slice(2));
const cellDeg = Number(argString(args, "cell") ?? 30 / 3600);
const year = Number(argString(args, "year") ?? new Date().getFullYear());
const label = argString(args, "version") ?? `GRID3 gridded population ${year}`;
const dryRun = args.has("dry-run");

async function accumulate(file: string): Promise<GridAccumulator> {
  const g = new GridAccumulator(cellDeg);
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  let n = 0;
  for await (const line of rl) {
    const p = parseXyzLine(line);
    if (p) g.add(p[0], p[1], p[2]);
    if (++n % 5_000_000 === 0) console.log(`  ${file}: ${n.toLocaleString()} lines`);
  }
  console.log(`  ${file}: ${n.toLocaleString()} lines → ${g.cells.size.toLocaleString()} cells, total ${Math.round(g.total()).toLocaleString()}`);
  return g;
}

async function main() {
  const xyz = argString(args, "xyz");
  if (!xyz) {
    console.log("Usage: pnpm load:population --xyz <file> [options] — see docs/DATA-LOADING.md");
    await pool.end();
    return;
  }
  for (const f of [xyz, argString(args, "u5"), argString(args, "w1549")]) {
    if (f && !existsSync(f)) {
      console.log(`File not found: ${f}\nPrepare the XYZ file(s) first — see docs/DATA-LOADING.md. Nothing was loaded.`);
      await pool.end();
      return;
    }
  }
  const pop = await accumulate(xyz);
  const u5 = argString(args, "u5") ? await accumulate(argString(args, "u5")!) : null;
  const w = argString(args, "w1549") ? await accumulate(argString(args, "w1549")!) : null;
  if (dryRun) {
    console.log("dry run — nothing written");
    await pool.end();
    return;
  }

  const synthetic = await pool.query<{ n: number }>(
    `SELECT count(*)::int n FROM population_cells c JOIN datasets d ON d.id = c.dataset_id WHERE d.is_synthetic`,
  );
  if (synthetic.rows[0].n > 0) {
    if (!args.has("replace-synthetic")) {
      throw new Error(
        `${synthetic.rows[0].n} synthetic population cells are loaded. Re-run with --replace-synthetic to delete them.`,
      );
    }
    await pool.query(
      `DELETE FROM population_cells WHERE dataset_id IN (SELECT id FROM datasets WHERE is_synthetic)`,
    );
  }

  const src = await pool.query<{ id: number }>(`SELECT id FROM sources WHERE key = 'grid3'`);
  if (!src.rows[0]) throw new Error("source 'grid3' missing — run pnpm seed (sources) first");
  const seriesKey = "grid3-population";
  const run = await pool.query<{ id: number }>(
    `INSERT INTO import_runs (kind, status, log) VALUES ('grid3', 'running', $1) RETURNING id`,
    [`population-grid ${label}`],
  );
  try {
    const ds = await pool.query<{ id: number }>(
      `INSERT INTO datasets (source_id, series_key, version, title, description, release_date, years_covered,
                             levels_covered, status, is_synthetic)
       VALUES ($1, $2, $3, $4, $5, current_date, $6, ARRAY['nation','state','lga','ward']::geo_level[], 'draft', false)
       RETURNING id`,
      [
        src.rows[0].id,
        seriesKey,
        await nextVersionForSeries(seriesKey),
        `${label} (~1 km cells)`,
        `Summed from ${xyz} to ${cellDeg}° cells by scripts/population-grid.ts`,
        String(year),
      ],
    );
    const datasetId = ds.rows[0].id;

    const keys = [...pop.cells.keys()];
    const CHUNK = 10_000;
    for (let i = 0; i < keys.length; i += CHUNK) {
      const part = keys.slice(i, i + CHUNK);
      await pool.query(
        `INSERT INTO population_cells (point, pop_total, pop_under5, pop_women_15_49, year, source_version, dataset_id)
         SELECT ST_SetSRID(ST_MakePoint(x, y), 4326), p, u, w, $6::int, $7, $8::int
         FROM unnest($1::float8[], $2::float8[], $3::float8[], $4::float8[], $5::float8[]) AS t(x, y, p, u, w)`,
        [
          part.map((k) => pop.centre(k)[0]),
          part.map((k) => pop.centre(k)[1]),
          part.map((k) => pop.cells.get(k)!),
          part.map((k) => (u5 ? (u5.cells.get(k) ?? 0) : null)),
          part.map((k) => (w ? (w.cells.get(k) ?? 0) : null)),
          year,
          label,
          datasetId,
        ],
      );
    }

    // Sum cells into every geo level as indicator values (same draft dataset).
    const measures: Array<[string, string]> = [["pop_total", "pop_total"]];
    if (u5) measures.push(["pop_u5", "pop_under5"]);
    if (w) measures.push(["pop_w1549", "pop_women_15_49"]);
    for (const [code, col] of measures) {
      await pool.query(
        `INSERT INTO indicator_values (indicator_id, geo_unit_id, year, period_label, value, dataset_id, is_estimate, note)
         SELECT i.id, g.id, $2::int, $3, round(sum(c.${col})::numeric), $4::int, true,
                'Sum of ~1 km gridded population cells (modelled estimate)'
         FROM geo_units g
         JOIN population_cells c ON c.dataset_id = $4 AND ST_Contains(g.boundary, c.point)
         JOIN indicators i ON i.code = $1
         WHERE g.level IN ('state', 'lga', 'ward') AND g.boundary IS NOT NULL
         GROUP BY i.id, g.id
         UNION ALL
         SELECT i.id, n.id, $2::int, $3, round(sum(c.${col})::numeric), $4::int, true,
                'Sum of ~1 km gridded population cells (modelled estimate)'
         FROM population_cells c JOIN indicators i ON i.code = $1
         JOIN geo_units n ON n.code = 'NG'
         WHERE c.dataset_id = $4
         GROUP BY i.id, n.id`,
        [code, year, `${year} ${label}`, datasetId],
      );
    }
    if (args.has("publish")) await publishDataset(datasetId, null);
    const stats = {
      datasetId,
      cells: keys.length,
      total: Math.round(pop.total()),
      published: args.has("publish"),
    };
    await pool.query(
      `UPDATE import_runs SET status = 'succeeded', finished_at = now(), dataset_id = $2, stats = $3 WHERE id = $1`,
      [run.rows[0].id, datasetId, JSON.stringify(stats)],
    );
    console.log(stats, args.has("publish") ? "" : "\nDataset left as DRAFT — review and publish it in the data editor.");
  } catch (e) {
    await pool.query(
      `UPDATE import_runs SET status = 'failed', finished_at = now(), error = $2 WHERE id = $1`,
      [run.rows[0].id, e instanceof Error ? e.message : String(e)],
    );
    throw e;
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error("population-grid FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
