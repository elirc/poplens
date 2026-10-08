import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { listPublishedCards } from "@/server/content/queries";
import { ShareLinks } from "@/components/content/share-links";
import { env } from "@/env";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Insight cards",
  description: "Share-ready images of Nigeria's population and health figures, generated from live data with their source and year.",
};

export default async function CardsGallery() {
  const cards = await listPublishedCards();
  const base = env.APP_URL.replace(/\/+$/, "");
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Insight cards</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        Share-ready images generated from live published data. Every card carries its source and
        year; open a card for square and wide versions.
      </p>
      {cards.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">No insight cards have been published yet.</p>
      ) : (
        <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <li key={c.id} className="flex flex-col overflow-hidden rounded-lg border border-border bg-card">
              <Link href={`/cards/${c.slug}`} className="block">
                <Image
                  src={`/api/og/card/${encodeURIComponent(c.slug)}?size=wide`}
                  alt={`${c.title}. ${c.caption}`}
                  width={1200}
                  height={630}
                  unoptimized
                  loading="lazy"
                  className="h-auto w-full border-b border-border bg-muted"
                />
              </Link>
              <div className="flex flex-1 flex-col gap-3 p-3">
                <div>
                  <Link href={`/cards/${c.slug}`} className="font-medium leading-snug hover:underline">
                    {c.title}
                  </Link>
                  <p className="mt-1 text-sm text-muted-foreground">{c.caption}</p>
                </div>
                <div className="mt-auto">
                  <ShareLinks url={`${base}/cards/${c.slug}`} text={c.title} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
