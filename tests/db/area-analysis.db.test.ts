import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { truncateAll } from "../db-helpers";
import { analyzeArea, getPopulationGridSource } from "@/server/area/analysis";
import {
  getNearestFacilities,
  listFacilitiesPage,
  resolveFacilityScope,
} from "@/server/facilities/queries";
import { parseFacilityQuery } from "@/app/(public)/facilities/_lib/filters";
import type { LngLat } from "@/app/(public)/area/_lib/shape";

/**
 * "Population inside a shape" (spec definition of done). Fixture cells,
 * facilities and LGAs with known geometry around a centre point in Kano:
 *
 *   C  = (8.50, 12.00)                       circle: 5 km around C
 *   cells (2023, published grid):            polygon: box 8.45–8.55 × 11.95–12.05
 *     c0 at C                pop 100, u5 20, w 25   → circle ✓ polygon ✓
 *     c1 3 km north of C     pop 200, u5 40, w null → circle ✓ polygon ✓
 *     c2 7 km north of C     pop 400               → circle ✗ polygon ✗
 *     c3 4.9 km east of C    pop 800, u5 null      → circle ✓ polygon ✓
 *     c4 (8.46, 11.96) ~6.2 km SW  pop 50         → circle ✗ polygon ✓
 *   excluded: a DRAFT-dataset cell at C (pop 10,000) and an OLDER-year
 *   published cell at C (pop 5,000) — only the latest visible grid counts.
 *   facilities: PHC at C (published ds), General Hospital at c1 (no ds),
 *   Clinic at c4 (published ds), DRAFT-dataset facility at C (excluded).
 *   LGAs: West 8.40–8.50, East 8.50–8.60 (both 11.90–12.10), Far 9.5–9.6.
 */

const C: LngLat = [8.5, 12.0];
const KM_PER_DEG_LAT = 110.6; // close enough for fixture placement at 12°N
const KM_PER_DEG_LNG = 108.77; // 111.32 * cos(12°)
const north = (km: number): LngLat => [C[0], C[1] + km / KM_PER_DEG_LAT];
const east = (km: number): LngLat => [C[0] + km / KM_PER_DEG_LNG, C[1]];
const SW: LngLat = [8.46, 11.96];

const BOX: LngLat[] = [
  [8.45, 11.95],
  [8.55, 11.95],
  [8.55, 12.05],
  [8.45, 12.05],
];

async function insertCell(
  p: LngLat,
  pop: number,
  datasetId: number,
  year: number,
  u5: number | null = null,
  w: number | null = null,
) {
  await db.execute(sql`
    INSERT INTO population_cells (point, pop_total, pop_under5, pop_women_15_49, year, source_version, dataset_id)
    VALUES (ST_SetSRID(ST_MakePoint(${p[0]}, ${p[1]}), 4326), ${pop}, ${u5}, ${w}, ${year}, 'fixture-grid', ${datasetId})
  `);
}

async function insertFacility(
  name: string,
  type: string,
  care: "primary" | "secondary" | "tertiary",
  p: LngLat,
  datasetId: number | null,
  lgaId: number,
  stateId: number,
) {
  await db.execute(sql`
    INSERT INTO health_facilities (name, type, care_level, ownership, point, lga_id, state_id, source_version, dataset_id)
    VALUES (${name}, ${type}, ${care}, 'public', ST_SetSRID(ST_MakePoint(${p[0]}, ${p[1]}), 4326),
            ${lgaId}, ${stateId}, 'fixture-facilities', ${datasetId})
  `);
}

async function insertLga(code: string, name: string, stateId: number, w: number, s: number, e: number, n: number) {
  const res = await db.execute(sql`
    INSERT INTO geo_units (level, name, code, parent_id, state_id, boundary, boundary_simplified, centre)
    VALUES ('lga', ${name}, ${code}, ${stateId}, ${stateId},
            ST_Multi(ST_MakeEnvelope(${w}, ${s}, ${e}, ${n}, 4326)),
            ST_Multi(ST_MakeEnvelope(${w}, ${s}, ${e}, ${n}, 4326)),
            ST_SetSRID(ST_MakePoint(${(w + e) / 2}, ${(s + n) / 2}), 4326))
    RETURNING id
  `);
  return (res.rows[0] as { id: number }).id;
}

let westId: number;
let stateId: number;

beforeAll(async () => {
  await truncateAll();

  const [src] = await db
    .insert(schema.sources)
    .values({ key: "fixture", publisher: "Fixture Publisher", title: "Fixture grid", licence: "CC-BY-4.0", allowsRedistribution: true })
    .returning({ id: schema.sources.id });
  const [pub] = await db
    .insert(schema.datasets)
    .values({ sourceId: src!.id, seriesKey: "grid", title: "Grid 2023", status: "published", publishedAt: new Date(), isSynthetic: true })
    .returning({ id: schema.datasets.id });
  const [old] = await db
    .insert(schema.datasets)
    .values({ sourceId: src!.id, seriesKey: "grid-old", title: "Grid 2020", status: "published", publishedAt: new Date(Date.now() - 86_400_000) })
    .returning({ id: schema.datasets.id });
  const [draft] = await db
    .insert(schema.datasets)
    .values({ sourceId: src!.id, seriesKey: "grid-draft", title: "Grid 2024 draft", status: "draft" })
    .returning({ id: schema.datasets.id });

  const [state] = await db
    .insert(schema.geoUnits)
    .values({ level: "state", name: "Kano", code: "NG-KN" })
    .returning({ id: schema.geoUnits.id });
  stateId = state!.id;
  await db.execute(sql`UPDATE geo_units SET state_id = id WHERE id = ${stateId}`);
  westId = await insertLga("NG-KN-WEST", "West", stateId, 8.4, 11.9, 8.5, 12.1);
  const eastId = await insertLga("NG-KN-EAST", "East", stateId, 8.5, 11.9, 8.6, 12.1);
  await insertLga("NG-KN-FAR", "Far", stateId, 9.5, 12.0, 9.6, 12.1);

  await insertCell(C, 100, pub!.id, 2023, 20, 25);
  await insertCell(north(3), 200, pub!.id, 2023, 40, null);
  await insertCell(north(7), 400, pub!.id, 2023, 80, 90);
  await insertCell(east(4.9), 800, pub!.id, 2023, null, 150);
  await insertCell(SW, 50, pub!.id, 2023, 10, 12);
  await insertCell(C, 10_000, draft!.id, 2024, 1, 1); // draft: invisible
  await insertCell(C, 5_000, old!.id, 2020, 1, 1); // older grid: not used

  await insertFacility("Centre PHC", "Primary Health Centre", "primary", C, pub!.id, eastId, stateId);
  await insertFacility("North General Hospital", "General Hospital", "secondary", north(3), null, eastId, stateId);
  await insertFacility("South-west Clinic", "Clinic", "primary", SW, pub!.id, westId, stateId);
  await insertFacility("Draft Hospital", "General Hospital", "secondary", C, draft!.id, eastId, stateId);
});

describe("getPopulationGridSource", () => {
  it("uses the latest visible grid (published 2023), never the draft", async () => {
    const s = await getPopulationGridSource();
    expect(s?.year).toBe(2023);
    expect(s?.datasetTitle).toBe("Grid 2023");
    expect(s?.publisher).toBe("Fixture Publisher");
    expect(s?.isSynthetic).toBe(true);
  });
});

describe("analyzeArea — circle", () => {
  it("sums only cells whose centre is within the radius", async () => {
    const r = await analyzeArea({ kind: "circle", center: C, radiusKm: 5 });
    expect(r.population.cells).toBe(3);
    expect(r.population.total).toBe(1100); // 100 + 200 + 800
    expect(r.population.under5).toBe(60); // c3 has no under-5 value
    expect(r.population.under5Cells).toBe(2);
    expect(r.population.women1549).toBe(175); // 25 + 150
    expect(r.population.women1549Cells).toBe(2);
    expect(r.shapeAreaSqKm).toBeCloseTo(Math.PI * 25, 6);
  });

  it("counts visible facilities inside by type and level; people per facility", async () => {
    const r = await analyzeArea({ kind: "circle", center: C, radiusKm: 5 });
    expect(r.facilities.total).toBe(2); // draft facility excluded; SW clinic outside
    expect(r.facilities.byType).toEqual([
      { type: "General Hospital", count: 1 },
      { type: "Primary Health Centre", count: 1 },
    ]);
    expect(r.facilities.byCareLevel).toEqual({ primary: 1, secondary: 1, tertiary: 0 });
    expect(r.peoplePerFacility).toBe(550);
    expect(r.facilitySources.length).toBeGreaterThan(0);
  });

  it("lists the LGAs whose boundary the circle touches", async () => {
    const r = await analyzeArea({ kind: "circle", center: C, radiusKm: 5 });
    expect(r.lgas.map((l) => l.code).sort()).toEqual(["NG-KN-EAST", "NG-KN-WEST"]);
    expect(r.lgas[0]!.stateName).toBe("Kano");
    const small = await analyzeArea({ kind: "circle", center: [8.42, 12.0], radiusKm: 1 });
    expect(small.lgas.map((l) => l.code)).toEqual(["NG-KN-WEST"]);
  });

  it("returns No data (null), not zero, when no cell centre is inside", async () => {
    const r = await analyzeArea({ kind: "circle", center: [13.0, 12.0], radiusKm: 1 });
    expect(r.population.cells).toBe(0);
    expect(r.population.total).toBeNull();
    expect(r.population.under5).toBeNull();
    expect(r.facilities.total).toBe(0);
    expect(r.peoplePerFacility).toBeNull();
    expect(r.lgas).toEqual([]);
  });
});

describe("analyzeArea — polygon", () => {
  it("sums cells inside the polygon (incl. the SW cell outside the circle)", async () => {
    const r = await analyzeArea({ kind: "polygon", coordinates: BOX });
    expect(r.population.cells).toBe(4);
    expect(r.population.total).toBe(1150); // 100 + 200 + 800 + 50
    expect(r.population.under5).toBe(70); // 20 + 40 + 10
    expect(r.facilities.total).toBe(3);
    expect(r.facilities.byCareLevel).toEqual({ primary: 2, secondary: 1, tertiary: 0 });
    expect(r.peoplePerFacility).toBeCloseTo(1150 / 3, 6);
    expect(r.lgas.map((l) => l.code).sort()).toEqual(["NG-KN-EAST", "NG-KN-WEST"]);
    // PostGIS geodesic area of the 0.1° box at 12°N ≈ 120 km².
    expect(r.shapeAreaSqKm).toBeGreaterThan(110);
    expect(r.shapeAreaSqKm).toBeLessThan(130);
  });

  it("a polygon wholly inside one LGA touches only that LGA", async () => {
    const r = await analyzeArea({
      kind: "polygon",
      coordinates: [
        [8.41, 11.95],
        [8.48, 11.95],
        [8.48, 11.99],
      ],
    });
    expect(r.lgas.map((l) => l.id)).toEqual([westId]);
    expect(r.population.cells).toBe(1); // the SW cell
    expect(r.population.total).toBe(50);
  });
});

describe("facilities queries", () => {
  it("hide draft-dataset facilities from the list and nearest", async () => {
    const scope = await resolveFacilityScope(parseFacilityQuery({ state: "NG-KN" }));
    const page = await listFacilitiesPage(scope.filters, 1);
    expect(page.total).toBe(3);
    expect(page.rows.map((r) => r.name)).not.toContain("Draft Hospital");

    const near = await getNearestFacilities(C[0], C[1], 2);
    expect(near.map((f) => f.name)).toEqual(["Centre PHC", "North General Hospital"]);
    expect(near[0]!.meters).toBeLessThan(1);
    expect(near[1]!.meters).toBeGreaterThan(2900);
    expect(near[1]!.meters).toBeLessThan(3100);
  });

  it("an LGA deep link implies its state", async () => {
    const scope = await resolveFacilityScope(parseFacilityQuery({ lga: "NG-KN-WEST" }));
    expect(scope.state?.code).toBe("NG-KN");
    const page = await listFacilitiesPage(scope.filters, 1);
    expect(page.rows.map((r) => r.name)).toEqual(["South-west Clinic"]);
  });
});
