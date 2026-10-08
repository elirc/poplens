import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { DEFAULT_PLAN_LIMITS, getUserPlan, lagosDay, type PlanLimits } from "@/lib/limits";
import { generateApiKey, hashApiKey, isWellFormedApiKey } from "./keys";

/**
 * API-key persistence + per-plan daily quota (DB-backed, exact).
 * Plaintext keys never touch the database — only SHA-256 hashes.
 */

export const MAX_ACTIVE_KEYS_PER_USER = 10;

export interface ApiKeyRow {
  id: number;
  userId: string | null;
  organizationId: string | null;
  name: string;
  prefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

const keyColumns = {
  id: schema.apiKeys.id,
  userId: schema.apiKeys.userId,
  organizationId: schema.apiKeys.organizationId,
  name: schema.apiKeys.name,
  prefix: schema.apiKeys.prefix,
  createdAt: schema.apiKeys.createdAt,
  lastUsedAt: schema.apiKeys.lastUsedAt,
  revokedAt: schema.apiKeys.revokedAt,
};

/** Creates a personal key. Returns the plaintext ONCE — it is not recoverable. */
export async function createApiKey(
  userId: string,
  name: string,
): Promise<{ key: ApiKeyRow; plaintext: string }> {
  const active = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.apiKeys)
    .where(and(eq(schema.apiKeys.userId, userId), isNull(schema.apiKeys.revokedAt)));
  if ((active[0]?.n ?? 0) >= MAX_ACTIVE_KEYS_PER_USER) {
    throw new Error(`You can have at most ${MAX_ACTIVE_KEYS_PER_USER} active keys. Revoke one first.`);
  }
  const { plaintext, hash, prefix } = generateApiKey();
  const [row] = await db
    .insert(schema.apiKeys)
    .values({ userId, name, keyHash: hash, prefix })
    .returning(keyColumns);
  return { key: row as ApiKeyRow, plaintext };
}

export async function listApiKeysForUser(userId: string): Promise<Array<ApiKeyRow & { usedToday: number }>> {
  const keys = (await db
    .select(keyColumns)
    .from(schema.apiKeys)
    .where(eq(schema.apiKeys.userId, userId))
    .orderBy(desc(schema.apiKeys.createdAt))) as ApiKeyRow[];
  if (keys.length === 0) return [];
  const usage = await db
    .select({ apiKeyId: schema.apiUsage.apiKeyId, count: schema.apiUsage.count })
    .from(schema.apiUsage)
    .where(
      and(
        inArray(
          schema.apiUsage.apiKeyId,
          keys.map((k) => k.id),
        ),
        eq(schema.apiUsage.day, lagosDay()),
      ),
    );
  const byKey = new Map(usage.map((u) => [u.apiKeyId, u.count]));
  return keys.map((k) => ({ ...k, usedToday: byKey.get(k.id) ?? 0 }));
}

/** Revoke a key the user owns. Returns false if no such (unrevoked) key. */
export async function revokeApiKey(userId: string, keyId: number): Promise<boolean> {
  const res = await db
    .update(schema.apiKeys)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(schema.apiKeys.id, keyId),
        eq(schema.apiKeys.userId, userId),
        isNull(schema.apiKeys.revokedAt),
      ),
    )
    .returning({ id: schema.apiKeys.id });
  return res.length > 0;
}

/** Look a presented plaintext key up by its hash (the only lookup path). */
export async function findApiKeyByPlaintext(plaintext: string): Promise<ApiKeyRow | null> {
  if (!isWellFormedApiKey(plaintext)) return null;
  const rows = await db
    .select(keyColumns)
    .from(schema.apiKeys)
    .where(eq(schema.apiKeys.keyHash, hashApiKey(plaintext)))
    .limit(1);
  return (rows[0] as ApiKeyRow | undefined) ?? null;
}

/** Active plan for an organisation's own subscription (org-owned keys). */
async function getOrganizationPlan(
  organizationId: string,
): Promise<{ planCode: string; limits: PlanLimits }> {
  const rows = await db
    .select({ planCode: schema.subscriptions.planCode, limits: schema.plans.limits })
    .from(schema.subscriptions)
    .innerJoin(schema.plans, eq(schema.subscriptions.planCode, schema.plans.code))
    .where(
      and(
        eq(schema.subscriptions.organizationId, organizationId),
        eq(schema.subscriptions.status, "active"),
      ),
    )
    .limit(1);
  if (rows[0]) return { planCode: rows[0].planCode, limits: rows[0].limits as PlanLimits };
  return { planCode: "free", limits: DEFAULT_PLAN_LIMITS.free };
}

/** key → owner (user or organisation) → effective plan. */
export async function resolveKeyPlan(
  key: Pick<ApiKeyRow, "userId" | "organizationId">,
): Promise<{ planCode: string; limits: PlanLimits }> {
  if (key.organizationId) return getOrganizationPlan(key.organizationId);
  if (key.userId) return getUserPlan(key.userId);
  return { planCode: "free", limits: DEFAULT_PLAN_LIMITS.free };
}

/**
 * Atomically consume one request of a key's daily quota (Africa/Lagos day).
 * Same pattern as limits.consumeDailyQuota: the conditional upsert only
 * increments while under the limit, so concurrent requests can never push
 * the count past it. limit null = unlimited (still counted for reporting).
 */
export async function consumeApiQuota(
  apiKeyId: number,
  limit: number | null,
  day: string = lagosDay(),
): Promise<{ allowed: boolean; used: number; limit: number | null }> {
  if (limit !== null && limit <= 0) return { allowed: false, used: 0, limit };
  const res = await db
    .insert(schema.apiUsage)
    .values({ apiKeyId, day, count: 1 })
    .onConflictDoUpdate({
      target: [schema.apiUsage.apiKeyId, schema.apiUsage.day],
      set: { count: sql`${schema.apiUsage.count} + 1` },
      ...(limit === null ? {} : { setWhere: sql`${schema.apiUsage.count} < ${limit}` }),
    })
    .returning({ count: schema.apiUsage.count });
  if (res.length === 0) return { allowed: false, used: limit ?? 0, limit };
  return { allowed: true, used: res[0].count, limit };
}

/** Best-effort last-used stamp, at most once a minute per key. */
export async function touchApiKey(apiKeyId: number): Promise<void> {
  try {
    await db
      .update(schema.apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(
        and(
          eq(schema.apiKeys.id, apiKeyId),
          sql`(${schema.apiKeys.lastUsedAt} IS NULL OR ${schema.apiKeys.lastUsedAt} < now() - interval '1 minute')`,
        ),
      );
  } catch (e) {
    console.error("[api-keys] touch failed", e);
  }
}
