import { pool } from "@/db";
import type { StateNode } from "./hierarchy";
import { generateFacilities } from "./facility-model";
import { DISEASE_TO_INDICATOR } from "@/server/indicators/catalogue-data";
import { generateOutbreakRows, OUTBREAK_WEEKS, OUTBREAK_YEAR } from "./outbreak-model";
import {
  buildPopulationModel,
  POPULATION_YEAR,
  type PopCounts,
  type PopulationModel,
} from "./population-model";
import { hashInt, round } from "./prng";
import { STATE_POINTS } from "./state-points";
import { generateSurveyRows, SMALL_AREA_YEAR, SURVEY_YEARS } from "./survey-model";
import {
  createSyntheticDraft,
  insertValues,
  publishSynthetic,
  SYNTHETIC_NOTE,
  type ValueRow,
} from "./datasets";

/**
 * Builds and PUBLISHES the synthetic demo datasets (all isSynthetic=true,
 * source 'synthetic', every value noted "SYNTHETIC demo value — not a real
 * statistic"):
 *   synthetic-population   pop counts, sex & age breakdowns, density (2023)
 *   synthetic-surveys      health/services/living indicators (2013, 2018,
 *                          2023 LGA small-area set)
 *   synthetic-facilities   ~3,000 facilities + facilities_per_100k /
 *                          people_per_facility (2023)
 *   synthetic-population-grid  ~1 km population cells (2023)
 *   synthetic-outbreaks    weekly outbreak lines 2024 + annual state totals
 */

export interface DemoContext {
  hierarchy: StateNode[];
  ids: Map<string, number>;
  indicatorIds: Map<string, number>;
  syntheticSourceId: number;
  actorId: string | null;
  log: (m: string) => void;
}

export interface DemoStats {
  datasets: Array<{ id: number; seriesKey: string; title: string; values: number }>;
  facilities: number;
  populationCells: number;
  outbreakRows: number;
  nationalPopulation: number;
}

const POP_LABEL = `${POPULATION_YEAR} modelled estimate (synthetic)`;

function ind(ctx: DemoContext, code: string): number {
  const id = ctx.indicatorIds.get(code);
  if (!id) throw new Error(`indicator ${code} missing — seed the catalogue first`);
  return id;
}

function geo(ctx: DemoContext, code: string): number {
  const id = ctx.ids.get(code);
  if (!id) throw new Error(`geo unit ${code} missing`);
  return id;
}

/* ───────────────────────────── population ───────────────────────────── */

async function seedPopulation(ctx: DemoContext, pop: PopulationModel) {
  const areas = await pool.query<{ code: string; area: number | null }>(
    `SELECT code, area_sq_km AS area FROM geo_units WHERE id = ANY($1::int[])`,
    [[...ctx.ids.values()]],
  );
  const area = new Map(areas.rows.map((r) => [r.code, r.area]));
  const rows: ValueRow[] = [];
  const v = (code: string, geoCode: string, value: number, extra: Partial<ValueRow> = {}) =>
    rows.push({
      indicatorId: ind(ctx, code),
      geoUnitId: geo(ctx, geoCode),
      year: POPULATION_YEAR,
      periodLabel: POP_LABEL,
      value,
      lower: null,
      upper: null,
      ...extra,
    });

  for (const [code, c] of pop.counts as Map<string, PopCounts>) {
    v("pop_total", code, c.total);
    v("pop_total", code, c.male, { sex: "male" });
    v("pop_total", code, c.female, { sex: "female" });
    v("pop_male", code, c.male);
    v("pop_female", code, c.female);
    v("pop_u5", code, c.u5);
    v("pop_w1549", code, c.w1549);
    v("pop_60p", code, c.p60);
    if (c.female > 0) v("sex_ratio", code, round((c.male / c.female) * 100, 1));
    const a = area.get(code);
    if (a && a > 0) v("pop_density", code, round(c.total / a, 1));
  }
  for (const [code, pyramid] of pop.ageSex) {
    for (const r of pyramid) {
      v("pop_total", code, r.total, { ageGroup: r.ageGroup });
      v("pop_total", code, r.male, { ageGroup: r.ageGroup, sex: "male" });
      v("pop_total", code, r.female, { ageGroup: r.ageGroup, sex: "female" });
    }
  }
  const id = await createSyntheticDraft({
    sourceId: ctx.syntheticSourceId,
    seriesKey: "synthetic-population",
    title: "Population estimates 2023 — SYNTHETIC demo data",
    description:
      "Synthetic population counts for every state, LGA and ward, with sex and 5-year age-group breakdowns. Generated for demonstration only; NOT real estimates.",
    yearsCovered: String(POPULATION_YEAR),
    levelsCovered: ["nation", "zone", "state", "lga", "ward"],
    uploadedBy: ctx.actorId,
  });
  const n = await insertValues(id, rows);
  await publishSynthetic(id, ctx.actorId);
  return { id, seriesKey: "synthetic-population", title: "Population estimates 2023", values: n };
}

/* ───────────────────────────── surveys ───────────────────────────── */

async function seedSurveys(ctx: DemoContext, pop: PopulationModel) {
  const survey = generateSurveyRows(ctx.hierarchy, pop);
  const rows: ValueRow[] = survey.map((r) => ({
    indicatorId: ind(ctx, r.code),
    geoUnitId: geo(ctx, r.geoCode),
    year: r.year,
    periodLabel: r.periodLabel,
    value: r.value,
    lower: r.lower,
    upper: r.upper,
  }));
  const id = await createSyntheticDraft({
    sourceId: ctx.syntheticSourceId,
    seriesKey: "synthetic-surveys",
    title: "Survey-style health and living-conditions indicators — SYNTHETIC demo data",
    description: `Synthetic survey-style values with confidence intervals for ${SURVEY_YEARS.join(
      " and ",
    )} (state + national), plus ${SMALL_AREA_YEAR} modelled LGA values for a subset of indicators. NOT real survey results.`,
    yearsCovered: `${SURVEY_YEARS[0]}–${SMALL_AREA_YEAR}`,
    levelsCovered: ["nation", "state", "lga"],
    uploadedBy: ctx.actorId,
  });
  const n = await insertValues(id, rows);
  await publishSynthetic(id, ctx.actorId);
  return { id, seriesKey: "synthetic-surveys", title: "Survey-style indicators", values: n };
}

/* ───────────────────────────── facilities ───────────────────────────── */

async function seedFacilities(ctx: DemoContext, pop: PopulationModel) {
  const specs = generateFacilities(ctx.hierarchy, pop);
  const id = await createSyntheticDraft({
    sourceId: ctx.syntheticSourceId,
    seriesKey: "synthetic-facilities",
    title: "Health facilities and facility access 2023 — SYNTHETIC demo data",
    description:
      "Synthetic list of ~3,000 health facilities (generic demo names, random points inside their ward) and derived facilities per 100,000 people / people per facility. NOT a real facility register.",
    yearsCovered: String(POPULATION_YEAR),
    levelsCovered: ["nation", "state", "lga"],
    uploadedBy: ctx.actorId,
  });
  const CHUNK = 2000;
  for (let i = 0; i < specs.length; i += CHUNK) {
    const p = specs.slice(i, i + CHUNK);
    await pool.query(
      `INSERT INTO health_facilities
         (name, type, care_level, ownership, point, lga_id, ward_id, state_id, source_version, dataset_id)
       SELECT t.nm, t.tp, t.cl::care_level, t.own::facility_ownership,
              COALESCE(ST_GeometryN(ST_GeneratePoints(w.boundary, 1, t.sd), 1), ST_PointOnSurface(w.boundary)),
              w.parent_id, w.id, w.state_id, 'synthetic-facilities-v1', $7::int
       FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::int[])
         AS t(nm, tp, cl, own, wc, sd)
       JOIN geo_units w ON w.code = t.wc`,
      [
        p.map((f) => f.name),
        p.map((f) => f.type),
        p.map((f) => f.careLevel),
        p.map((f) => f.ownership),
        p.map((f) => f.wardCode),
        p.map((f) => hashInt(`facility:${f.key}`)),
        id,
      ],
    );
  }
  const inserted = await pool.query<{ n: number }>(
    `SELECT count(*)::int n FROM health_facilities WHERE dataset_id = $1`,
    [id],
  );

  // Derived access indicators from the facilities actually inserted.
  const grouped = await pool.query<{ code: string; n: number }>(
    `SELECT g.code, count(*)::int n FROM health_facilities f
       JOIN geo_units g ON g.id = f.lga_id WHERE f.dataset_id = $1 GROUP BY g.code
     UNION ALL
     SELECT g.code, count(*)::int n FROM health_facilities f
       JOIN geo_units g ON g.id = f.state_id WHERE f.dataset_id = $1 GROUP BY g.code`,
    [id],
  );
  const counts = new Map<string, number>(grouped.rows.map((r) => [r.code, r.n]));
  counts.set("NG", inserted.rows[0].n);
  const rows: ValueRow[] = [];
  for (const [code, n] of counts) {
    const people = pop.counts.get(code)?.total;
    if (!people || n === 0) continue; // no facility → no row ("No data"), never 0
    const base = {
      geoUnitId: geo(ctx, code),
      year: POPULATION_YEAR,
      periodLabel: `${POPULATION_YEAR} derived from synthetic facilities and population`,
      lower: null,
      upper: null,
    };
    rows.push({ ...base, indicatorId: ind(ctx, "facilities_per_100k"), value: round((n / people) * 100_000, 1) });
    rows.push({ ...base, indicatorId: ind(ctx, "people_per_facility"), value: Math.round(people / n) });
  }
  const nValues = await insertValues(id, rows);
  await publishSynthetic(id, ctx.actorId);
  return {
    dataset: { id, seriesKey: "synthetic-facilities", title: "Health facilities 2023", values: nValues },
    facilities: inserted.rows[0].n,
  };
}

/* ───────────────────────────── population grid ───────────────────────────── */

/**
 * ~1 km synthetic population cells: per state, uniform random points over the
 * whole state plus a dense cluster within 30 km of the capital, snapped to a
 * 0.009° (~1 km) grid. Cell weights decay with distance from the capital;
 * each state's cells sum to that state's synthetic pop_total.
 */
async function seedPopulationCells(ctx: DemoContext, pop: PopulationModel) {
  const id = await createSyntheticDraft({
    sourceId: ctx.syntheticSourceId,
    seriesKey: "synthetic-population-grid",
    title: "Population grid (~1 km cells) 2023 — SYNTHETIC demo data",
    description:
      "Synthetic ~1 km population points used by area analysis; each state's cells sum to its synthetic total. NOT the GRID3 gridded population.",
    yearsCovered: String(POPULATION_YEAR),
    levelsCovered: ["state"],
    uploadedBy: ctx.actorId,
  });
  const states = ctx.hierarchy;
  await pool.query(
    `
    WITH st AS (
      SELECT g.id, g.boundary, t.total, t.u5r, t.wr, t.sd,
             CASE WHEN ST_Contains(g.boundary, ST_SetSRID(ST_MakePoint(t.lng, t.lat), 4326))
                  THEN ST_SetSRID(ST_MakePoint(t.lng, t.lat), 4326)
                  ELSE ST_PointOnSurface(g.boundary) END AS ctr
      FROM unnest($1::text[], $2::float8[], $3::float8[], $4::float8[], $5::float8[], $6::float8[], $7::int[])
        AS t(code, total, u5r, wr, lng, lat, sd)
      JOIN geo_units g ON g.code = t.code AND g.boundary IS NOT NULL
    ), raw AS (
      SELECT st.id, (ST_Dump(ST_GeneratePoints(st.boundary, 600, st.sd))).geom AS p FROM st
      UNION ALL
      SELECT st.id, (ST_Dump(ST_GeneratePoints(
               ST_CollectionExtract(ST_Intersection(st.boundary, ST_Buffer(st.ctr::geography, 30000)::geometry), 3),
               700, st.sd + 1))).geom
      FROM st
    ), snapped AS (
      SELECT DISTINCT id, ST_SnapToGrid(p, 0.009) AS p FROM raw
    ), weighted AS (
      SELECT s.id, s.p, st.total, st.u5r, st.wr,
             (0.12 + exp(-ST_Distance(s.p::geography, st.ctr::geography) / 12000.0))
               * (0.6 + 0.8 * ((hashtext(ST_AsText(s.p))::bigint & 2147483647) / 2147483647.0)) AS w
      FROM snapped s JOIN st ON st.id = s.id
    ), scaled AS (
      SELECT p, total * w / sum(w) OVER (PARTITION BY id) AS pop, u5r, wr FROM weighted
    )
    INSERT INTO population_cells (point, pop_total, pop_under5, pop_women_15_49, year, source_version, dataset_id)
    SELECT p, round(pop::numeric, 2), round((pop * u5r)::numeric, 2), round((pop * wr)::numeric, 2),
           ${POPULATION_YEAR}, 'synthetic-grid-v1', $8::int
    FROM scaled
    `,
    [
      states.map((s) => s.code),
      states.map((s) => pop.counts.get(s.code)!.total),
      states.map((s) => {
        const c = pop.counts.get(s.code)!;
        return c.u5 / c.total;
      }),
      states.map((s) => {
        const c = pop.counts.get(s.code)!;
        return c.w1549 / c.total;
      }),
      states.map((s) => STATE_POINTS[s.code].capital.lngLat[0]),
      states.map((s) => STATE_POINTS[s.code].capital.lngLat[1]),
      states.map((s) => hashInt(`cells:${s.code}`) % 1_000_000_000),
      id,
    ],
  );
  const n = await pool.query<{ n: number }>(
    `SELECT count(*)::int n FROM population_cells WHERE dataset_id = $1`,
    [id],
  );
  await publishSynthetic(id, ctx.actorId);
  return {
    dataset: { id, seriesKey: "synthetic-population-grid", title: "Population grid 2023", values: 0 },
    cells: n.rows[0].n,
  };
}

/* ───────────────────────────── outbreaks ───────────────────────────── */

async function seedOutbreaks(ctx: DemoContext) {
  const lines = generateOutbreakRows();
  const id = await createSyntheticDraft({
    sourceId: ctx.syntheticSourceId,
    seriesKey: "synthetic-outbreaks",
    title: `Weekly outbreak reports ${OUTBREAK_YEAR} (weeks 1–${OUTBREAK_WEEKS}) — SYNTHETIC demo data`,
    description:
      "Synthetic weekly cholera, Lassa fever, meningitis and measles lines by state, in the NCDC upload-template shape. Zero-case weeks are omitted. NOT real NCDC data.",
    yearsCovered: String(OUTBREAK_YEAR),
    levelsCovered: ["nation", "state"],
    uploadedBy: ctx.actorId,
  });
  await pool.query(
    `INSERT INTO outbreak_reports (disease, state_id, year, week, suspected, confirmed, deaths, dataset_id)
     SELECT t.d::disease, g.id, t.y, t.w, t.s, t.c, t.de, $8::int
     FROM unnest($1::text[], $2::text[], $3::int[], $4::int[], $5::int[], $6::int[], $7::int[])
       AS t(d, sc, y, w, s, c, de)
     JOIN geo_units g ON g.code = t.sc`,
    [
      lines.map((l) => l.disease),
      lines.map((l) => l.stateCode),
      lines.map((l) => l.year),
      lines.map((l) => l.week),
      lines.map((l) => l.suspected),
      lines.map((l) => l.confirmed),
      lines.map((l) => l.deaths),
      id,
    ],
  );
  // Annual totals as indicator values so outbreak indicators work on the
  // map/rankings too. States with no reported weeks get no row ("No data").
  const totals = new Map<string, number>();
  for (const l of lines) {
    const ic = DISEASE_TO_INDICATOR[l.disease];
    totals.set(`${ic}|${l.stateCode}`, (totals.get(`${ic}|${l.stateCode}`) ?? 0) + l.suspected);
    totals.set(`${ic}|NG`, (totals.get(`${ic}|NG`) ?? 0) + l.suspected);
  }
  const rows: ValueRow[] = [...totals].map(([k, value]) => {
    const [code, geoCode] = k.split("|");
    return {
      indicatorId: ind(ctx, code),
      geoUnitId: geo(ctx, geoCode),
      year: OUTBREAK_YEAR,
      periodLabel: `${OUTBREAK_YEAR} epi weeks 1–${OUTBREAK_WEEKS}, total suspected cases (synthetic)`,
      value,
      lower: null,
      upper: null,
      isEstimate: false,
      note: `${SYNTHETIC_NOTE}. Sum of weekly suspected cases.`,
    };
  });
  const n = await insertValues(id, rows);
  await publishSynthetic(id, ctx.actorId);
  return {
    dataset: { id, seriesKey: "synthetic-outbreaks", title: "Weekly outbreak reports", values: n },
    outbreakRows: lines.length,
  };
}

/* ───────────────────────────── entry ───────────────────────────── */

export async function seedDemoData(ctx: DemoContext): Promise<DemoStats> {
  const pop = buildPopulationModel(ctx.hierarchy);
  ctx.log("  population…");
  const p = await seedPopulation(ctx, pop);
  ctx.log("  surveys…");
  const s = await seedSurveys(ctx, pop);
  ctx.log("  facilities…");
  const f = await seedFacilities(ctx, pop);
  ctx.log("  population cells…");
  const c = await seedPopulationCells(ctx, pop);
  ctx.log("  outbreaks…");
  const o = await seedOutbreaks(ctx);
  return {
    datasets: [p, s, f.dataset, c.dataset, o.dataset],
    facilities: f.facilities,
    populationCells: c.cells,
    outbreakRows: o.outbreakRows,
    nationalPopulation: pop.nationalTotal,
  };
}
