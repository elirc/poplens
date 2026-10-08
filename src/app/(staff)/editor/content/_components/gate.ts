import "server-only";
import { redirect } from "next/navigation";
import { requireRole, type CurrentUser } from "@/lib/session";

/**
 * Page-level gate for content-editor screens: requireRole("content_editor")
 * (admin passes). Others are redirected instead of seeing an error page.
 * Server Actions call requireRole directly.
 */
export async function requireContentEditor(): Promise<CurrentUser> {
  try {
    return await requireRole("content_editor");
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") redirect("/sign-in?next=/editor/content");
    redirect("/editor");
  }
}
