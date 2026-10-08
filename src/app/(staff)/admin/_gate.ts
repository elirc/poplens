import "server-only";
import { redirect } from "next/navigation";
import { requireRole, type CurrentUser } from "@/lib/session";

/** Page-level gate for platform-admin screens; actions call requireRole("admin") directly. */
export async function requireAdminPage(): Promise<CurrentUser> {
  try {
    return await requireRole("admin");
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") redirect("/sign-in?next=/admin");
    redirect("/");
  }
}
