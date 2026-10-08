import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { PoolClient } from "pg";
import { pool } from "@/db";
import { env } from "@/env";
import {
  NATION_CODE,
  NATION_NAME,
  NIGERIA_STATES,
  NIGERIA_ZONES,
} from "@/server/geo/nigeria-states";
import {
  NATION_ALIASES,
  STATE_ALIASES,
  buildHierarchy,
  type StateNode,
} from "./hierarchy";
import { normalizePlaceName } from "./nigeria-lgas";
import {
  buildPlaceholderGeometry,
  ringToMultiPolygon,
  type Ring,
} from "./placeholder-geometry";
import { NIGERIA_BBOX, STATE_POINTS } from "./state-points";

/**
 * Geography load for the seed:
 *  1. Upsert nation → 6 zones → 37 states → 774 LGAs → synthetic wards
 *     (codes are stable, so ids survive re-runs and FKs stay valid).
 *  2. Boundaries: real simplified GRID3 boundaries via geoBoundaries gbOpen
 *     (ADM0/1/2, CC BY 4.0), cached in .storage/geo/. If anything fails,
 *     fall back to placeholder geometry (Voronoi states + sliced LGAs).
 *  3. Wards are ALWAYS synthetic subdivisions of their LGA (real ward shapes
 *     need GRID3 operational wards — docs/DATA-LOADING.md).
 *  4. Simplified shapes, centre points, areas and boundary versions.
 *  5. geo_aliases (origin 'seed').
 */

export const PLACEHOLDER_VERSION = "placeholder-v1";
export const WARD_PLACEHOLDER_VERSION = "placeholder-v1 (synthetic wards)";
const GB_API = "https://www.geoboundaries.org/api/current/gbOpen/NGA";
const LEVELS = ["ADM0", "ADM1", "ADM2"] as const;
type GbLevel = (typeof LEVELS)[number];

export const SIMPLIFY_TOLERANCE: Record<string, number> = {
  nation: 0.02,
  zone: 0.01,
  state: 0.01,
  lga: 0.005,
  ward: 0.002,
};

export interface GeographyResult {
  path: "geoboundaries" | "placeholder";
  boundaryVersion: string;
  reason?: string;
  ids: Map<string, number>;
  hierarchy: StateNode[];
  counts: Record<string, number>;
  lgasUnmatched: string[];
  wardsWithoutShape: number;
  aliases: number;
}

interface GbFeature {
  type: "Feature";
  properties: { shapeName: string; shapeISO?: string };
  geometry: { type: string; coordinates: unknown };
}

interface GbFile {
  meta: { buildDate?: string; boundarySource?: string; boundaryLicense?: string };
  features: GbFeature[];
}

const geoDir = () => path.join(env.LOCAL_STORAGE_DIR, "geo");

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const res = await fetch(url, { signal: AbortSignal.timeout(ms), redirect: "follow" });
  if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
  return res;
}

/** Load one geoBoundaries level from cache, downloading it if absent. */
async function loadGbLevel(level: GbLevel, log: (m: string) => void): Promise<GbFile> {
  const dir = geoDir();
  mkdirSync(dir, { recursive: true });
  const dataPath = path.join(dir, `geoBoundaries-NGA-${level}_simplified.geojson`);
  const metaPath = path.join(dir, `geoBoundaries-NGA-${level}.meta.json`);
  let meta: GbFile["meta"] | null = existsSync(metaPath)
    ? JSON.parse(readFileSync(metaPath, "utf8"))
    : null;
  if (!meta || !existsSync(dataPath)) {
    log(`  downloading geoBoundaries ${level} metadata…`);
    const m = (await (await fetchWithTimeout(`${GB_API}/${level}/`, 60_000)).json()) as {
      simplifiedGeometryGeoJSON?: string;
      buildDate?: string;
      boundarySource?: string;
      boundaryLicense?: string;
    };
    if (!m.simplifiedGeometryGeoJSON) throw new Error(`no simplifiedGeometryGeoJSON for ${level}`);
    meta = { buildDate: m.buildDate, boundarySource: m.boundarySource, boundaryLicense: m.boundaryLicense };
    if (!existsSync(dataPath)) {
      log(`  downloading ${m.simplifiedGeometryGeoJSON}`);
      const body = await (await fetchWithTimeout(m.simplifiedGeometryGeoJSON, 180_000)).text();
      writeFileSync(dataPath, body);
    }
    writeFileSync(metaPath, JSON.stringify({ ...m, ...meta }, null, 2));
  }
  const fc = JSON.parse(readFileSync(dataPath, "utf8")) as { features?: GbFeature[] };
  if (!Array.isArray(fc.features) || fc.features.length === 0) {
    throw new Error(`${dataPath} has no features`);
  }
  return { meta, features: fc.features };
}

/** "Dec 12, 2023" → "2023-12-12" (falls back to the raw string). */
function isoDate(s: string | undefined): string {
  if (!s) return "unknown";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toISOString().slice(0, 10);
}

/* ─────────────────────────── unit upsert ─────────────────────────── */

async function upsertUnits(
  c: PoolClient,
  rows: Array<{ level: string; name: string; code: string; parentId: number | null; stateId: number | null }>,
): Promise<Map<string, number>> {
  const ids = new Map<string, number>();
  const CHUNK = 2000;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const part = rows.slice(i, i + CHUNK);
    const res = await c.query<{ id: number; code: string }>(
      `INSERT INTO geo_units (level, name, code, parent_id, state_id)
       SELECT l::geo_level, n, cd, p, s
       FROM unnest($1::text[], $2::text[], $3::text[], $4::int[], $5::int[]) AS t(l, n, cd, p, s)
       ON CONFLICT (code) DO UPDATE SET
         level = EXCLUDED.level, name = EXCLUDED.name,
         parent_id = EXCLUDED.parent_id, state_id = EXCLUDED.state_id
       RETURNING id, code`,
      [
        part.map((r) => r.level),
        part.map((r) => r.name),
        part.map((r) => r.code),
        part.map((r) => r.parentId),
        part.map((r) => r.stateId),
      ],
    );
    for (const r of res.rows) ids.set(r.code, r.id);
  }
  return ids;
}

async function upsertHierarchy(c: PoolClient, h: StateNode[]): Promise<Map<string, number>> {
  const ids = new Map<string, number>();
  const merge = (m: Map<string, number>) => m.forEach((v, k) => ids.set(k, v));
  merge(
    await upsertUnits(c, [
      { level: "nation", name: NATION_NAME, code: NATION_CODE, parentId: null, stateId: null },
    ]),
  );
  merge(
    await upsertUnits(
      c,
      NIGERIA_ZONES.map((z) => ({
        level: "zone",
        name: z.name,
        code: z.code,
        parentId: ids.get(NATION_CODE)!,
        stateId: null,
      })),
    ),
  );
  merge(
    await upsertUnits(
      c,
      h.map((s) => ({ level: "state", name: s.name, code: s.code, parentId: ids.get(s.zone)!, stateId: null })),
    ),
  );
  await c.query(`UPDATE geo_units SET state_id = id WHERE level = 'state' AND state_id IS DISTINCT FROM id`);
  merge(
    await upsertUnits(
      c,
      h.flatMap((s) =>
        s.lgas.map((l) => ({
          level: "lga",
          name: l.name,
          code: l.code,
          parentId: ids.get(s.code)!,
          stateId: ids.get(s.code)!,
        })),
      ),
    ),
  );
  merge(
    await upsertUnits(
      c,
      h.flatMap((s) =>
        s.lgas.flatMap((l) =>
          l.wards.map((w) => ({
            level: "ward",
            name: w.name,
            code: w.code,
            parentId: ids.get(l.code)!,
            stateId: ids.get(s.code)!,
          })),
        ),
      ),
    ),
  );
  return ids;
}

/* ───────────────────── real boundaries (geoBoundaries) ───────────────────── */

/** Deterministic positive int4 seed from a text column (safe for INT_MIN hashes). */
const seedSql = (col: string) =>
  `(((hashtext(${col})::bigint % 2147483646) + 2147483646) % 2147483646 + 1)::int`;

const MAKE_MULTI = (expr: string) =>
  `ST_Multi(ST_CollectionExtract(ST_MakeValid(${expr}), 3))`;

/** Map an ADM1 feature to our state code (ISO first, then name/alias). */
function stateCodeForAdm1(f: GbFeature): string | null {
  const iso = f.properties.shapeISO ?? "";
  if (NIGERIA_STATES.some((s) => s.code === iso)) return iso;
  const n = normalizePlaceName(f.properties.shapeName);
  for (const s of NIGERIA_STATES) {
    const names = [s.name, ...(STATE_ALIASES[s.code] ?? [])].map(normalizePlaceName);
    if (names.includes(n)) return s.code;
  }
  return null;
}

/** Dice coefficient on character bigrams (fuzzy fallback for LGA names). */
function similarity(a: string, b: string): number {
  const grams = (s: string) => {
    const out = new Map<string, number>();
    const t = ` ${s} `;
    for (let i = 0; i < t.length - 1; i++) {
      const g = t.slice(i, i + 2);
      out.set(g, (out.get(g) ?? 0) + 1);
    }
    return out;
  };
  const ga = grams(a);
  const gb = grams(b);
  let inter = 0;
  let total = 0;
  ga.forEach((v, k) => {
    inter += Math.min(v, gb.get(k) ?? 0);
    total += v;
  });
  gb.forEach((v) => (total += v));
  return total === 0 ? 0 : (2 * inter) / total;
}

async function loadRealBoundaries(
  c: PoolClient,
  h: StateNode[],
  log: (m: string) => void,
): Promise<{ version: string; lgasUnmatched: string[] }> {
  const files: Partial<Record<GbLevel, GbFile>> = {};
  for (const l of LEVELS) files[l] = await loadGbLevel(l, log);
  const version = `geoBoundaries-gbOpen-${isoDate(files.ADM1!.meta.buildDate)}`;

  await c.query(`DROP TABLE IF EXISTS stg_gb`);
  await c.query(
    `CREATE TEMP TABLE stg_gb (lvl text, idx int, name text, code text, geom geometry(MultiPolygon, 4326))`,
  );
  for (const level of LEVELS) {
    const feats = files[level]!.features;
    const BATCH = 150;
    for (let i = 0; i < feats.length; i += BATCH) {
      const part = feats.slice(i, i + BATCH);
      await c.query(
        `INSERT INTO stg_gb (lvl, idx, name, code, geom)
         SELECT $1, i, n, cd, ${MAKE_MULTI("ST_SetSRID(ST_GeomFromGeoJSON(g), 4326)")}
         FROM unnest($2::int[], $3::text[], $4::text[], $5::text[]) AS t(i, n, cd, g)`,
        [
          level,
          part.map((_, k) => i + k),
          part.map((f) => f.properties.shapeName),
          part.map((f) =>
            level === "ADM0" ? NATION_CODE : level === "ADM1" ? stateCodeForAdm1(f) : null,
          ),
          part.map((f) => JSON.stringify(f.geometry)),
        ],
      );
    }
  }
  const missingStates = await c.query(
    `SELECT name FROM stg_gb WHERE lvl = 'ADM1' AND code IS NULL`,
  );
  if (missingStates.rowCount) {
    throw new Error(`unmatched ADM1 features: ${missingStates.rows.map((r) => r.name).join(", ")}`);
  }
  const stateCount = await c.query(`SELECT count(DISTINCT code)::int n FROM stg_gb WHERE lvl='ADM1'`);
  if (stateCount.rows[0].n !== 37) throw new Error(`expected 37 ADM1 states, got ${stateCount.rows[0].n}`);

  // States + nation first: LGA → state assignment is spatial.
  await c.query(
    `UPDATE geo_units g SET boundary = s.geom
     FROM stg_gb s WHERE s.lvl IN ('ADM0','ADM1') AND s.code = g.code`,
  );

  // Assign each ADM2 feature to the state containing its point-on-surface
  // (nearest state if it falls in a sliver between state polygons).
  const adm2 = await c.query<{ idx: number; name: string; state_code: string }>(
    `SELECT a.idx, a.name,
       COALESCE(
         (SELECT g.code FROM geo_units g
           WHERE g.level = 'state' AND ST_Contains(g.boundary, ST_PointOnSurface(a.geom)) LIMIT 1),
         (SELECT g.code FROM geo_units g WHERE g.level = 'state'
           ORDER BY g.boundary <-> ST_PointOnSurface(a.geom) LIMIT 1)
       ) AS state_code
     FROM stg_gb a WHERE a.lvl = 'ADM2'`,
  );

  // Match names within the state: exact normalized name/alias, else the
  // unique exact match anywhere, else best bigram similarity ≥ 0.75 in-state.
  const byState = new Map(h.map((s) => [s.code, s.lgas]));
  const allNames = h.flatMap((s) =>
    s.lgas.map((l) => ({ code: l.code, keys: [l.name, ...l.aliases].map(normalizePlaceName) })),
  );
  const assigned = new Map<number, string>();
  const taken = new Set<string>();
  const unresolved: string[] = [];
  for (const r of adm2.rows) {
    const key = normalizePlaceName(r.name);
    const inState = (byState.get(r.state_code) ?? []).filter((l) =>
      [l.name, ...l.aliases].map(normalizePlaceName).includes(key),
    );
    let code: string | null = inState.length === 1 ? inState[0].code : null;
    if (!code) {
      const anywhere = allNames.filter((n) => n.keys.includes(key));
      if (anywhere.length === 1) code = anywhere[0].code;
    }
    if (!code) {
      const best = (byState.get(r.state_code) ?? [])
        .map((l) => ({ code: l.code, score: Math.max(...[l.name, ...l.aliases].map((n) => similarity(normalizePlaceName(n), key))) }))
        .sort((a, b) => b.score - a.score)[0];
      if (best && best.score >= 0.75) code = best.code;
    }
    if (!code || taken.has(code)) {
      unresolved.push(`${r.name} (${r.state_code})${code ? " duplicate" : ""}`);
      continue;
    }
    taken.add(code);
    assigned.set(r.idx, code);
  }
  if (unresolved.length) log(`  WARNING unresolved ADM2 features: ${unresolved.join("; ")}`);
  await c.query(
    `UPDATE stg_gb s SET code = t.cd FROM unnest($1::int[], $2::text[]) AS t(i, cd)
     WHERE s.lvl = 'ADM2' AND s.idx = t.i`,
    [[...assigned.keys()], [...assigned.values()]],
  );
  await c.query(
    `UPDATE geo_units g SET boundary = s.geom
     FROM stg_gb s WHERE s.lvl = 'ADM2' AND s.code = g.code`,
  );

  // Any embedded LGA without a matched shape gets a small placeholder square
  // inside its state (and is versioned as placeholder).
  const lgasUnmatched = h.flatMap((s) => s.lgas.filter((l) => !taken.has(l.code)).map((l) => l.code));
  if (lgasUnmatched.length) {
    await c.query(
      `UPDATE geo_units l SET boundary = ${MAKE_MULTI(
        `ST_Intersection(ST_Expand(ST_GeneratePoints(st.boundary, 1, ${seedSql("l.code")}), 0.04), st.boundary)`,
      )}, boundary_version = '${PLACEHOLDER_VERSION}'
       FROM geo_units st WHERE st.id = l.state_id AND l.code = ANY($1::text[])`,
      [lgasUnmatched],
    );
  }

  // Zones = union of their states.
  await c.query(
    `UPDATE geo_units z SET boundary = sub.geom FROM (
       SELECT parent_id, ${MAKE_MULTI("ST_Union(boundary)")} AS geom
       FROM geo_units WHERE level = 'state' GROUP BY parent_id) sub
     WHERE z.level = 'zone' AND z.id = sub.parent_id`,
  );
  await c.query(`DROP TABLE IF EXISTS stg_gb`);
  return { version, lgasUnmatched };
}

/* ───────────────────────── placeholder fallback ───────────────────────── */

async function writeRings(c: PoolClient, rings: Map<string, Ring>): Promise<void> {
  const entries = [...rings.entries()];
  const CHUNK = 1000;
  for (let i = 0; i < entries.length; i += CHUNK) {
    const part = entries.slice(i, i + CHUNK);
    await c.query(
      `UPDATE geo_units g SET boundary = ${MAKE_MULTI("ST_SetSRID(ST_GeomFromGeoJSON(t.gj), 4326)")}
       FROM unnest($1::text[], $2::text[]) AS t(cd, gj) WHERE g.code = t.cd`,
      [part.map(([k]) => k), part.map(([, r]) => JSON.stringify(ringToMultiPolygon(r)))],
    );
  }
}

async function loadPlaceholderBoundaries(c: PoolClient, h: StateNode[]): Promise<void> {
  const geom = buildPlaceholderGeometry({
    bbox: NIGERIA_BBOX,
    states: h.map((s) => ({
      code: s.code,
      centroid: STATE_POINTS[s.code].centroid,
      lgas: s.lgas.map((l) => ({ code: l.code, wards: l.wards })),
    })),
  });
  await writeRings(c, new Map([[NATION_CODE, geom.nation]]));
  await writeRings(c, geom.states);
  await writeRings(c, geom.lgas);
  await writeRings(c, geom.wards);
  await c.query(
    `UPDATE geo_units z SET boundary = sub.geom FROM (
       SELECT parent_id, ${MAKE_MULTI("ST_Union(boundary)")} AS geom
       FROM geo_units WHERE level = 'state' GROUP BY parent_id) sub
     WHERE z.level = 'zone' AND z.id = sub.parent_id`,
  );
}

/* ───────────────────────────── synthetic wards ───────────────────────────── */

/**
 * Split each (real) LGA polygon into its N synthetic wards: N seeded random
 * points inside the LGA → Voronoi cells → clipped to the LGA. Deterministic
 * (seed = hash of the LGA code). Ward k takes the cell of the k-th point.
 */
async function subdivideWards(c: PoolClient): Promise<number> {
  await c.query(`
    WITH l AS (
      SELECT g.id, g.code, g.boundary,
             (SELECT count(*) FROM geo_units w WHERE w.parent_id = g.id AND w.level = 'ward')::int AS n,
             ${seedSql("g.code")} AS seed
      FROM geo_units g WHERE g.level = 'lga' AND g.boundary IS NOT NULL
    ), pts AS (
      SELECT l.id, l.code, l.boundary, ST_GeneratePoints(l.boundary, l.n, l.seed) AS mp
      FROM l WHERE l.n > 1
    ), cells AS (
      SELECT p.id, p.code, p.boundary, p.mp,
             (ST_Dump(ST_VoronoiPolygons(p.mp, 0, p.boundary))).geom AS cell
      FROM pts p
    ), numbered AS (
      SELECT c.code || '-W' || lpad(d.path[1]::text, 2, '0') AS ward_code,
             ${MAKE_MULTI("ST_Intersection(c.cell, c.boundary)")} AS geom
      FROM cells c CROSS JOIN LATERAL ST_Dump(c.mp) d
      WHERE ST_Contains(c.cell, d.geom)
    )
    UPDATE geo_units w SET boundary = n.geom
    FROM numbered n WHERE w.code = n.ward_code AND NOT ST_IsEmpty(n.geom)
  `);
  // Single-ward LGAs (not produced by the generator, but be safe) take the LGA shape.
  await c.query(`
    UPDATE geo_units w SET boundary = l.boundary
    FROM geo_units l
    WHERE w.parent_id = l.id AND w.level = 'ward' AND w.boundary IS NULL
      AND (SELECT count(*) FROM geo_units x WHERE x.parent_id = l.id) = 1
  `);
  // Any ward the Voronoi pass missed gets a small square around a point in its LGA.
  const fix = await c.query(`
    UPDATE geo_units w SET boundary = ${MAKE_MULTI(
      `ST_Intersection(ST_Expand(ST_GeneratePoints(l.boundary, 1, ${seedSql("w.code")}), 0.01), l.boundary)`,
    )}
    FROM geo_units l
    WHERE w.parent_id = l.id AND w.level = 'ward' AND w.boundary IS NULL AND l.boundary IS NOT NULL
  `);
  return fix.rowCount ?? 0;
}

/* ───────────────────────── derived columns ───────────────────────── */

async function finaliseShapes(
  c: PoolClient,
  versions: Record<string, string>,
): Promise<void> {
  for (const [level, tol] of Object.entries(SIMPLIFY_TOLERANCE)) {
    await c.query(
      `UPDATE geo_units SET
         boundary_simplified = ${MAKE_MULTI(`ST_SimplifyPreserveTopology(boundary, ${tol})`)},
         centre = ST_PointOnSurface(boundary),
         area_sq_km = ST_Area(boundary::geography) / 1e6,
         boundary_version = COALESCE(
           CASE WHEN boundary_version = '${PLACEHOLDER_VERSION}' AND $2 <> '${PLACEHOLDER_VERSION}'
                THEN boundary_version END, $2)
       WHERE level = $1::geo_level AND boundary IS NOT NULL`,
      [level, versions[level]],
    );
    // Tiny shapes can simplify to nothing — keep the original then.
    await c.query(
      `UPDATE geo_units SET boundary_simplified = boundary
       WHERE level = $1::geo_level AND boundary IS NOT NULL
         AND (boundary_simplified IS NULL OR ST_IsEmpty(boundary_simplified))`,
      [level],
    );
  }
}

/* ───────────────────────────── aliases ───────────────────────────── */

async function seedAliases(
  c: PoolClient,
  ids: Map<string, number>,
  h: StateNode[],
): Promise<number> {
  const rows: Array<{ id: number; alias: string; norm: string }> = [];
  const seen = new Set<string>();
  const add = (code: string, unitName: string, alias: string) => {
    const id = ids.get(code);
    const norm = normalizePlaceName(alias);
    if (!id || !norm || norm === normalizePlaceName(unitName)) return;
    const k = `${id}:${norm}`;
    if (seen.has(k)) return;
    seen.add(k);
    rows.push({ id, alias, norm });
  };
  NATION_ALIASES.forEach((a) => add(NATION_CODE, NATION_NAME, a));
  for (const s of h) {
    for (const a of STATE_ALIASES[s.code] ?? []) add(s.code, s.name, a);
    add(s.code, s.name, `${s.name} State`);
    for (const l of s.lgas) for (const a of l.aliases) add(l.code, l.name, a);
  }
  await c.query(
    `DELETE FROM geo_aliases WHERE origin = 'seed' AND geo_unit_id = ANY($1::int[])`,
    [[...ids.values()]],
  );
  await c.query(
    `INSERT INTO geo_aliases (geo_unit_id, alias, normalized, origin)
     SELECT i, a, n, 'seed' FROM unnest($1::int[], $2::text[], $3::text[]) AS t(i, a, n)
     ON CONFLICT (geo_unit_id, normalized) DO NOTHING`,
    [rows.map((r) => r.id), rows.map((r) => r.alias), rows.map((r) => r.norm)],
  );
  return rows.length;
}

/* ───────────────────────────── entry point ───────────────────────────── */

export async function seedGeography(opts: {
  forcePlaceholder?: boolean;
  log: (m: string) => void;
}): Promise<GeographyResult> {
  const h = buildHierarchy();
  const c = await pool.connect();
  try {
    const ids = await upsertHierarchy(c, h);
    // Reset geometry so a path switch never leaves stale shapes behind.
    await c.query(
      `UPDATE geo_units SET boundary = NULL, boundary_simplified = NULL, centre = NULL,
              area_sq_km = NULL, boundary_version = NULL
       WHERE id = ANY($1::int[])`,
      [[...ids.values()]],
    );

    let pathTaken: GeographyResult["path"] = "placeholder";
    let version = PLACEHOLDER_VERSION;
    let reason: string | undefined;
    let lgasUnmatched: string[] = [];
    if (opts.forcePlaceholder) {
      reason = "--placeholder-geo flag";
    } else {
      try {
        const real = await loadRealBoundaries(c, h, opts.log);
        pathTaken = "geoboundaries";
        version = real.version;
        lgasUnmatched = real.lgasUnmatched;
      } catch (e) {
        reason = e instanceof Error ? e.message : String(e);
        opts.log(`  geoBoundaries unavailable (${reason}) — using placeholder geometry`);
        await c.query(
          `UPDATE geo_units SET boundary = NULL, boundary_version = NULL WHERE id = ANY($1::int[])`,
          [[...ids.values()]],
        );
      }
    }
    if (pathTaken === "placeholder") {
      await loadPlaceholderBoundaries(c, h);
    }
    const wardsWithoutShape = pathTaken === "geoboundaries" ? await subdivideWards(c) : 0;
    await finaliseShapes(c, {
      nation: version,
      zone: `${version} (union of states)`,
      state: version,
      lga: version,
      ward: WARD_PLACEHOLDER_VERSION,
    });
    const aliases = await seedAliases(c, ids, h);

    const countRes = await c.query<{ level: string; n: number; with_shape: number }>(
      `SELECT level::text, count(*)::int n, count(boundary)::int with_shape
       FROM geo_units WHERE id = ANY($1::int[]) GROUP BY level`,
      [[...ids.values()]],
    );
    const counts: Record<string, number> = {};
    for (const r of countRes.rows) {
      counts[r.level] = r.n;
      counts[`${r.level}_with_boundary`] = r.with_shape;
    }
    return {
      path: pathTaken,
      boundaryVersion: version,
      reason,
      ids,
      hierarchy: h,
      counts,
      lgasUnmatched,
      wardsWithoutShape,
      aliases,
    };
  } finally {
    c.release();
  }
}
