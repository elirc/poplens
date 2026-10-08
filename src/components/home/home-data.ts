import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { listGeoUnits } from "@/server/geo/queries";
import { getPublishedValue, listIndicators, type IndicatorMetaRow, type PublicValue } from "@/server/indicators/queries";
import { KEY_INDICATORS } from "@/server/indicators/catalogue-data";

/** Read-only data for the home page. Values only via the published-join contract. */

export interface HeadlineFigure {
  meta: IndicatorMetaRow;
  value: PublicValue | null;
}

export async function getHeadlineFigures(): Promise<{
  nationName: string | null;
  figures: HeadlineFigure[];
}> {
  const [nations, indicators] = await Promise.all([listGeoUnits("nation"), listIndicators()]);
  const nation = nations[0];
  const byCode = new Map(indicators.map((i) => [i.code, i]));
  const metas = KEY_INDICATORS.map((c) => byCode.get(c)).filter(
    (m): m is IndicatorMetaRow => Boolean(m),
  );
  const figures = await Promise.all(
    metas.map(async (meta) => ({
      meta,
      value: nation ? await getPublishedValue(meta.id, nation.id) : null,
    })),
  );
  return { nationName: nation?.name ?? null, figures };
}

export async function getFeaturedCards(limit = 6) {
  return db
    .select({
      slug: schema.insightCards.slug,
      title: schema.insightCards.title,
      caption: schema.insightCards.caption,
      publishedAt: schema.insightCards.publishedAt,
    })
    .from(schema.insightCards)
    .where(
      and(eq(schema.insightCards.status, "published"), isNotNull(schema.insightCards.publishedAt)),
    )
    .orderBy(desc(schema.insightCards.publishedAt))
    .limit(limit);
}

export async function getLatestStories(limit = 3) {
  return db
    .select({
      slug: schema.stories.slug,
      title: schema.stories.title,
      summary: schema.stories.summary,
      publishedAt: schema.stories.publishedAt,
    })
    .from(schema.stories)
    .where(and(eq(schema.stories.status, "published"), isNotNull(schema.stories.publishedAt)))
    .orderBy(desc(schema.stories.publishedAt))
    .limit(limit);
}
