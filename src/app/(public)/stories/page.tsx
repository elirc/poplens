import type { Metadata } from "next";
import Link from "next/link";
import { listPublishedStories } from "@/server/content/queries";
import { formatLagosDate } from "@/lib/format";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Stories",
  description: "Short data stories about Nigeria's population and health, with live charts and sources.",
};

export default async function StoriesIndex() {
  const stories = await listPublishedStories();
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Stories</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Short data articles with live charts. Every chart shows its source and year, and can be
        embedded on your own site.
      </p>
      {stories.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">No stories have been published yet.</p>
      ) : (
        <ul className="mt-6 divide-y divide-border">
          {stories.map((s) => (
            <li key={s.id} className="py-5">
              <Link href={`/stories/${s.slug}`} className="group block">
                <h2 className="text-lg font-semibold leading-snug group-hover:underline">{s.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{s.summary}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {s.authorName ? `${s.authorName} · ` : ""}
                  {s.publishedAt ? formatLagosDate(s.publishedAt) : ""}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
