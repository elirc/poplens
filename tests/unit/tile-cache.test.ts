import { describe, expect, it } from "vitest";
import { LruCache } from "@/server/tiles/lru";
import {
  MAX_TILE_ZOOM,
  MIN_TILE_ZOOM,
  geojsonCacheKey,
  isTileLayer,
  parseTileCoord,
  tileCacheKey,
} from "@/server/tiles/keys";

describe("tile coordinates", () => {
  it("parses valid z/x/y, including .pbf/.mvt suffixes", () => {
    expect(parseTileCoord("8", "135", "122")).toEqual({ z: 8, x: 135, y: 122 });
    expect(parseTileCoord("8", "135", "122.pbf")).toEqual({ z: 8, x: 135, y: 122 });
    expect(parseTileCoord("8", "135", "122.MVT")).toEqual({ z: 8, x: 135, y: 122 });
  });

  it("guards zoom to 4–12", () => {
    expect(MIN_TILE_ZOOM).toBe(4);
    expect(MAX_TILE_ZOOM).toBe(12);
    expect(parseTileCoord("3", "0", "0")).toBeNull();
    expect(parseTileCoord("13", "0", "0")).toBeNull();
    expect(parseTileCoord("4", "0", "0")).not.toBeNull();
    expect(parseTileCoord("12", "4095", "4095")).not.toBeNull();
  });

  it("rejects coordinates outside the 2^z grid and malformed input", () => {
    expect(parseTileCoord("4", "16", "0")).toBeNull();
    expect(parseTileCoord("4", "0", "16")).toBeNull();
    expect(parseTileCoord("4", "-1", "0")).toBeNull();
    expect(parseTileCoord("4", "1.5", "0")).toBeNull();
    expect(parseTileCoord("z", "1", "1")).toBeNull();
    expect(parseTileCoord("6", "1", "1;DROP")).toBeNull();
  });

  it("builds distinct cache keys per layer and coordinate", () => {
    const c = { z: 8, x: 135, y: 122 };
    expect(tileCacheKey("wards", c)).toBe("wards/8/135/122");
    expect(tileCacheKey("lgas", c)).toBe("lgas/8/135/122");
    expect(tileCacheKey("wards", c)).not.toBe(tileCacheKey("wards", { ...c, y: 123 }));
    // Suffix variants of the same tile share one cache entry.
    expect(tileCacheKey("wards", parseTileCoord("8", "135", "122.pbf")!)).toBe(
      tileCacheKey("wards", parseTileCoord("8", "135", "122")!),
    );
  });

  it("recognises tile layers", () => {
    expect(isTileLayer("wards")).toBe(true);
    expect(isTileLayer("lgas")).toBe(true);
    expect(isTileLayer("states")).toBe(false);
  });

  it("keys GeoJSON payloads by level and parent", () => {
    expect(geojsonCacheKey("state")).toBe("geojson/state/parent=*");
    expect(geojsonCacheKey("lga", 12)).toBe("geojson/lga/parent=12");
    expect(geojsonCacheKey("lga", null)).toBe(geojsonCacheKey("lga"));
  });
});

describe("LruCache", () => {
  it("evicts the least recently used entry", () => {
    const c = new LruCache<number>(2);
    c.set("a", 1);
    c.set("b", 2);
    expect(c.get("a")).toBe(1); // a is now most recent
    c.set("c", 3);
    expect(c.get("b")).toBeUndefined();
    expect(c.get("a")).toBe(1);
    expect(c.get("c")).toBe(3);
    expect(c.size).toBe(2);
  });

  it("re-setting a key refreshes it instead of duplicating", () => {
    const c = new LruCache<number>(2);
    c.set("a", 1);
    c.set("b", 2);
    c.set("a", 10);
    c.set("c", 3);
    expect(c.keys()).toEqual(["a", "c"]);
    expect(c.get("a")).toBe(10);
  });

  it("expires entries after the TTL", () => {
    let now = 1_000;
    const c = new LruCache<string>(10, 500, () => now);
    c.set("t", "tile");
    now = 1_499;
    expect(c.get("t")).toBe("tile");
    now = 1_500;
    expect(c.get("t")).toBeUndefined();
    expect(c.size).toBe(0);
  });

  it("caches empty buffers (empty tiles are cached too)", () => {
    const c = new LruCache<Buffer>(5);
    c.set("wards/4/0/0", Buffer.alloc(0));
    expect(c.has("wards/4/0/0")).toBe(true);
    expect(c.get("wards/4/0/0")?.length).toBe(0);
  });

  it("rejects a zero-capacity cache", () => {
    expect(() => new LruCache<number>(0)).toThrow();
  });
});
