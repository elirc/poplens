import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import type { AreaShape } from "@/app/(public)/area/_lib/shape";
import type {
  AreaAnalysisResult,
  AreaFacilitySource,
  AreaPopulation,
  AreaPopulationSource,
  FacilityCount,
  FacilitySummary,
  LgaTouched,
} from "@/app/(public)/area/_lib/types";
import { peoplePerFacility, summariseFacilities } from "./summary";

export type {
  AreaAnalysisResult,
  AreaFacilitySource,
  AreaPopulation,
  AreaPopulationSource,
  FacilityCount,
  FacilitySummary,
  LgaTouched,
};

/**
 * "Population inside a shape" — THE area-analysis logic (PostGIS).
 *
 * Method (shown to users as a footnote): population_cells are ~1 km grid
 * points; a cell counts when its CENTRE lies inside the shape (circle:
 * geodesic ST_DWithin on geography; polygon: ST_Intersects, boundary
 * inclusive). No partial-cell weighting. Facilities count when their point is
 * inside by the same rule. LGAs touched = boundary intersects the shape.
 *
 * Only public data: cells/facilities whose dataset is published, or that
 * carry no dataset at all (geography loads). Cells come from ONE dataset —
 * the latest visible year/release — so overlapping grids never double count.
 *
 * No auth/quota here (see ./quota.ts + the server action) so this module can
 * be exercised directly by tests/db/area-analysis.db.test.ts.
 */

export class AreaAnalysisError extends Error {
  constructor(
    readonly code: "invalid_shape",
    message: string,
  ) {
    super(message);
    this.name = "AreaAnalysisError";
  }
}

interface ShapeSql {
  /** Polygon geometry (SRID 4326) of the shape — circle is a 128-segment buffer. */
  geom: SQL;
  /** Membership test for a point column (index-assisted). */
  contains: (pointCol: SQL) => SQL;
}

function shapeSql(shape: AreaShape): ShapeSql {
  if (shape.kind === "circle") {
    const [lng, lat] = shape.center;
    const meters = shape.radiusKm * 1000;
    const centre = sql`ST_SetSRID(ST_MakePoint(${lng}::float8, ${lat}::float8), 4326)`;
    const geom = sql`ST_Buffer(${centre}::geography, ${meters}::float8, 'quad_segs=32')::geometry`;
    return {
      geom,
      // The buffer's bbox equals the circle's bbox (its extreme vertices lie
      // on the circle), so `&&` is a safe GiST prefilter; ST_DWithin on
      // geography is the exact geodesic test.
      contains: (p) =>
        sql`${p} && ${geom} AND ST_DWithin(${p}::geography, ${centre}::geography, ${meters}::float8)`,
    };
  }
  const ring = [...shape.coordinates, shape.coordinates[0]!];
  const geojson = JSON.stringify({ type: "Polygon", coordinates: [ring] });
  const geom = sql`ST_SetSRID(ST_GeomFromGeoJSON(${geojson}::text), 4326)`;
  return { geom, contains: (p) => sql`ST_Intersects(${p}, ${geom})` };
}

/** Rows visible to the public: published dataset, or no dataset. */
const visibleDataset = (alias: string) =>
  sql.raw(`(${alias}.dataset_id IS NULL OR ${alias}_d.status = 'published')`);

/** The single population grid used for analysis (latest visible year, newest release). */
export async function getPopulationGridSource(): Promise<AreaPopulationSource | null> {
  const res = await db.execute(sql`
    SELECT c.dataset_id AS "datasetId", c.year, c.source_version AS "sourceVersion",
           c_d.title AS "datasetTitle", COALESCE(c_d.is_synthetic, false) AS "isSynthetic",
           s.publisher, s.title AS "sourceTitle"
    FROM (
      SELECT DISTINCT dataset_id, year, source_version FROM population_cells
    ) c
    LEFT JOIN datasets c_d ON c_d.id = c.dataset_id
    LEFT JOIN sources s ON s.id = c_d.source_id
    WHERE ${visibleDataset("c")}
    ORDER BY c.year DESC, c_d.published_at DESC NULLS LAST, c.dataset_id DESC NULLS LAST
    LIMIT 1
  `);
  const r = res.rows[0] as unknown as AreaPopulationSource | undefined;
  return r ?? null;
}

async function checkPolygon(shape: AreaShape): Promise<number> {
  const s = shapeSql(shape);
  const res = await db.execute(sql`
    SELECT ST_IsValid(g) AS valid, ST_Area(g::geography) / 1e6 AS area
    FROM (SELECT ${s.geom} AS g) x
  `);
  const r = res.rows[0] as { valid: boolean; area: number } | undefined;
  if (!r || !r.valid) {
    throw new AreaAnalysisError("invalid_shape", "The shape is not a valid polygon.");
  }
  return Number(r.area);
}

/** Run the full analysis for an already-validated shape. */
export async function analyzeArea(shape: AreaShape): Promise<AreaAnalysisResult> {
  const shapeAreaSqKm =
    shape.kind === "polygon"
      ? await checkPolygon(shape)
      : Math.PI * shape.radiusKm * shape.radiusKm;
  const s = shapeSql(shape);
  const source = await getPopulationGridSource();

  const populationQuery = source
    ? db.execute(sql`
        SELECT COUNT(*)::int AS cells,
               SUM(c.pop_total) AS total,
               SUM(c.pop_under5) AS under5,
               COUNT(c.pop_under5)::int AS "under5Cells",
               SUM(c.pop_women_15_49) AS women1549,
               COUNT(c.pop_women_15_49)::int AS "women1549Cells"
        FROM population_cells c
        WHERE c.year = ${source.year}
          AND c.dataset_id IS NOT DISTINCT FROM ${source.datasetId}::int
          AND ${s.contains(sql`c.point`)}
      `)
    : null;

  const facilitiesQuery = db.execute(sql`
    SELECT f.type, f.care_level::text AS "careLevel", COUNT(*)::int AS count
    FROM health_facilities f
    LEFT JOIN datasets f_d ON f_d.id = f.dataset_id
    WHERE ${visibleDataset("f")}
      AND ${s.contains(sql`f.point`)}
    GROUP BY f.type, f.care_level
    ORDER BY count DESC, f.type
  `);

  const facilitySourcesQuery = db.execute(sql`
    SELECT DISTINCT COALESCE(s.publisher, 'Facility list') AS publisher,
           f_d.title AS "datasetTitle", f.source_version AS "sourceVersion",
           COALESCE(f_d.is_synthetic, false) AS "isSynthetic"
    FROM health_facilities f
    LEFT JOIN datasets f_d ON f_d.id = f.dataset_id
    LEFT JOIN sources s ON s.id = f_d.source_id
    WHERE ${visibleDataset("f")}
      AND ${s.contains(sql`f.point`)}
    ORDER BY 1, 3
    LIMIT 5
  `);

  const lgasQuery = db.execute(sql`
    WITH shape AS (SELECT ${s.geom} AS g)
    SELECT l.id, l.code, l.name, st.name AS "stateName"
    FROM geo_units l
    CROSS JOIN shape
    LEFT JOIN geo_units st ON st.id = l.state_id
    WHERE l.level = 'lga'
      AND l.boundary && shape.g
      AND ST_Intersects(l.boundary, shape.g)
    ORDER BY st.name NULLS LAST, l.name
  `);

  const [popRes, facRes, facSrcRes, lgaRes] = await Promise.all([
    populationQuery,
    facilitiesQuery,
    facilitySourcesQuery,
    lgasQuery,
  ]);

  const p = (popRes?.rows[0] ?? null) as {
    cells: number;
    total: number | null;
    under5: number | null;
    under5Cells: number;
    women1549: number | null;
    women1549Cells: number;
  } | null;
  const cells = p?.cells ?? 0;
  const population: AreaPopulation = {
    total: cells > 0 && p?.total != null ? Number(p.total) : null,
    under5: p && p.under5Cells > 0 && p.under5 != null ? Number(p.under5) : null,
    women1549: p && p.women1549Cells > 0 && p.women1549 != null ? Number(p.women1549) : null,
    cells,
    under5Cells: p?.under5Cells ?? 0,
    women1549Cells: p?.women1549Cells ?? 0,
  };

  const rows = (facRes.rows as Array<{ type: string; careLevel: FacilityCount["careLevel"]; count: number }>).map(
    (r) => ({ type: r.type, careLevel: r.careLevel, count: Number(r.count) }),
  );
  const facilities = summariseFacilities(rows);

  return {
    shapeAreaSqKm,
    population,
    populationSource: source,
    facilities,
    facilitySources: facSrcRes.rows as unknown as AreaFacilitySource[],
    peoplePerFacility: peoplePerFacility(population.total, facilities.total),
    lgas: lgaRes.rows as unknown as LgaTouched[],
  };
}
