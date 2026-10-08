import "server-only";
import { redirect } from "next/navigation";
import { requireRole, type CurrentUser } from "@/lib/session";

/**
 * Page-level gate for data-editor screens: requireRole("data_editor")
 * (admin passes); anyone else is sent somewhere sensible instead of an
 * error page. Server Actions call requireRole directly.
 */
export async function requireDataEditor(): Promise<CurrentUser> {
  try {
    return await requireRole("data_editor");
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") redirect("/sign-in?next=/editor");
    redirect("/editor/content");
  }
}

/** Read ?ok= / ?error= flash params from a page's searchParams. */
export function flashFrom(sp: Record<string, string | string[] | undefined>): {
  ok?: string;
  error?: string;
} {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  return { ok: one(sp.ok), error: one(sp.error) };
}
