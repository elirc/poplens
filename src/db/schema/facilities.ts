import {
  pgTable,
  pgEnum,
  text,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { geomPoint } from "./helpers";
import { geoUnits } from "./geo";
import { datasets } from "./catalog";

export const careLevel = pgEnum("care_level", [
  "primary",
  "secondary",
  "tertiary",
]);

export const facilityOwnership = pgEnum("facility_ownership", [
  "public",
  "private",
  "faith_based",
  "ngo",
  "unknown",
]);

export const healthFacilities = pgTable(
  "health_facilities",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    name: text("name").notNull(),
    /** Source facility type, e.g. 'Primary Health Centre', 'General Hospital'. */
    type: text("type").notNull(),
    careLevel: careLevel("care_level").notNull(),
    ownership: facilityOwnership("ownership").notNull().default("unknown"),
    point: geomPoint("point").notNull(),
    lgaId: integer("lga_id").references(() => geoUnits.id),
    wardId: integer("ward_id").references(() => geoUnits.id),
    stateId: integer("state_id").references(() => geoUnits.id),
    /** GRID3 facility-list version used for this state. */
    sourceVersion: text("source_version"),
    datasetId: integer("dataset_id").references(() => datasets.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("health_facilities_lga_idx").on(t.lgaId),
    index("health_facilities_state_idx").on(t.stateId),
    index("health_facilities_point_gist").using("gist", t.point),
    index("health_facilities_filters_idx").on(
      t.careLevel,
      t.ownership,
    ),
  ],
);
