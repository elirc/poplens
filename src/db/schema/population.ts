import {
  pgTable,
  integer,
  doublePrecision,
  text,
  index,
} from "drizzle-orm/pg-core";
import { geomPoint } from "./helpers";
import { datasets } from "./catalog";

/**
 * ~1 km grid points with modelled population, aggregated from the GRID3
 * gridded population raster (or synthetic for demos). Used by area analysis.
 */
export const populationCells = pgTable(
  "population_cells",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    point: geomPoint("point").notNull(),
    popTotal: doublePrecision("pop_total").notNull(),
    popUnder5: doublePrecision("pop_under5"),
    popWomen1549: doublePrecision("pop_women_15_49"),
    year: integer("year").notNull(),
    sourceVersion: text("source_version"),
    datasetId: integer("dataset_id").references(() => datasets.id),
  },
  (t) => [index("population_cells_point_gist").using("gist", t.point)],
);
