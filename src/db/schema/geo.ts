import {
  pgTable,
  pgEnum,
  text,
  integer,
  doublePrecision,
  timestamp,
  index,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { geomMultiPolygon, geomPoint } from "./helpers";

export const geoLevel = pgEnum("geo_level", [
  "nation",
  "zone",
  "state",
  "lga",
  "ward",
]);

export const geoUnits = pgTable(
  "geo_units",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    level: geoLevel("level").notNull(),
    name: text("name").notNull(),
    /** Official code, unique across all levels (e.g. NG, NG-NC, NG-KN, NG-KN-GWALE, …). */
    code: text("code").notNull(),
    parentId: integer("parent_id").references((): AnyPgColumn => geoUnits.id),
    /** State this unit belongs to (self for states, null for nation/zone) — hot filter. */
    stateId: integer("state_id").references((): AnyPgColumn => geoUnits.id),
    boundary: geomMultiPolygon("boundary"),
    /** Pre-simplified for web delivery (ST_SimplifyPreserveTopology). */
    boundarySimplified: geomMultiPolygon("boundary_simplified"),
    centre: geomPoint("centre"),
    areaSqKm: doublePrecision("area_sq_km"),
    /** Version of the boundary source used for this unit (GRID3 records per state). */
    boundaryVersion: text("boundary_version"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("geo_units_code_uq").on(t.code),
    index("geo_units_level_idx").on(t.level),
    index("geo_units_parent_idx").on(t.parentId),
    index("geo_units_state_idx").on(t.stateId),
    index("geo_units_name_trgm_idx").using(
      "gin",
      sql`${t.name} gin_trgm_ops`,
    ),
    index("geo_units_boundary_gist").using("gist", t.boundary),
    index("geo_units_boundary_simplified_gist").using(
      "gist",
      t.boundarySimplified,
    ),
  ],
);

export const geoAliases = pgTable(
  "geo_aliases",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    geoUnitId: integer("geo_unit_id")
      .notNull()
      .references(() => geoUnits.id, { onDelete: "cascade" }),
    alias: text("alias").notNull(),
    /** lower-cased, whitespace/punctuation-normalised form used for matching. */
    normalized: text("normalized").notNull(),
    /** Where the alias came from: 'seed' | 'upload-review' | 'manual'. */
    origin: text("origin").notNull().default("manual"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("geo_aliases_unit_norm_uq").on(t.geoUnitId, t.normalized),
    index("geo_aliases_norm_idx").on(t.normalized),
    index("geo_aliases_norm_trgm_idx").using(
      "gin",
      sql`${t.normalized} gin_trgm_ops`,
    ),
  ],
);
