import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { env } from "@/env";
import { getCurrentUser } from "@/lib/session";
import { SignInPanel } from "@/components/account/auth-forms";
import { safeNext } from "../next-param";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const next = safeNext((await searchParams).next);
  if (await getCurrentUser()) redirect(next);
  return <SignInPanel next={next} smsMock={env.ADAPTER_SMS === "mock"} />;
}
