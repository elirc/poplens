import {
  pgTable,
  pgEnum,
  text,
  integer,
  timestamp,
  jsonb,
  date,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user, organization } from "./auth";
import { datasets } from "./catalog";

/**
 * Plans are rows, not code. Limits jsonb shape (see src/lib/limits.ts):
 * { downloadsPerDay: number|null, areaAnalysesPerDay: number|null,
 *   apiRequestsPerDay: number|null, customReports: boolean, seats: number }
 * null = unlimited.
 */
export const plans = pgTable("plans", {
  /** 'free' | 'pro' | 'org' */
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  /** Placeholder price in kobo (NGN *100), per month. */
  priceKoboMonthly: integer("price_kobo_monthly").notNull().default(0),
  limits: jsonb("limits").notNull(),
  /** Paystack plan code once created there (real mode). */
  paystackPlanCode: text("paystack_plan_code"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const subscriptionStatus = pgEnum("subscription_status", [
  "active",
  "past_due",
  "cancelled",
]);

/** Exactly one of userId / organizationId is set. */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "cascade",
    }),
    planCode: text("plan_code")
      .notNull()
      .references(() => plans.code),
    status: subscriptionStatus("status").notNull().default("active"),
    paystackCustomerCode: text("paystack_customer_code"),
    paystackSubscriptionCode: text("paystack_subscription_code"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("subscriptions_user_idx").on(t.userId),
    index("subscriptions_org_idx").on(t.organizationId),
  ],
);

/** Generic per-user daily counters (area analyses, downloads, …). */
export const usageCounters = pgTable(
  "usage_counters",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** 'area_analysis' | 'download' | … */
    kind: text("kind").notNull(),
    /** Day in Africa/Lagos time, formatted YYYY-MM-DD. */
    day: date("day").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [uniqueIndex("usage_counters_uq").on(t.userId, t.kind, t.day)],
);

/** Every download is logged (spec requirement). */
export const downloadLog = pgTable(
  "download_log",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: text("user_id").references(() => user.id),
    datasetId: integer("dataset_id").references(() => datasets.id),
    /** What was downloaded: { page, params } */
    detail: jsonb("detail").notNull(),
    format: text("format").notNull(), // csv | xlsx | pdf
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("download_log_user_idx").on(t.userId, t.createdAt)],
);
