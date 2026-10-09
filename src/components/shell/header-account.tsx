"use client";

import Link from "next/link";
import { useSession } from "@/lib/auth-client";

/**
 * The session-aware corner of the header, rendered client-side so public
 * pages stay static/ISR-cacheable (a server-side session read would force
 * every page dynamic). Until the session loads, the signed-out state shows —
 * acceptable flicker in exchange for cacheable pages on slow phones.
 */
export function HeaderAccount() {
  const { data: session } = useSession();
  const user = session?.user as
    | { name?: string; role?: string }
    | undefined;
  if (!user) {
    return (
      <Link
        href="/sign-in"
        className="rounded-md border border-border px-3 py-1.5 hover:bg-muted"
      >
        Sign in
      </Link>
    );
  }
  const role = user.role ?? "user";
  const isStaff = ["data_editor", "content_editor", "admin"].includes(role);
  return (
    <>
      {isStaff && (
        <Link
          href={role === "content_editor" ? "/editor/content" : "/editor"}
          className="hidden text-muted-foreground hover:text-foreground sm:inline"
        >
          Staff
        </Link>
      )}
      <Link href="/account" className="text-muted-foreground hover:text-foreground">
        {user.name || "Account"}
      </Link>
    </>
  );
}
