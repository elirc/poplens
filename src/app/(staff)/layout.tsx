import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";

/**
 * Staff shell: every page under (staff) requires a staff role. Individual
 * pages still call requireRole for their specific role — this layout is the
 * outer gate and navigation.
 */
export default async function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=/editor");
  const staff = ["data_editor", "content_editor", "admin"];
  if (!staff.includes(user.role)) redirect("/");
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-6 flex flex-wrap items-center gap-3 border-b border-border pb-3 text-sm">
        <span className="font-semibold">Staff</span>
        {(user.role === "data_editor" || user.role === "admin") && (
          <>
            <Link href="/editor" className="text-muted-foreground hover:text-foreground">
              Data
            </Link>
            <Link
              href="/editor/uploads"
              className="text-muted-foreground hover:text-foreground"
            >
              Uploads
            </Link>
            <Link
              href="/editor/drafts"
              className="text-muted-foreground hover:text-foreground"
            >
              Drafts
            </Link>
            <Link
              href="/editor/sources"
              className="text-muted-foreground hover:text-foreground"
            >
              Sources
            </Link>
          </>
        )}
        {(user.role === "content_editor" || user.role === "admin") && (
          <Link
            href="/editor/content"
            className="text-muted-foreground hover:text-foreground"
          >
            Content
          </Link>
        )}
        {user.role === "admin" && (
          <Link href="/admin" className="text-muted-foreground hover:text-foreground">
            Admin
          </Link>
        )}
        <span className="ml-auto text-muted-foreground">
          {user.email} · {user.role.replace("_", " ")}
        </span>
      </div>
      {children}
    </div>
  );
}
