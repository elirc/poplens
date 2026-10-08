import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { truncateAll } from "../db-helpers";
import { clearTileCache, getTile, renderTile } from "@/server/tiles/mvt";
import { parseTileCoord } from "@/server/tiles/keys";

/**
 * MVT tile SQL against PostGIS. Inserts its own fixture ward (a small square
 * around a point in Kano) instead of relying on the dev seed.
 */

const CENTRE = { lng: 8.52, lat: 12.0 };
const HALF = 0.02; // degrees

/** Slippy-map tile containing a lng/lat at zoom z. */
function tileFor(lng: number, lat: number, z: number) {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { z, x, y };
}

describe("ward MVT tiles", () => {
  beforeAll(async () => {
    await truncateAll();
    await db.execute(sql`
      INSERT INTO geo_units (level, name, code, boundary, boundary_simplified, centre, area_sq_km, boundary_version)
      VALUES (
        'ward', 'Fixture Ward', 'TEST-WARD-1',
        ST_Multi(ST_MakeEnvelope(${CENTRE.lng - HALF}, ${CENTRE.lat - HALF}, ${CENTRE.lng + HALF}, ${CENTRE.lat + HALF}, 4326)),
        ST_Multi(ST_MakeEnvelope(${CENTRE.lng - HALF}, ${CENTRE.lat - HALF}, ${CENTRE.lng + HALF}, ${CENTRE.lat + HALF}, 4326)),
        ST_SetSRID(ST_MakePoint(${CENTRE.lng}, ${CENTRE.lat}), 4326),
        19.0, 'test-fixture'
      )
    `);
  });

  beforeEach(() => clearTileCache());

  it("returns a non-empty protobuf buffer for the fixture ward's centre tile", async () => {
    for (const z of [6, 10, 12]) {
      const c = tileFor(CENTRE.lng, CENTRE.lat, z);
      const buf = await renderTile("wards", c);
      expect(Buffer.isBuffer(buf)).toBe(true);
      expect(buf.length).toBeGreaterThan(0);
      // Layer name and properties are encoded as strings in the tile.
      const text = buf.toString("latin1");
      expect(text).toContain("wards");
      expect(text).toContain("TEST-WARD-1");
      expect(text).toContain("Fixture Ward");
    }
  });

  it("returns an empty buffer for a tile with no wards (route answers 204)", async () => {
    const far = tileFor(-0.1, 51.5, 10); // London
    const buf = await renderTile("wards", far);
    expect(buf.length).toBe(0);
  });

  it("does not include the ward in the LGA layer", async () => {
    const buf = await renderTile("lgas", tileFor(CENTRE.lng, CENTRE.lat, 10));
    expect(buf.length).toBe(0);
  });

  it("serves repeat requests from the in-process LRU cache", async () => {
    const c = parseTileCoord("10", String(tileFor(CENTRE.lng, CENTRE.lat, 10).x), String(tileFor(CENTRE.lng, CENTRE.lat, 10).y))!;
    const first = await getTile("wards", c);
    const second = await getTile("wards", c);
    expect(first.cacheHit).toBe(false);
    expect(second.cacheHit).toBe(true);
    expect(second.data.equals(first.data)).toBe(true);
  });
});
