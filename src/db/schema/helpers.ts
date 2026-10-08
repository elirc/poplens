import { customType } from "drizzle-orm/pg-core";

/**
 * PostGIS geometry columns. Drizzle has no first-class multipolygon support,
 * so we declare the column type and always read/write through SQL functions
 * (ST_GeomFromGeoJSON, ST_AsGeoJSON, ST_AsMVT, …). The TS-side value is the
 * raw driver string (hex EWKB) and should not be used directly.
 */
export const geomMultiPolygon = customType<{ data: string; driverData: string }>({
  dataType() {
    return "geometry(MultiPolygon,4326)";
  },
});

export const geomPoint = customType<{ data: string; driverData: string }>({
  dataType() {
    return "geometry(Point,4326)";
  },
});

/** Geometry of any type (used where sources mix polygon kinds). */
export const geomAny = customType<{ data: string; driverData: string }>({
  dataType() {
    return "geometry(Geometry,4326)";
  },
});
