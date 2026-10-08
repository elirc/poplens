import {
  pgTable,
  pgEnum,
  text,
  integer,
  boolean,
  doublePrecision,
  timestamp,
  date,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { geoUnits, geoLevel } from "./geo";
import { user } from "./auth";

/** Publishers of data (GRID3, DHS, WHO, World Bank, NBS, NPC, NCDC, …). */
export const sources = pgTable("sources", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  /** Stable machine key, e.g. 'grid3', 'dhs', 'who-gho', 'worldbank', 'ncdc', 'synthetic'. */
  key: text("key").notNull().unique(),
  publisher: text("publisher").notNull(),
  title: text("title").notNull(),
  url: text("url"),
  licence: text("licence").notNull(),
  licenceUrl: text("licence_url"),
  /** Downloads/API access are only offered when this is true. */
  allowsRedistribution: boolean("allows_redistribution").notNull().default(false),
  citationTemplate: text("citation_template"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const datasetStatus = pgEnum("dataset_status", [
  "draft",
  "published",
  "superseded",
  "rolled_back",
]);

/**
 * A dataset is one importable unit (a connector run or an uploaded file).
 * Version history: datasets sharing a seriesKey are versions of one logical
 * series. Publishing supersedes the currently-published version of the same
 * series; rollback restores it. Public queries only ever see status='published'.
 */
export const datasets = pgTable(
  "datasets",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    sourceId: integer("source_id")
      .notNull()
      .references(() => sources.id),
    /** Logical series identity, e.g. 'dhs-indicators', 'upload-ncdc-outbreaks'. */
    seriesKey: text("series_key").notNull(),
    version: integer("version").notNull().default(1),
    title: text("title").notNull(),
    description: text("description"),
    releaseDate: date("release_date"),
    /** Human-readable coverage, e.g. '1990–2023'. */
    yearsCovered: text("years_covered"),
    levelsCovered: geoLevel("levels_covered").array(),
    /** Storage key of the original file, when the dataset came from an upload. */
    fileKey: text("file_key"),
    status: datasetStatus("status").notNull().default("draft"),
    /** True for demo seed data; drives the site-wide demo banner. */
    isSynthetic: boolean("is_synthetic").notNull().default(false),
    /** Diff against the published version, computed at import time. */
    changeSummary: jsonb("change_summary"),
    uploadedBy: text("uploaded_by").references(() => user.id),
    publishedBy: text("published_by").references(() => user.id),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("datasets_series_idx").on(t.seriesKey, t.version),
    index("datasets_status_idx").on(t.status),
    index("datasets_source_idx").on(t.sourceId),
  ],
);

export const valueType = pgEnum("indicator_value_type", [
  "count",
  "rate",
  "percent",
  "ratio",
  "index",
]);

export const aggregationMethod = pgEnum("aggregation_method", [
  "sum",
  "population_weighted_mean",
  "mean",
  "none",
]);

export const indicatorCategory = pgEnum("indicator_category", [
  "population",
  "health_outcomes",
  "health_services",
  "living_conditions",
  "outbreaks",
]);

export const indicators = pgTable(
  "indicators",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    /** Stable machine code, e.g. 'pop_total', 'u5mr', 'anc4'. */
    code: text("code").notNull(),
    name: text("name").notNull(),
    category: indicatorCategory("category").notNull(),
    definition: text("definition").notNull(),
    /** Display unit, e.g. 'people', '%', 'per 1,000 live births'. */
    unit: text("unit").notNull(),
    valueType: valueType("value_type").notNull(),
    /** null = neither direction is better (e.g. sex ratio). */
    higherIsBetter: boolean("higher_is_better"),
    decimals: integer("decimals").notNull().default(1),
    aggregation: aggregationMethod("aggregation").notNull().default("none"),
    /** Method / caveat text for the indicator page. */
    methodNotes: text("method_notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("indicators_code_uq").on(t.code),
    index("indicators_category_idx").on(t.category),
  ],
);

/**
 * One observed value. Missing data is an ABSENT row — never a zero.
 * Breakdown columns default to 'all'; a row with all three at 'all' is the
 * headline value for (indicator, place, year, dataset).
 */
export const indicatorValues = pgTable(
  "indicator_values",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    indicatorId: integer("indicator_id")
      .notNull()
      .references(() => indicators.id),
    geoUnitId: integer("geo_unit_id")
      .notNull()
      .references(() => geoUnits.id),
    year: integer("year").notNull(),
    /** Optional label when the period is a survey, e.g. '2018 DHS'. */
    periodLabel: text("period_label"),
    value: doublePrecision("value").notNull(),
    lower: doublePrecision("lower"),
    upper: doublePrecision("upper"),
    sex: text("sex").notNull().default("all"), // all | male | female
    ageGroup: text("age_group").notNull().default("all"),
    residence: text("residence").notNull().default("all"), // all | urban | rural
    datasetId: integer("dataset_id")
      .notNull()
      .references(() => datasets.id, { onDelete: "cascade" }),
    isEstimate: boolean("is_estimate").notNull().default(false),
    /** Staff quality flag: null | 'questionable' | 'confirmed-outlier'. */
    qualityFlag: text("quality_flag"),
    note: text("note"),
  },
  (t) => [
    uniqueIndex("indicator_values_nat_uq").on(
      t.indicatorId,
      t.geoUnitId,
      t.year,
      t.sex,
      t.ageGroup,
      t.residence,
      t.datasetId,
    ),
    index("indicator_values_lookup_idx").on(t.indicatorId, t.year, t.geoUnitId),
    index("indicator_values_place_idx").on(t.geoUnitId, t.indicatorId),
    index("indicator_values_dataset_idx").on(t.datasetId),
  ],
);

export const importStatus = pgEnum("import_status", [
  "running",
  "succeeded",
  "failed",
]);

export const importRuns = pgTable(
  "import_runs",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    /** 'dhs' | 'who' | 'worldbank' | 'upload' | 'grid3' | 'seed'. */
    kind: text("kind").notNull(),
    status: importStatus("status").notNull().default("running"),
    datasetId: integer("dataset_id").references(() => datasets.id),
    /** Row counts, warnings, per-step timing. */
    stats: jsonb("stats"),
    log: text("log"),
    error: text("error"),
    triggeredBy: text("triggered_by").references(() => user.id),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("import_runs_kind_idx").on(t.kind, t.startedAt)],
);
