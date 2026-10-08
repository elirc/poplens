import Link from "next/link";
import { StatTile } from "@/components/data/stat-tile";
import { formatLagosDate } from "@/lib/format";
import { getFeaturedCards, getHeadlineFigures, getLatestStories } from "./home-data";

/** Async server sections of the home page (streamed behind Suspense). */

export async function HeadlineFigures() {
  const { figures } = await getHeadlineFigures();
  if (figures.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        The indicator catalogue has not been loaded yet.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {figures.map(({ meta, value }) => (
        <StatTile
          key={meta.code}
          label={meta.name}
          value={value?.value ?? null}
          lower={value?.lower}
          upper={value?.upper}
          meta={meta}
          sourceName={value?.sourcePublisher}
          year={value ? (value.periodLabel ?? value.year) : null}
          isEstimate={value?.isEstimate}
          href={`/indicators/${meta.code}`}
        />
      ))}
    </div>
  );
}

export async function FeaturedCards() {
  const cards = await getFeaturedCards(6);
  if (cards.length === 0) {
    return <p className="text-sm text-muted-foreground">No insight cards have been published yet.</p>;
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((c) => (
        <li key={c.slug}>
          <Link
            href={`/cards/${c.slug}`}
            className="flex h-full flex-col rounded-lg border border-border bg-card p-4 transition-shadow hover:shadow-sm"
          >
            <span className="font-medium">{c.title}</span>
            <span className="mt-1 line-clamp-3 text-sm text-muted-foreground">{c.caption}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export async function LatestStories() {
  const stories = await getLatestStories(3);
  if (stories.length === 0) {
    return <p className="text-sm text-muted-foreground">No stories have been published yet.</p>;
  }
  return (
    <ul className="grid gap-3 md:grid-cols-3">
      {stories.map((s) => (
        <li key={s.slug}>
          <Link
            href={`/stories/${s.slug}`}
            className="flex h-full flex-col rounded-lg border border-border bg-card p-4 transition-shadow hover:shadow-sm"
          >
            {s.publishedAt && (
              <time
                dateTime={new Date(s.publishedAt).toISOString()}
                className="text-xs text-muted-foreground"
              >
                {formatLagosDate(s.publishedAt)}
              </time>
            )}
            <span className="mt-1 font-medium">{s.title}</span>
            <span className="mt-1 line-clamp-3 text-sm text-muted-foreground">{s.summary}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
