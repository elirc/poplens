import {
  pgTable,
  pgEnum,
  text,
  integer,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

export const contentStatus = pgEnum("content_status", ["draft", "published"]);

/** Short data articles with live chart embeds (markdown + embed shortcodes). */
export const stories = pgTable(
  "stories",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    /**
     * Markdown body. Live charts are embedded with shortcodes of the form
     * {{chart type="trend" indicator="u5mr" places="NG-KN,NG" }} rendered
     * server-side into the shared chart components.
     */
    body: text("body").notNull(),
    coverIndicator: text("cover_indicator"),
    status: contentStatus("status").notNull().default("draft"),
    authorId: text("author_id").references(() => user.id),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("stories_slug_uq").on(t.slug),
    index("stories_status_idx").on(t.status, t.publishedAt),
  ],
);

/**
 * Share-ready insight cards. `spec` fully describes the card so the OG image
 * route can render it from live data:
 * { kind: 'top5' | 'vs_national' | 'single_stat' | 'trend',
 *   indicatorCode, placeCodes?: string[], year?, level? }
 */
export const insightCards = pgTable(
  "insight_cards",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    caption: text("caption").notNull(),
    spec: jsonb("spec").notNull(),
    status: contentStatus("status").notNull().default("draft"),
    authorId: text("author_id").references(() => user.id),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("insight_cards_slug_uq").on(t.slug),
    index("insight_cards_status_idx").on(t.status, t.publishedAt),
  ],
);

/** A saved view of any explorer/analysis page: kind + the page's params. */
export const savedViews = pgTable(
  "saved_views",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** 'map' | 'compare' | 'trends' | 'rankings' | 'relationships' | 'area' | 'place'. */
    kind: text("kind").notNull(),
    params: jsonb("params").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("saved_views_user_idx").on(t.userId)],
);

export const reportStatus = pgEnum("report_status", [
  "pending",
  "building",
  "ready",
  "failed",
]);

/** Custom PDF reports built by the worker from a places+indicators spec. */
export const customReports = pgTable(
  "custom_reports",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** { placeCodes: string[], indicatorCodes: string[], year?: number } */
    params: jsonb("params").notNull(),
    status: reportStatus("status").notNull().default("pending"),
    fileKey: text("file_key"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("custom_reports_user_idx").on(t.userId, t.createdAt)],
);
