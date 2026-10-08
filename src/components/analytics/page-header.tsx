import type { ReactNode } from "react";
import { ShareLink } from "./controls";

/** Title + one-line description + copy-link button for each analytics page. */
export function AnalyticsHeader({
  title,
  description,
  children,
}: {
  title: string;
  description: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="mb-3 space-y-1">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        <ShareLink />
      </div>
      <p className="text-sm text-muted-foreground">{description}</p>
      {children}
    </header>
  );
}

/** Shared page container (phone-first gutters). */
export function AnalyticsPage({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-6xl space-y-4 px-3 py-4 sm:px-4">{children}</div>;
}
