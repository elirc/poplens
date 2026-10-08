"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { writeAudit } from "@/lib/audit";
import { requireRole } from "@/lib/session";
import { getPlan, planLimitsSchema } from "@/server/billing/plans";
import { orgSeatInfo } from "./queries";

/**
 * Platform-admin Server Actions. Every action: requireRole("admin"), Zod
 * input, audited. Results go back via ?ok= / ?error=.
 */

function back(path: string, kind: "ok" | "error", message: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${kind}=${encodeURIComponent(message.slice(0, 300))}`);
}

function msg(e: unknown): string {
  if (e instanceof z.ZodError) return e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  return e instanceof Error ? e.message : String(e);
}

function safeReturn(v: FormDataEntryValue | null, fallback: string): string {
  return typeof v === "string" && v.startsWith("/admin") && !v.includes("//") ? v : fallback;
}

/* ── Users ───────────────────────────────────────────────────────────────── */

const ROLES = ["user", "data_editor", "content_editor", "admin"] as const;

export async function changeUserRoleAction(fd: FormData): Promise<void> {
  const admin = await requireRole("admin");
  const ret = safeReturn(fd.get("returnTo"), "/admin/users");
  const parsed = z
    .object({ userId: z.string().min(1).max(64), role: z.enum(ROLES) })
    .safeParse({ userId: fd.get("userId"), role: fd.get("role") });
  if (!parsed.success) back(ret, "error", msg(parsed.error));
  const { userId, role } = parsed.data;
  if (userId === admin.id) back(ret, "error", "You cannot change your own role");
  const [target] = await db
    .select({ role: schema.user.role, email: schema.user.email })
    .from(schema.user)
    .where(eq(schema.user.id, userId))
    .limit(1);
  if (!target) back(ret, "error", "User not found");
  if (target.role === role) back(ret, "ok", "Role unchanged");
  await db.update(schema.user).set({ role, updatedAt: new Date() }).where(eq(schema.user.id, userId));
  // Drop cached sessions so the new role applies on the next request.
  await db.delete(schema.session).where(eq(schema.session.userId, userId));
  await writeAudit({
    actorId: admin.id,
    action: "user.role_change",
    entity: "user",
    entityId: userId,
    detail: { email: target.email, from: target.role, to: role },
  });
  revalidatePath("/admin/users");
  back(ret, "ok", `${target.email} is now ${role.replace("_", " ")}`);
}

/* ── Organisations ───────────────────────────────────────────────────────── */

export async function addOrgMemberAction(fd: FormData): Promise<void> {
  const admin = await requireRole("admin");
  const parsed = z
    .object({
      organizationId: z.string().min(1).max(64),
      email: z.string().trim().email(),
      role: z.enum(["member", "admin", "owner"]),
    })
    .safeParse({ organizationId: fd.get("organizationId"), email: fd.get("email"), role: fd.get("role") });
  const ret = `/admin/orgs?org=${encodeURIComponent(String(fd.get("organizationId") ?? ""))}`;
  if (!parsed.success) back(ret, "error", msg(parsed.error));
  const { organizationId, email, role } = parsed.data;
  const [u] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(sql`lower(${schema.user.email})`, email.toLowerCase()))
    .limit(1);
  if (!u) back(ret, "error", `No user with email ${email}`);
  const [existing] = await db
    .select({ id: schema.member.id })
    .from(schema.member)
    .where(and(eq(schema.member.organizationId, organizationId), eq(schema.member.userId, u.id)))
    .limit(1);
  if (existing) back(ret, "error", "Already a member");
  const seats = await orgSeatInfo(organizationId);
  if (!seats) back(ret, "error", "Organisation not found");
  if (seats.used >= seats.seats) back(ret, "error", `All ${seats.seats} seats on the ${seats.planCode} plan are in use`);
  await db.insert(schema.member).values({ id: randomUUID(), organizationId, userId: u.id, role, createdAt: new Date() });
  await writeAudit({
    actorId: admin.id,
    action: "org.member_add",
    entity: "organization",
    entityId: organizationId,
    detail: { userId: u.id, email, role },
  });
  revalidatePath("/admin/orgs");
  back(ret, "ok", `Added ${email}`);
}

export async function removeOrgMemberAction(fd: FormData): Promise<void> {
  const admin = await requireRole("admin");
  const parsed = z
    .object({ memberId: z.string().min(1).max(64), organizationId: z.string().min(1).max(64) })
    .safeParse({ memberId: fd.get("memberId"), organizationId: fd.get("organizationId") });
  if (!parsed.success) back("/admin/orgs", "error", msg(parsed.error));
  const ret = `/admin/orgs?org=${encodeURIComponent(parsed.data.organizationId)}`;
  const removed = await db
    .delete(schema.member)
    .where(and(eq(schema.member.id, parsed.data.memberId), eq(schema.member.organizationId, parsed.data.organizationId)))
    .returning({ userId: schema.member.userId, role: schema.member.role });
  if (removed.length === 0) back(ret, "error", "Member not found");
  await writeAudit({
    actorId: admin.id,
    action: "org.member_remove",
    entity: "organization",
    entityId: parsed.data.organizationId,
    detail: removed[0],
  });
  revalidatePath("/admin/orgs");
  back(ret, "ok", "Member removed");
}

/* ── Plans ───────────────────────────────────────────────────────────────── */

/** "" → null (unlimited); otherwise a non-negative integer. */
const optionalCount = z
  .string()
  .trim()
  .transform((s) => (s === "" ? null : Number(s)))
  .pipe(z.number().int().min(0).nullable());

const planForm = z.object({
  code: z.string().trim().regex(/^[a-z][a-z0-9_]{1,31}$/, "Code: lowercase letters, digits, underscore"),
  name: z.string().trim().min(1).max(60),
  priceNaira: z.coerce.number().min(0).max(100_000_000),
  paystackPlanCode: z
    .string()
    .trim()
    .max(64)
    .transform((s) => (s === "" ? null : s)),
  downloadsPerDay: optionalCount,
  areaAnalysesPerDay: optionalCount,
  apiRequestsPerDay: optionalCount,
  seats: z.coerce.number().int().min(1).max(10_000),
});

export async function savePlanAction(fd: FormData): Promise<void> {
  const admin = await requireRole("admin");
  const isNew = fd.get("isNew") === "1";
  let code = "";
  try {
    const f = planForm.parse({
      code: fd.get("code") ?? "",
      name: fd.get("name") ?? "",
      priceNaira: fd.get("priceNaira") ?? "0",
      paystackPlanCode: fd.get("paystackPlanCode") ?? "",
      downloadsPerDay: fd.get("downloadsPerDay") ?? "",
      areaAnalysesPerDay: fd.get("areaAnalysesPerDay") ?? "",
      apiRequestsPerDay: fd.get("apiRequestsPerDay") ?? "",
      seats: fd.get("seats") ?? "1",
    });
    code = f.code;
    const limits = planLimitsSchema.parse({
      downloadsPerDay: f.downloadsPerDay,
      areaAnalysesPerDay: f.areaAnalysesPerDay,
      apiRequestsPerDay: f.apiRequestsPerDay,
      customReports: fd.get("customReports") === "on",
      apiAccess: fd.get("apiAccess") === "on",
      seats: f.seats,
    });
    const before = await getPlan(f.code);
    if (isNew && before) throw new Error(`Plan '${f.code}' already exists`);
    if (!isNew && !before) throw new Error(`Plan '${f.code}' not found`);
    const values = {
      name: f.name,
      priceKoboMonthly: Math.round(f.priceNaira * 100),
      paystackPlanCode: f.paystackPlanCode,
      limits,
    };
    if (isNew) await db.insert(schema.plans).values({ code: f.code, ...values });
    else await db.update(schema.plans).set(values).where(eq(schema.plans.code, f.code));
    await writeAudit({
      actorId: admin.id,
      action: isNew ? "plan.create" : "plan.update",
      entity: "plan",
      entityId: f.code,
      detail: { before: before ?? null, after: { code: f.code, ...values } },
    });
  } catch (e) {
    back("/admin/plans", "error", msg(e));
  }
  revalidatePath("/admin/plans");
  revalidatePath("/pricing");
  back("/admin/plans", "ok", `Plan '${code}' saved`);
}
