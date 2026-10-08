import {
  pgTable,
  text,
  integer,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

/**
 * Append-only audit trail. Write through src/lib/audit.ts (writeAudit), never
 * directly. Actions are dot-namespaced: 'dataset.publish', 'user.role_change',
 * 'api_key.create', 'billing.subscribe', …
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    actorId: text("actor_id").references(() => user.id),
    action: text("action").notNull(),
    entity: text("entity"),
    entityId: text("entity_id"),
    detail: jsonb("detail"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("audit_log_actor_idx").on(t.actorId, t.createdAt),
    index("audit_log_action_idx").on(t.action, t.createdAt),
  ],
);
