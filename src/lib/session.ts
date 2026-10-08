import "server-only";
import { headers } from "next/headers";
import { cache } from "react";
import { auth } from "./auth";

export type AppRole = "user" | "data_editor" | "content_editor" | "admin";

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: AppRole;
  activeOrganizationId: string | null;
}

/** Cached per-request session lookup. Null when not signed in. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: (session.user as { role?: string }).role as AppRole,
    activeOrganizationId:
      (session.session as { activeOrganizationId?: string | null })
        .activeOrganizationId ?? null,
  };
});

/** Throws if not signed in. Use at the top of every protected server action. */
export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) throw new Error("UNAUTHENTICATED");
  return u;
}

/**
 * Role gate. admin passes every gate; otherwise the role must match exactly.
 * Usage: await requireRole("data_editor")
 */
export async function requireRole(
  ...roles: AppRole[]
): Promise<CurrentUser> {
  const u = await requireUser();
  if (u.role === "admin" || roles.includes(u.role)) return u;
  throw new Error("FORBIDDEN");
}
