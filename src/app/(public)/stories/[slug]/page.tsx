import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublishedStory } from "@/server/content/queries";
import { parseStory } from "@/server/content/markdown";
import { formatLagosDate } from "@/lib/format";
import { StoryBlocks } from "@/components/content/story-blocks";
import { StoryChart } from "@/components/content/story-chart";
import { ShareLinks } from "@/components/content/share-links";
import { env } from "@/env";

export const revalidate = 300;
export const dynamicParams = true;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const story = await getPublishedStory(decodeURIComponent(slug));
  if (!story) return { title: "Story not found" };
  return {
    title: story.title,
    description: story.summary,
    openGraph: { title: story.title, description: story.summary, type: "article" },
  };
}

export default async function StoryPage({ params }: Props) {
  const { slug } = await params;
  const story = await getPublishedStory(decodeURIComponent(slug));
  if (!story) notFound();
  const blocks = parseStory(story.body);
  const url = `${env.APP_URL.replace(/\/+$/, "")}/stories/${story.slug}`;

  return (
    <article className="mx-auto max-w-3xl px-4 py-8">
      <nav className="text-xs text-muted-foreground">
        <Link href="/stories" className="hover:text-foreground">
          Stories
        </Link>
      </nav>
      <h1 className="mt-2 text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">{story.title}</h1>
      <p className="mt-2 text-muted-foreground">{story.summary}</p>
      <p className="mt-3 text-xs text-muted-foreground">
        {story.authorName ? <>By {story.authorName} · </> : null}
        {story.publishedAt ? <time dateTime={story.publishedAt.toISOString()}>{formatLagosDate(story.publishedAt)}</time> : null}
        {story.updatedAt && story.publishedAt && story.updatedAt > story.publishedAt
          ? ` · updated ${formatLagosDate(story.updatedAt)}`
          : null}
      </p>

      <div className="mt-2">
        <StoryBlocks
          blocks={blocks}
          renderChart={(spec, raw) => <StoryChart spec={spec} raw={raw} />}
        />
      </div>

      <footer className="mt-10 space-y-3 border-t border-border pt-4">
        <p className="text-xs text-muted-foreground">
          Charts use live published data and update when new data is published. Each chart lists its
          source; see <Link href="/about-data" className="underline">sources &amp; licences</Link>.
        </p>
        <ShareLinks url={url} text={story.title} />
      </footer>
    </article>
  );
}
