import { db, schema } from "@/db";

/**
 * Append one audit row. Never throws — auditing must not break the action —
 * but logs loudly on failure. Actions are dot-namespaced:
 * 'dataset.publish', 'dataset.rollback', 'user.role_change', 'api_key.create',
 * 'billing.subscribe', 'content.publish_story', 'content.publish_card', …
 */
export async function writeAudit(entry: {
  actorId: string | null;
  action: string;
  entity?: string;
  entityId?: string | number;
  detail?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(schema.auditLog).values({
      actorId: entry.actorId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId === undefined ? null : String(entry.entityId),
      detail: entry.detail,
    });
  } catch (e) {
    console.error("[audit] failed to write audit entry", entry.action, e);
  }
}
