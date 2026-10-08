import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { getCardBySlug } from "@/server/content/queries";
import { buildCardData } from "@/server/content/cards";
import { SourceLine } from "@/components/data/source-line";
import { ShareLinks } from "@/components/content/share-links";
import { EmbedButton } from "@/components/content/embed-button";
import { DownloadButtons } from "@/components/content/download-buttons";
import { chartEmbedPath } from "@/components/content/embed-url";
import { cardChartSpec, cardDownloadSpec } from "@/components/content/card-chart";
import { ChartErrorBox } from "@/components/content/chart-error";
import { buttonVariants } from "@/components/ui/button";
import { env } from "@/env";

export const revalidate = 300;
export const dynamicParams = true;

type Props = { params: Promise<{ slug: string }> };

const base = () => env.APP_URL.replace(/\/+$/, "");

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const card = await getCardBySlug(decodeURIComponent(slug));
  if (!card) return { title: "Card not found" };
  const image = `${base()}/api/og/card/${encodeURIComponent(card.slug)}?size=wide`;
  return {
    title: card.title,
    description: card.caption,
    openGraph: {
      title: card.title,
      description: card.caption,
      url: `${base()}/cards/${card.slug}`,
      images: [{ url: image, width: 1200, height: 630, alt: card.title }],
    },
    twitter: { card: "summary_large_image", title: card.title, description: card.caption, images: [image] },
  };
}

export default async function CardPage({ params }: Props) {
  const { slug } = await params;
  const card = await getCardBySlug(decodeURIComponent(slug));
  if (!card) notFound();
  const built = card.spec ? await buildCardData(card.spec, card.title) : null;
  const img = (size: "wide" | "square") => `/api/og/card/${encodeURIComponent(card.slug)}?size=${size}`;
  const url = `${base()}/cards/${card.slug}`;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <nav className="text-xs text-muted-foreground">
        <Link href="/cards" className="hover:text-foreground">
          Insight cards
        </Link>
      </nav>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{card.title}</h1>
      <p className="mt-1 max-w-2xl text-muted-foreground">{card.caption}</p>
      {built?.ok && (
        <SourceLine
          className="mt-2"
          sourceName={built.data.isSynthetic ? `${built.data.sourceLine} (SYNTHETIC demo data)` : built.data.sourceLine}
        />
      )}
      {!card.spec && <ChartErrorBox message={`This card's spec is invalid: ${card.specError}`} />}
      {built && !built.ok && <ChartErrorBox message={built.message} />}

      <div className="mt-6 grid gap-6 lg:grid-cols-[3fr_2fr]">
        <figure className="space-y-2">
          <Image
            src={img("wide")}
            alt={`${card.title} — wide card. ${card.caption}`}
            width={1200}
            height={630}
            unoptimized
            priority
            className="h-auto w-full rounded-lg border border-border bg-muted"
          />
          <figcaption className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            Wide 1200×630 (links, X)
            <a href={`${img("wide")}&download=1`} download className={buttonVariants({ size: "sm", variant: "outline" })}>
              <Download aria-hidden /> Download wide
            </a>
          </figcaption>
        </figure>
        <figure className="space-y-2">
          <Image
            src={img("square")}
            alt={`${card.title} — square card. ${card.caption}`}
            width={1080}
            height={1080}
            unoptimized
            loading="lazy"
            className="h-auto w-full max-w-sm rounded-lg border border-border bg-muted"
          />
          <figcaption className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            Square 1080×1080 (WhatsApp, Instagram)
            <a href={`${img("square")}&download=1`} download className={buttonVariants({ size: "sm", variant: "outline" })}>
              <Download aria-hidden /> Download square
            </a>
          </figcaption>
        </figure>
      </div>

      <section className="mt-8 grid gap-6 border-t border-border pt-6 sm:grid-cols-2">
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Share</h2>
          <ShareLinks url={url} text={card.title} />
          {built?.ok && (
            <EmbedButton path={chartEmbedPath(cardChartSpec(built.data))} title={card.title} />
          )}
        </div>
        {built?.ok && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold">Explore the data</h2>
            <div className="flex flex-wrap gap-2 text-sm">
              <Link href={built.data.exploreHref} className={buttonVariants({ size: "sm", variant: "secondary" })}>
                {built.data.indicator.name} on the map
              </Link>
              {built.data.profileHref && built.data.place && (
                <Link href={built.data.profileHref} className={buttonVariants({ size: "sm", variant: "secondary" })}>
                  {built.data.place.name} profile
                </Link>
              )}
              <Link
                href={`/indicators/${encodeURIComponent(built.data.indicator.code)}`}
                className={buttonVariants({ size: "sm", variant: "ghost" })}
              >
                About this indicator
              </Link>
            </div>
            <DownloadButtons spec={cardDownloadSpec(built.data)} label="Download the data behind this card" />
          </div>
        )}
      </section>
    </div>
  );
}
