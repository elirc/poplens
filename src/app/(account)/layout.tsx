import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=/account");
  return <div className="mx-auto max-w-4xl px-4 py-6">{children}</div>;
}
