import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatLagosDate } from "@/lib/format";
import { listCardsForStaff, listStoriesForStaff } from "@/server/content/queries";
import { requireContentEditor } from "./_components/gate";

export const metadata: Metadata = { title: "Content editor" };

function Status({ s }: { s: "draft" | "published" }) {
  return <Badge variant={s === "published" ? "success" : "warning"}>{s}</Badge>;
}

export default async function ContentDashboard() {
  await requireContentEditor();
  const [stories, cards] = await Promise.all([listStoriesForStaff(), listCardsForStaff()]);
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-xl font-semibold">Content editor</h1>
        <div className="flex flex-wrap gap-2">
          <Link href="/editor/content/stories/new" className={buttonVariants({ size: "sm" })}>
            New story
          </Link>
          <Link href="/editor/content/cards/new" className={buttonVariants({ size: "sm", variant: "outline" })}>
            New insight card
          </Link>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Stories</CardTitle>
          </CardHeader>
          <CardContent>
            {stories.length === 0 ? (
              <p className="text-sm text-muted-foreground">No stories yet.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {stories.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-2 py-2">
                    <Link href={`/editor/content/stories/${s.id}`} className="font-medium hover:underline">
                      {s.title}
                    </Link>
                    <Status s={s.status} />
                    <span className="ml-auto text-xs text-muted-foreground">
                      {s.authorName ?? "—"} · {formatLagosDate(s.updatedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Insight cards</CardTitle>
          </CardHeader>
          <CardContent>
            {cards.length === 0 ? (
              <p className="text-sm text-muted-foreground">No cards yet.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {cards.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-2 py-2">
                    <Link href={`/editor/content/cards/${c.id}`} className="font-medium hover:underline">
                      {c.title}
                    </Link>
                    <Status s={c.status} />
                    {c.specError && <Badge variant="destructive">invalid spec</Badge>}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {c.spec?.kind ?? "?"} · {c.spec?.indicatorCode ?? "?"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
