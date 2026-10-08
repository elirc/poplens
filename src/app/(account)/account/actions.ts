"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { getUserPlan } from "@/lib/limits";
import { requireUser } from "@/lib/session";
import { enqueue } from "@/server/queue";
import { createApiKey, revokeApiKey } from "@/server/api-keys/store";
import { buildReport, createReportRow, getReportForUser, REPORT_JOB } from "@/server/reports/build";
import { resolveReportPlaces } from "@/server/reports/data";
import { reportParamsSchema, reportTitleSchema } from "@/server/reports/params";
import { getIndicatorByCode } from "@/server/indicators/queries";

/**
 * Account Server Actions. Every action: requireUser, Zod input, plan gates
 * re-checked on the server (never trust the page), audited where it
 * matters. Form actions report back via ?ok= / ?error=.
 */

function back(path: string, kind: "ok" | "error", message: string): never {
  redirect(`${path}?${kind}=${encodeURIComponent(message.slice(0, 300))}`);
}

function msg(e: unknown): string {
  if (e instanceof z.ZodError) return e.issues.map((i) => i.message).join("; ");
  return e instanceof Error ? e.message : String(e);
}

/* ── Profile ─────────────────────────────────────────────────────────────── */

const profileInput = z.object({ name: z.string().trim().min(1, "Enter a name").max(80) });

export async function updateProfileAction(fd: FormData): Promise<void> {
  await requireUser();
  const parsed = profileInput.safeParse({ name: fd.get("name") });
  if (!parsed.success) back("/account", "error", msg(parsed.error));
  try {
    await auth.api.updateUser({ body: { name: parsed.data.name }, headers: await headers() });
  } catch (e) {
    back("/account", "error", msg(e));
  }
  revalidatePath("/", "layout");
  back("/account", "ok", "Profile updated");
}

/* ── API keys ────────────────────────────────────────────────────────────── */

export type CreateKeyState = { plaintext?: string; prefix?: string; name?: string; error?: string };

const keyName = z.string().trim().min(1, "Name the key (e.g. 'Dashboard server')").max(60);

/** useActionState action: returns the plaintext ONCE for display. */
export async function createApiKeyAction(_prev: CreateKeyState, fd: FormData): Promise<CreateKeyState> {
  const user = await requireUser();
  const parsed = keyName.safeParse(fd.get("name"));
  if (!parsed.success) return { error: msg(parsed.error) };
  const plan = await getUserPlan(user.id);
  if (!plan.limits.apiAccess) {
    return { error: "Your plan does not include API access. Upgrade to Pro or Organisation first." };
  }
  try {
    const { key, plaintext } = await createApiKey(user.id, parsed.data);
    await writeAudit({
      actorId: user.id,
      action: "api_key.create",
      entity: "api_key",
      entityId: key.id,
      detail: { name: key.name, prefix: key.prefix },
    });
    revalidatePath("/account/api-keys");
    return { plaintext, prefix: key.prefix, name: key.name };
  } catch (e) {
    return { error: msg(e) };
  }
}

export async function revokeApiKeyAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  const id = z.coerce.number().int().positive().safeParse(fd.get("id"));
  if (!id.success) back("/account/api-keys", "error", "Invalid key");
  const ok = await revokeApiKey(user.id, id.data);
  if (ok) {
    await writeAudit({ actorId: user.id, action: "api_key.revoke", entity: "api_key", entityId: id.data });
  }
  revalidatePath("/account/api-keys");
  back("/account/api-keys", ok ? "ok" : "error", ok ? "Key revoked — it stops working immediately" : "Key not found");
}

/* ── Custom reports ──────────────────────────────────────────────────────── */

function splitCodes(v: FormDataEntryValue | null): string[] {
  return typeof v === "string"
    ? v
        .split(/[\s,;]+/)
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
    : [];
}

export async function createReportAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  const plan = await getUserPlan(user.id);
  if (!plan.limits.customReports) {
    back("/account/reports", "error", "Custom reports are part of the Pro and Organisation plans");
  }
  let id: number;
  try {
    const yearRaw = fd.get("year");
    const params = reportParamsSchema.parse({
      placeCodes: [...fd.getAll("place").map(String), ...splitCodes(fd.get("extraPlaces"))],
      indicatorCodes: fd.getAll("indicator").map(String),
      year: typeof yearRaw === "string" && yearRaw ? Number(yearRaw) : undefined,
    });
    const { missing } = await resolveReportPlaces(params.placeCodes);
    if (missing.length) throw new Error(`Unknown place codes: ${missing.join(", ")}`);
    for (const c of params.indicatorCodes) {
      if (!(await getIndicatorByCode(c))) throw new Error(`Unknown indicator: ${c}`);
    }
    const titleRaw = String(fd.get("title") ?? "").trim();
    const title = reportTitleSchema.parse(titleRaw || `Report — ${params.placeCodes.slice(0, 3).join(", ")}`);
    id = await createReportRow(user.id, title, params);
    await writeAudit({ actorId: user.id, action: "report.create", entity: "custom_report", entityId: id, detail: params });
  } catch (e) {
    back("/account/reports", "error", msg(e));
  }

  // Hand off to the worker; if the queue is unreachable, build inline.
  let queued = false;
  try {
    queued = (await enqueue(REPORT_JOB, { reportId: id })) !== null;
  } catch (e) {
    console.error("[reports] enqueue failed, building inline", e);
  }
  if (!queued) await buildReport(id);
  revalidatePath("/account/reports");
  back(
    "/account/reports",
    "ok",
    queued ? "Report queued — it will be ready in a moment" : "Report built",
  );
}

/** Build (or rebuild) a report now, in this request — fallback when no worker runs. */
export async function buildReportNowAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  const id = z.coerce.number().int().positive().safeParse(fd.get("id"));
  if (!id.success) back("/account/reports", "error", "Invalid report");
  const report = await getReportForUser(user.id, id.data);
  if (!report) back("/account/reports", "error", "Report not found");
  const plan = await getUserPlan(user.id);
  if (!plan.limits.customReports) back("/account/reports", "error", "Your plan does not include custom reports");
  const outcome = await buildReport(report.id);
  revalidatePath("/account/reports");
  const text: Record<string, string> = {
    built: "Report built",
    already_ready: "Report is already ready",
    in_progress: "Report is being built — refresh in a moment",
    failed: "Report build failed — see the error below",
    not_found: "Report not found",
  };
  back("/account/reports", outcome === "failed" || outcome === "not_found" ? "error" : "ok", text[outcome]);
}
