import {
  pgTable,
  text,
  integer,
  timestamp,
  date,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user, organization } from "./auth";

/**
 * API keys are stored as SHA-256 hashes; the plaintext is shown once at
 * creation. Format: pl_live_<32 random chars>; prefix = first 12 chars,
 * kept for display ("pl_live_ab12…").
 */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull(),
    prefix: text("prefix").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("api_keys_hash_uq").on(t.keyHash),
    index("api_keys_user_idx").on(t.userId),
  ],
);

/** Daily request counts per key — the fixed-window quota store. */
export const apiUsage = pgTable(
  "api_usage",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    apiKeyId: integer("api_key_id")
      .notNull()
      .references(() => apiKeys.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [uniqueIndex("api_usage_uq").on(t.apiKeyId, t.day)],
);
