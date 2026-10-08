import {
  pgTable,
  pgEnum,
  integer,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { geoUnits } from "./geo";
import { datasets } from "./catalog";

export const disease = pgEnum("disease", [
  "cholera",
  "lassa_fever",
  "meningitis",
  "measles",
]);

/** Weekly state-level outbreak lines, entered by staff from NCDC PDF reports. */
export const outbreakReports = pgTable(
  "outbreak_reports",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    disease: disease("disease").notNull(),
    stateId: integer("state_id")
      .notNull()
      .references(() => geoUnits.id),
    year: integer("year").notNull(),
    /** ISO epi week 1–53. */
    week: integer("week").notNull(),
    suspected: integer("suspected"),
    confirmed: integer("confirmed"),
    deaths: integer("deaths"),
    datasetId: integer("dataset_id")
      .notNull()
      .references(() => datasets.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("outbreak_reports_uq").on(
      t.disease,
      t.stateId,
      t.year,
      t.week,
      t.datasetId,
    ),
    index("outbreak_reports_series_idx").on(t.disease, t.year, t.week),
  ],
);
