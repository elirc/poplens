import "dotenv/config";
/**
 * REAL GRID3 load path — boundaries (state / LGA / ward) and health facilities.
 * See docs/DATA-LOADING.md for where to download the files and how to convert
 * shapefiles to GeoJSON. Nothing here runs in the demo seed.
 *
 *   pnpm load:grid3 --inspect                 print attribute names, write nothing
 *   pnpm load:grid3 --dry-run                 parse + match places, write nothing
 *   pnpm load:grid3 [--dir .storage/grid3] [--version "GRID3 NGA v2.0 (2024-05)"]
 *                   [--replace-synthetic]     also remove synthetic wards/facilities
 *                   [--publish]               publish the facilities dataset
 *
 * Expected files in --dir (each optional; missing ones are skipped):
 *   states.geojson  lgas.geojson  wards.geojson  health-facilities.geojson
 * Attribute names differ between GRID3 releases: the defaults below are only
 * CANDIDATES. Run --inspect first, then pass --field-<role>=<attribute> for any
 * role that is not detected (the script stops rather than guessing).
 *   roles: state, lga, ward, ward-code, fac-name, fac-type, fac-level,
 *          fac-ownership, version
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pool } from "@/db";
import { env } from "@/env";
import { NIGERIA_STATES } from "@/server/geo/nigeria-states";
import { allLgas, normalizePlaceName } from "@/server/seed/nigeria-lgas";
import { STATE_ALIASES } from "@/server/seed/hierarchy";
import { SIMPLIFY_TOLERANCE } from "@/server/seed/geography";
import { argString, parseArgs, pickField } from "@/server/seed/loader-utils";
import { nextVersionForSeries, publishDataset } from "@/server/datasets/versioning";

type Props = Record<string, unknown>;
interface Feature {
  properties: Props;
  geometry: { type: string; coordinates: unknown } | null;
}

const args = parseArgs(process.argv.slice(2));
const dir = argString(args, "dir") ?? path.join(env.LOCAL_STORAGE_DIR, "grid3");
const runVersion = argString(args, "version") ?? `GRID3 (loaded ${new Date().toISOString().slice(0, 10)})`;
const dryRun = args.has("dry-run") || args.has("inspect");

const CANDIDATES: Record<string, string[]> = {
  state: ["statename", "state_name", "state", "admin1name"],
  lga: ["lganame", "lga_name", "lga", "admin2name", "shapename"],
  ward: ["wardname", "ward_name", "ward", "admin3name"],
  "ward-code": ["wardcode", "ward_code"],
  "fac-name": ["primary_name", "facility_name", "name"],
  "fac-type": ["type", "facility_type", "category"],
  "fac-level": ["category", "level", "facility_level", "care_level"],
  "fac-ownership": ["ownership", "owner"],
  version: ["source_version", "version", "timestamp", "date"],
};

function field(sample: Props, role: string, required: boolean): string | null {
  const f = pickField(sample, CANDIDATES[role] ?? [], argString(args, `field-${role}`));
  if (!f && required) {
    throw new Error(
      `Could not find the '${role}' attribute. Available: ${Object.keys(sample).join(", ")}. ` +
        `Pass --field-${role}=<attribute>.`,
    );
  }
  return f;
}

function readFeatures(file: string): Feature[] | null {
  const p = path.join(dir, file);
  if (!existsSync(p)) {
    console.log(`- ${file}: not found in ${dir} (skipped)`);
    return null;
  }
  const fc = JSON.parse(readFileSync(p, "utf8")) as { features?: Feature[] };
  if (!Array.isArray(fc.features)) throw new Error(`${p} is not a GeoJSON FeatureCollection`);
  console.log(`- ${file}: ${fc.features.length} features`);
  return fc.features.filter((f) => f.geometry);
}

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

/** Resolve a state from a name via names + aliases. */
const stateByName = new Map<string, string>();
for (const s of NIGERIA_STATES) {
  for (const n of [s.name, ...(STATE_ALIASES[s.code] ?? [])]) stateByName.set(normalizePlaceName(n), s.code);
  stateByName.set(normalizePlaceName(s.code.slice(3)), s.code);
}
const lgaIndex = new Map<string, string>(); // `${state}|${norm}` → lga code
for (const l of allLgas()) {
  for (const n of [l.name, ...l.aliases]) lgaIndex.set(`${l.stateCode}|${normalizePlaceName(n)}`, l.code);
}

async function spatialState(geojson: string): Promise<string | null> {
  const r = await pool.query<{ code: string }>(
    `SELECT code FROM geo_units WHERE level = 'state' AND boundary IS NOT NULL
     ORDER BY ST_Distance(boundary, ST_PointOnSurface(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326))) LIMIT 1`,
    [geojson],
  );
  return r.rows[0]?.code ?? null;
}

const MULTI = `ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)), 3))`;

async function finalise(level: string, codes: string[]) {
  if (dryRun || codes.length === 0) return;
  await pool.query(
    `UPDATE geo_units SET
       boundary_simplified = ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SimplifyPreserveTopology(boundary, $2)), 3)),
       centre = ST_PointOnSurface(boundary),
       area_sq_km = ST_Area(boundary::geography) / 1e6
     WHERE code = ANY($1::text[])`,
    [codes, SIMPLIFY_TOLERANCE[level]],
  );
}

async function loadStates(feats: Feature[], stats: Record<string, unknown>) {
  const f = field(feats[0].properties, "state", true)!;
  const vf = field(feats[0].properties, "version", false);
  const done: string[] = [];
  const unknown: string[] = [];
  for (const ft of feats) {
    const code = stateByName.get(normalizePlaceName(str(ft.properties[f])));
    if (!code) {
      unknown.push(str(ft.properties[f]));
      continue;
    }
    done.push(code);
    if (!dryRun) {
      await pool.query(
        `UPDATE geo_units SET boundary = ${MULTI}, boundary_version = $3 WHERE code = $2`,
        [JSON.stringify(ft.geometry), code, vf ? `${runVersion} ${str(ft.properties[vf])}` : runVersion],
      );
    }
  }
  await finalise("state", done);
  stats.states = { matched: done.length, unknown };
}

async function loadLgas(feats: Feature[], stats: Record<string, unknown>) {
  const lf = field(feats[0].properties, "lga", true)!;
  const sf = field(feats[0].properties, "state", false);
  const vf = field(feats[0].properties, "version", false);
  const done: string[] = [];
  const unknown: string[] = [];
  for (const ft of feats) {
    const g = JSON.stringify(ft.geometry);
    const st = (sf && stateByName.get(normalizePlaceName(str(ft.properties[sf])))) || (await spatialState(g));
    const code = st ? lgaIndex.get(`${st}|${normalizePlaceName(str(ft.properties[lf]))}`) : undefined;
    if (!code) {
      unknown.push(`${str(ft.properties[lf])} (${st ?? "?"})`);
      continue;
    }
    done.push(code);
    if (!dryRun) {
      await pool.query(
        `UPDATE geo_units SET boundary = ${MULTI}, boundary_version = $3 WHERE code = $2`,
        [g, code, vf ? `${runVersion} ${str(ft.properties[vf])}` : runVersion],
      );
    }
  }
  await finalise("lga", done);
  stats.lgas = { matched: done.length, unknown: unknown.slice(0, 50), unknownCount: unknown.length };
}

async function loadWards(feats: Feature[], stats: Record<string, unknown>) {
  const wf = field(feats[0].properties, "ward", true)!;
  const lf = field(feats[0].properties, "lga", true)!;
  const sf = field(feats[0].properties, "state", false);
  const cf = field(feats[0].properties, "ward-code", false);
  const vf = field(feats[0].properties, "version", false);
  const byLga = new Map<string, Feature[]>();
  const unknown: string[] = [];
  for (const ft of feats) {
    const st =
      (sf && stateByName.get(normalizePlaceName(str(ft.properties[sf])))) ||
      (await spatialState(JSON.stringify(ft.geometry)));
    const lga = st ? lgaIndex.get(`${st}|${normalizePlaceName(str(ft.properties[lf]))}`) : undefined;
    if (!lga) {
      unknown.push(`${str(ft.properties[wf])} / ${str(ft.properties[lf])}`);
      continue;
    }
    if (!byLga.has(lga)) byLga.set(lga, []);
    byLga.get(lga)!.push(ft);
  }
  let inserted = 0;
  const codes: string[] = [];
  for (const [lgaCode, list] of byLga) {
    const parent = await pool.query<{ id: number; state_id: number }>(
      `SELECT id, state_id FROM geo_units WHERE code = $1`,
      [lgaCode],
    );
    if (!parent.rows[0]) continue;
    const { id: lgaId, state_id: stateId } = parent.rows[0];
    if (!dryRun && args.has("replace-synthetic")) {
      // Synthetic wards are `<lga>-Wnn`; drop them (and their synthetic values).
      const syn = await pool.query<{ id: number }>(
        `SELECT id FROM geo_units WHERE parent_id = $1 AND level = 'ward' AND code ~ '-W[0-9]{2}$'`,
        [lgaId],
      );
      const ids = syn.rows.map((r) => r.id);
      if (ids.length) {
        await pool.query(`DELETE FROM indicator_values WHERE geo_unit_id = ANY($1::int[])`, [ids]);
        await pool.query(`UPDATE health_facilities SET ward_id = NULL WHERE ward_id = ANY($1::int[])`, [ids]);
        await pool.query(`DELETE FROM geo_units WHERE id = ANY($1::int[])`, [ids]);
      }
    }
    for (const ft of list) {
      const name = str(ft.properties[wf]);
      const suffix = cf && str(ft.properties[cf]) ? str(ft.properties[cf]) : name;
      const code = `${lgaCode}-${suffix.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
      codes.push(code);
      inserted++;
      if (dryRun) continue;
      await pool.query(
        `INSERT INTO geo_units (level, name, code, parent_id, state_id, boundary, boundary_version)
         VALUES ('ward', $2, $3, $4, $5, ${MULTI}, $6)
         ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, boundary = EXCLUDED.boundary,
           boundary_version = EXCLUDED.boundary_version, parent_id = EXCLUDED.parent_id`,
        [
          JSON.stringify(ft.geometry),
          name,
          code,
          lgaId,
          stateId,
          vf ? `${runVersion} ${str(ft.properties[vf])}` : runVersion,
        ],
      );
    }
  }
  await finalise("ward", codes);
  stats.wards = { loaded: inserted, lgas: byLga.size, unknown: unknown.slice(0, 50), unknownCount: unknown.length };
}

function careLevel(raw: string): "primary" | "secondary" | "tertiary" {
  const t = raw.toLowerCase();
  if (t.includes("tertiary") || t.includes("teaching") || t.includes("federal medical")) return "tertiary";
  if (t.includes("secondary") || t.includes("general hospital")) return "secondary";
  return "primary";
}

function ownership(raw: string): "public" | "private" | "faith_based" | "ngo" | "unknown" {
  const t = raw.toLowerCase();
  if (!t) return "unknown";
  if (t.includes("faith") || t.includes("mission")) return "faith_based";
  if (t.includes("ngo") || t.includes("non-gov") || t.includes("non gov")) return "ngo";
  if (t.includes("private")) return "private";
  if (t.includes("public") || t.includes("government") || t.includes("federal") || t.includes("state")) return "public";
  return "unknown";
}

async function loadFacilities(feats: Feature[], stats: Record<string, unknown>) {
  const sample = feats[0].properties;
  const nf = field(sample, "fac-name", true)!;
  const tf = field(sample, "fac-type", true)!;
  const lvf = field(sample, "fac-level", false);
  const of = field(sample, "fac-ownership", false);
  const vf = field(sample, "version", false);
  const points = feats.filter((f) => f.geometry?.type === "Point");
  stats.facilities = { features: feats.length, points: points.length };
  if (dryRun) return;
  const src = await pool.query<{ id: number }>(`SELECT id FROM sources WHERE key = 'grid3'`);
  if (!src.rows[0]) throw new Error("source 'grid3' missing — run pnpm seed (sources) first");
  const seriesKey = "grid3-health-facilities";
  const ds = await pool.query<{ id: number }>(
    `INSERT INTO datasets (source_id, series_key, version, title, description, release_date, years_covered, levels_covered, status, is_synthetic)
     VALUES ($1, $2, $3, $4, $5, current_date, $6, ARRAY['ward','lga','state']::geo_level[], 'draft', false)
     RETURNING id`,
    [
      src.rows[0].id,
      seriesKey,
      await nextVersionForSeries(seriesKey),
      `GRID3 health facilities — ${runVersion}`,
      `Loaded by scripts/load-grid3.ts from ${dir}`,
      runVersion,
    ],
  );
  const datasetId = ds.rows[0].id;
  // Older GRID3 facility loads are replaced (dataset rows stay for history).
  await pool.query(
    `DELETE FROM health_facilities WHERE dataset_id IN
       (SELECT id FROM datasets WHERE series_key = $1 AND id <> $2)`,
    [seriesKey, datasetId],
  );
  if (args.has("replace-synthetic")) {
    await pool.query(
      `DELETE FROM health_facilities WHERE dataset_id IN
         (SELECT d.id FROM datasets d JOIN sources s ON s.id = d.source_id WHERE s.key = 'synthetic')`,
    );
  }
  const CHUNK = 2000;
  for (let i = 0; i < points.length; i += CHUNK) {
    const part = points.slice(i, i + CHUNK);
    await pool.query(
      `INSERT INTO health_facilities (name, type, care_level, ownership, point, source_version, dataset_id)
       SELECT n, t, cl::care_level, o::facility_ownership, ST_SetSRID(ST_GeomFromGeoJSON(g), 4326), v, $7::int
       FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[]) AS x(n, t, cl, o, g, v)`,
      [
        part.map((f) => str(f.properties[nf]) || "Unnamed facility"),
        part.map((f) => str(f.properties[tf]) || "Unknown"),
        part.map((f) => careLevel(`${lvf ? str(f.properties[lvf]) : ""} ${str(f.properties[tf])}`)),
        part.map((f) => ownership(of ? str(f.properties[of]) : "")),
        part.map((f) => JSON.stringify(f.geometry)),
        part.map((f) => (vf ? `${runVersion} ${str(f.properties[vf])}` : runVersion)),
        datasetId,
      ],
    );
  }
  // Attach ward / LGA / state by containment.
  await pool.query(
    `UPDATE health_facilities f SET
       ward_id = (SELECT id FROM geo_units g WHERE g.level = 'ward' AND ST_Contains(g.boundary, f.point) LIMIT 1),
       lga_id = (SELECT id FROM geo_units g WHERE g.level = 'lga' AND ST_Contains(g.boundary, f.point) LIMIT 1),
       state_id = (SELECT id FROM geo_units g WHERE g.level = 'state' AND ST_Contains(g.boundary, f.point) LIMIT 1)
     WHERE f.dataset_id = $1`,
    [datasetId],
  );
  if (args.has("publish")) await publishDataset(datasetId, null);
  stats.facilities = { ...(stats.facilities as object), datasetId, published: args.has("publish") };
}

async function main() {
  console.log(`GRID3 loader — dir: ${dir}${dryRun ? " (no writes)" : ""}`);
  if (!existsSync(dir)) {
    console.log(
      `Directory not found: ${dir}\nDownload the GRID3 files first — see docs/DATA-LOADING.md. Nothing was loaded.`,
    );
    await pool.end();
    return;
  }
  const files = {
    states: readFeatures("states.geojson"),
    lgas: readFeatures("lgas.geojson"),
    wards: readFeatures("wards.geojson"),
    facilities: readFeatures("health-facilities.geojson"),
  };
  if (args.has("inspect")) {
    for (const [k, f] of Object.entries(files)) {
      if (f?.length) console.log(`\n${k}: attributes of first feature\n`, f[0].properties);
    }
    await pool.end();
    return;
  }
  if (!Object.values(files).some((f) => f?.length)) {
    console.log("No GRID3 files found. Nothing was loaded — see docs/DATA-LOADING.md.");
    await pool.end();
    return;
  }
  const run = dryRun
    ? null
    : await pool.query<{ id: number }>(
        `INSERT INTO import_runs (kind, status, log) VALUES ('grid3', 'running', $1) RETURNING id`,
        [`load-grid3 ${runVersion}`],
      );
  const stats: Record<string, unknown> = { version: runVersion, dir };
  try {
    if (files.states?.length) await loadStates(files.states, stats);
    if (files.lgas?.length) await loadLgas(files.lgas, stats);
    if (files.wards?.length) await loadWards(files.wards, stats);
    if (files.facilities?.length) await loadFacilities(files.facilities, stats);
    if (run) {
      await pool.query(
        `UPDATE import_runs SET status = 'succeeded', finished_at = now(), stats = $2 WHERE id = $1`,
        [run.rows[0].id, JSON.stringify(stats)],
      );
    }
    console.log(JSON.stringify(stats, null, 2));
  } catch (e) {
    if (run) {
      await pool.query(
        `UPDATE import_runs SET status = 'failed', finished_at = now(), error = $2 WHERE id = $1`,
        [run.rows[0].id, e instanceof Error ? e.message : String(e)],
      );
    }
    throw e;
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error("load-grid3 FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
