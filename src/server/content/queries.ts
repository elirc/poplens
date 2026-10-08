import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { CardSpec } from "@/components/content/types";
import { parseCardSpec } from "./card-spec";

/**
 * Story / insight-card reads. Public readers only ever see status='published';
 * the staff editor uses the *ForStaff variants.
 */

export interface StoryRow {
  id: number;
  slug: string;
  title: string;
  summary: string;
  body: string;
  coverIndicator: string | null;
  status: "draft" | "published";
  authorId: string | null;
  authorName: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CardRow {
  id: number;
  slug: string;
  title: string;
  caption: string;
  /** Raw jsonb as stored. */
  rawSpec: unknown;
  /** Validated spec, or null when the stored jsonb is invalid. */
  spec: CardSpec | null;
  specError: string | null;
  status: "draft" | "published";
  authorId: string | null;
  authorName: string | null;
  publishedAt: Date | null;
  createdAt: Date;
}

const storyCols = {
  id: schema.stories.id,
  slug: schema.stories.slug,
  title: schema.stories.title,
  summary: schema.stories.summary,
  body: schema.stories.body,
  coverIndicator: schema.stories.coverIndicator,
  status: schema.stories.status,
  authorId: schema.stories.authorId,
  authorName: schema.user.name,
  publishedAt: schema.stories.publishedAt,
  createdAt: schema.stories.createdAt,
  updatedAt: schema.stories.updatedAt,
};

const cardCols = {
  id: schema.insightCards.id,
  slug: schema.insightCards.slug,
  title: schema.insightCards.title,
  caption: schema.insightCards.caption,
  rawSpec: schema.insightCards.spec,
  status: schema.insightCards.status,
  authorId: schema.insightCards.authorId,
  authorName: schema.user.name,
  publishedAt: schema.insightCards.publishedAt,
  createdAt: schema.insightCards.createdAt,
};

function storiesQuery() {
  return db
    .select(storyCols)
    .from(schema.stories)
    .leftJoin(schema.user, eq(schema.stories.authorId, schema.user.id));
}

function cardsQuery() {
  return db
    .select(cardCols)
    .from(schema.insightCards)
    .leftJoin(schema.user, eq(schema.insightCards.authorId, schema.user.id));
}

function withSpec(r: Omit<CardRow, "spec" | "specError">): CardRow {
  const p = parseCardSpec(r.rawSpec);
  return { ...r, spec: p.ok ? p.value : null, specError: p.ok ? null : p.message };
}

export async function listPublishedStories(limit = 50): Promise<StoryRow[]> {
  return storiesQuery()
    .where(eq(schema.stories.status, "published"))
    .orderBy(desc(schema.stories.publishedAt))
    .limit(limit);
}

export async function getPublishedStory(slug: string): Promise<StoryRow | null> {
  const rows = await storiesQuery()
    .where(and(eq(schema.stories.slug, slug), eq(schema.stories.status, "published")))
    .limit(1);
  return rows[0] ?? null;
}

export async function listPublishedCards(limit = 60): Promise<CardRow[]> {
  const rows = await cardsQuery()
    .where(eq(schema.insightCards.status, "published"))
    .orderBy(desc(schema.insightCards.publishedAt), desc(schema.insightCards.id))
    .limit(limit);
  return rows.map(withSpec);
}

export async function getCardBySlug(
  slug: string,
  opts: { includeDrafts?: boolean } = {},
): Promise<CardRow | null> {
  const cond = opts.includeDrafts
    ? eq(schema.insightCards.slug, slug)
    : and(eq(schema.insightCards.slug, slug), eq(schema.insightCards.status, "published"));
  const rows = await cardsQuery().where(cond).limit(1);
  return rows[0] ? withSpec(rows[0]) : null;
}

/* ── staff ─────────────────────────────────────────────────────────── */

export async function listStoriesForStaff(): Promise<StoryRow[]> {
  return storiesQuery().orderBy(desc(schema.stories.updatedAt));
}

export async function getStoryForStaff(id: number): Promise<StoryRow | null> {
  const rows = await storiesQuery().where(eq(schema.stories.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function listCardsForStaff(): Promise<CardRow[]> {
  const rows = await cardsQuery().orderBy(desc(schema.insightCards.createdAt));
  return rows.map(withSpec);
}

export async function getCardForStaff(id: number): Promise<CardRow | null> {
  const rows = await cardsQuery().where(eq(schema.insightCards.id, id)).limit(1);
  return rows[0] ? withSpec(rows[0]) : null;
}
