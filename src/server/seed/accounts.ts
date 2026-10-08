import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { db, schema } from "@/db";
import { DEFAULT_PLAN_LIMITS } from "@/lib/limits";

/**
 * Demo accounts + placeholder plans. Users are created through Better Auth's
 * server API (auth.api.signUpEmail) so password hashes and account rows match
 * exactly what sign-in expects. If the API cannot run outside a request
 * (e.g. a cookie plugin throws), we fall back to inserting user + credential
 * account rows directly with better-auth/crypto's hashPassword — the same
 * hasher the email/password flow uses. Roles are set by direct update
 * (role is input:false in the auth config). Idempotent: existing demo users
 * are reused and their role re-asserted.
 */

export const DEMO_USERS = [
  { email: "admin@poplens.ng", password: "admin1234", name: "Demo Admin", role: "admin" },
  { email: "editor@poplens.ng", password: "editor1234", name: "Demo Data Editor", role: "data_editor" },
  { email: "writer@poplens.ng", password: "writer1234", name: "Demo Content Editor", role: "content_editor" },
  { email: "user@poplens.ng", password: "user1234", name: "Demo User", role: "user" },
] as const;

export type DemoRole = (typeof DEMO_USERS)[number]["role"];

export interface AccountsResult {
  ids: Record<DemoRole, string>;
  method: Record<string, "existing" | "auth.api.signUpEmail" | "direct-insert">;
}

async function createViaApi(u: (typeof DEMO_USERS)[number]): Promise<string> {
  // Imported lazily so a failure to construct the auth instance falls back cleanly.
  const { auth } = await import("@/lib/auth");
  const res = await auth.api.signUpEmail({
    body: { email: u.email, password: u.password, name: u.name },
  });
  if (!res?.user?.id) throw new Error("signUpEmail returned no user");
  return res.user.id;
}

async function createDirect(u: (typeof DEMO_USERS)[number]): Promise<string> {
  const id = randomUUID();
  const now = new Date();
  await db.insert(schema.user).values({
    id,
    name: u.name,
    email: u.email,
    emailVerified: true,
    role: u.role,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(schema.account).values({
    id: randomUUID(),
    accountId: id,
    providerId: "credential",
    userId: id,
    password: await hashPassword(u.password),
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

export async function seedAccounts(log: (m: string) => void): Promise<AccountsResult> {
  const ids = {} as Record<DemoRole, string>;
  const method: AccountsResult["method"] = {};
  for (const u of DEMO_USERS) {
    const [existing] = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.email, u.email))
      .limit(1);
    let id = existing?.id;
    if (id) {
      method[u.email] = "existing";
    } else {
      try {
        id = await createViaApi(u);
        method[u.email] = "auth.api.signUpEmail";
      } catch (e) {
        log(`  signUpEmail failed for ${u.email} (${e instanceof Error ? e.message : e}); inserting directly`);
        // The API may have created the user before throwing — reuse it if so.
        const [partial] = await db
          .select({ id: schema.user.id })
          .from(schema.user)
          .where(eq(schema.user.email, u.email))
          .limit(1);
        id = partial?.id ?? (await createDirect(u));
        method[u.email] = partial ? "auth.api.signUpEmail" : "direct-insert";
      }
    }
    await db
      .update(schema.user)
      .set({ role: u.role, emailVerified: true, updatedAt: new Date() })
      .where(eq(schema.user.id, id));
    ids[u.role] = id;
  }
  return { ids, method };
}

/** Placeholder plans (prices in kobo). Limits from DEFAULT_PLAN_LIMITS. */
export const PLAN_SEEDS = [
  { code: "free", name: "Free", priceKoboMonthly: 0 },
  { code: "pro", name: "Pro", priceKoboMonthly: 5_000 * 100 },
  { code: "org", name: "Organisation", priceKoboMonthly: 50_000 * 100 },
] as const;

export async function seedPlans(): Promise<number> {
  for (const p of PLAN_SEEDS) {
    const limits = DEFAULT_PLAN_LIMITS[p.code];
    await db
      .insert(schema.plans)
      .values({ code: p.code, name: p.name, priceKoboMonthly: p.priceKoboMonthly, limits })
      .onConflictDoUpdate({
        target: schema.plans.code,
        set: { name: p.name, priceKoboMonthly: p.priceKoboMonthly, limits },
      });
  }
  return PLAN_SEEDS.length;
}
