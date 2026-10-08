"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser, requireUser } from "@/lib/session";
import { savedViewInputSchema } from "./params";
import { deleteSavedView, insertSavedView } from "./queries";

/**
 * Saved-view Server Actions. saveViewAction is called by the shared
 * SaveViewButton (src/components/account/save-view-button.tsx) from any
 * explorer/analysis page; it returns a result object instead of throwing so
 * the button can show "Sign in to save" for visitors.
 */

export type SaveViewResult = { ok: true; id: number } | { ok: false; error: string; needsSignIn?: boolean };

export async function saveViewAction(input: unknown): Promise<SaveViewResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in to save views", needsSignIn: true };
  const parsed = savedViewInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }
  try {
    const id = await insertSavedView(user.id, parsed.data);
    revalidatePath("/account/views");
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save the view" };
  }
}

export async function deleteSavedViewAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  const id = z.coerce.number().int().positive().safeParse(fd.get("id"));
  if (!id.success) redirect("/account/views?error=Invalid+view");
  const ok = await deleteSavedView(user.id, id.data);
  revalidatePath("/account/views");
  redirect(ok ? "/account/views?ok=View+deleted" : "/account/views?error=View+not+found");
}
