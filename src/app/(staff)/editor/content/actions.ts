"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireRole } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { slugify } from "@/lib/utils";
import { parseStory } from "@/server/content/markdown";
import { parseCardSpec } from "@/server/content/card-spec";
import { buildCardData } from "@/server/content/cards";
import { getAvailableYears, getIndicatorByCode } from "@/server/indicators/queries";
import { getGeoUnitByCode, type GeoLevel } from "@/server/geo/queries";
import type { Block, CardData } from "@/components/content/types";

/**
 * Content-editor Server Actions. Every action: requireRole("content_editor")
 * (admin passes), Zod-validated input, audited publish/unpublish/delete.
 */

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

function zodMessage(e: z.ZodError): string {
  return e.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)).join("; ");
}

async function gate() {
  try {
    return await requireRole("content_editor");
  } catch (e) {
    throw new Error(e instanceof Error && e.message === "UNAUTHENTICATED" ? "Please sign in again." : "Content editors only.");
  }
}

const slugSchema = z
  .string()
  .trim()
  .min(3, "Slug is too short")
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug: lowercase letters, numbers and single hyphens");

function revalidateContent(kind: "story" | "card", slug: string) {
  if (kind === "story") {
    revalidatePath("/stories");
    revalidatePath(`/stories/${slug}`);
  } else {
    revalidatePath("/cards");
    revalidatePath(`/cards/${slug}`);
  }
  revalidatePath("/");
}

/* ── stories ───────────────────────────────────────────────────────── */

const StoryInput = z.object({
  id: z.number().int().positive().optional(),
  title: z.string().trim().min(3, "Title is too short").max(200),
  slug: z.string().trim().max(80).optional(),
  summary: z.string().trim().min(10, "Write a one-sentence summary").max(400),
  body: z.string().max(60_000, "Body is too long"),
  coverIndicator: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_.-]{1,64}$/)
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export async function saveStoryAction(input: unknown): Promise<ActionResult<{ id: number; slug: string }>> {
  const user = await gate();
  const parsed = StoryInput.safeParse(input);
  if (!parsed.success) return fail(zodMessage(parsed.error));
  const v = parsed.data;
  const slug = slugSchema.safeParse(v.slug?.trim() ? v.slug : slugify(v.title).slice(0, 80));
  if (!slug.success) return fail(zodMessage(slug.error));
  if (v.coverIndicator && !(await getIndicatorByCode(v.coverIndicator))) {
    return fail(`Unknown cover indicator "${v.coverIndicator}"`);
  }
  const clash = await db
    .select({ id: schema.stories.id })
    .from(schema.stories)
    .where(v.id ? and(eq(schema.stories.slug, slug.data), ne(schema.stories.id, v.id)) : eq(schema.stories.slug, slug.data))
    .limit(1);
  if (clash.length > 0) return fail(`Another story already uses the slug "${slug.data}"`);

  const values = {
    title: v.title,
    slug: slug.data,
    summary: v.summary,
    body: v.body,
    coverIndicator: v.coverIndicator ?? null,
    updatedAt: new Date(),
  };
  let id: number;
  if (v.id) {
    const rows = await db.update(schema.stories).set(values).where(eq(schema.stories.id, v.id)).returning({
      id: schema.stories.id,
      status: schema.stories.status,
    });
    if (rows.length === 0) return fail("Story not found");
    id = rows[0]!.id;
    if (rows[0]!.status === "published") revalidateContent("story", slug.data);
  } else {
    const rows = await db
      .insert(schema.stories)
      .values({ ...values, status: "draft", authorId: user.id })
      .returning({ id: schema.stories.id });
    id = rows[0]!.id;
  }
  await writeAudit({ actorId: user.id, action: "content.save_story", entity: "story", entityId: id, detail: { slug: slug.data } });
  revalidatePath("/editor/content");
  return { ok: true, data: { id, slug: slug.data } };
}

const StatusInput = z.object({ id: z.number().int().positive(), publish: z.boolean() });

export async function setStoryStatusAction(input: unknown): Promise<ActionResult<{ status: "draft" | "published" }>> {
  const user = await gate();
  const parsed = StatusInput.safeParse(input);
  if (!parsed.success) return fail(zodMessage(parsed.error));
  const { id, publish } = parsed.data;
  const [story] = await db.select().from(schema.stories).where(eq(schema.stories.id, id)).limit(1);
  if (!story) return fail("Story not found");
  if (publish) {
    const blocks = parseStory(story.body);
    const bad = blocks.filter((b) => b.t === "chart_error");
    if (bad.length > 0) {
      return fail(`Fix ${bad.length} broken chart shortcode${bad.length > 1 ? "s" : ""} before publishing.`);
    }
  }
  const now = new Date();
  await db
    .update(schema.stories)
    .set(
      publish
        ? { status: "published", publishedAt: story.publishedAt ?? now, updatedAt: now }
        : { status: "draft", updatedAt: now },
    )
    .where(eq(schema.stories.id, id));
  await writeAudit({
    actorId: user.id,
    action: publish ? "content.publish_story" : "content.unpublish_story",
    entity: "story",
    entityId: id,
    detail: { slug: story.slug, title: story.title },
  });
  revalidateContent("story", story.slug);
  revalidatePath("/editor/content");
  return { ok: true, data: { status: publish ? "published" : "draft" } };
}

export async function deleteStoryAction(input: unknown): Promise<ActionResult> {
  const user = await gate();
  const parsed = z.object({ id: z.number().int().positive() }).safeParse(input);
  if (!parsed.success) return fail(zodMessage(parsed.error));
  const rows = await db.delete(schema.stories).where(eq(schema.stories.id, parsed.data.id)).returning({
    slug: schema.stories.slug,
    title: schema.stories.title,
  });
  if (rows.length === 0) return fail("Story not found");
  await writeAudit({ actorId: user.id, action: "content.delete_story", entity: "story", entityId: parsed.data.id, detail: rows[0] });
  revalidateContent("story", rows[0]!.slug);
  revalidatePath("/editor/content");
  return { ok: true, data: undefined };
}

/** Parse a draft body for the live preview (no DB writes). */
export async function previewStoryAction(body: unknown): Promise<ActionResult<Block[]>> {
  await gate();
  const parsed = z.string().max(60_000).safeParse(body);
  if (!parsed.success) return fail("Body is too long");
  return { ok: true, data: parseStory(parsed.data) };
}

/* ── insight cards ─────────────────────────────────────────────────── */

const CardInput = z.object({
  id: z.number().int().positive().optional(),
  title: z.string().trim().min(3, "Title is too short").max(140),
  slug: z.string().trim().max(80).optional(),
  caption: z.string().trim().min(10, "Write a caption").max(500),
  spec: z.unknown(),
});

export async function saveCardAction(input: unknown): Promise<ActionResult<{ id: number; slug: string }>> {
  const user = await gate();
  const parsed = CardInput.safeParse(input);
  if (!parsed.success) return fail(zodMessage(parsed.error));
  const v = parsed.data;
  const spec = parseCardSpec(v.spec);
  if (!spec.ok) return fail(spec.message);
  const slug = slugSchema.safeParse(v.slug?.trim() ? v.slug : slugify(v.title).slice(0, 80));
  if (!slug.success) return fail(zodMessage(slug.error));
  const built = await buildCardData(spec.value, v.title);
  if (!built.ok) return fail(built.message);

  const clash = await db
    .select({ id: schema.insightCards.id })
    .from(schema.insightCards)
    .where(
      v.id
        ? and(eq(schema.insightCards.slug, slug.data), ne(schema.insightCards.id, v.id))
        : eq(schema.insightCards.slug, slug.data),
    )
    .limit(1);
  if (clash.length > 0) return fail(`Another card already uses the slug "${slug.data}"`);

  const values = { title: v.title, slug: slug.data, caption: v.caption, spec: spec.value };
  let id: number;
  if (v.id) {
    const rows = await db
      .update(schema.insightCards)
      .set(values)
      .where(eq(schema.insightCards.id, v.id))
      .returning({ id: schema.insightCards.id, status: schema.insightCards.status });
    if (rows.length === 0) return fail("Card not found");
    id = rows[0]!.id;
    if (rows[0]!.status === "published") revalidateContent("card", slug.data);
  } else {
    const rows = await db
      .insert(schema.insightCards)
      .values({ ...values, status: "draft", authorId: user.id })
      .returning({ id: schema.insightCards.id });
    id = rows[0]!.id;
  }
  await writeAudit({ actorId: user.id, action: "content.save_card", entity: "insight_card", entityId: id, detail: { slug: slug.data } });
  revalidatePath("/editor/content");
  return { ok: true, data: { id, slug: slug.data } };
}

export async function setCardStatusAction(input: unknown): Promise<ActionResult<{ status: "draft" | "published" }>> {
  const user = await gate();
  const parsed = StatusInput.safeParse(input);
  if (!parsed.success) return fail(zodMessage(parsed.error));
  const { id, publish } = parsed.data;
  const [card] = await db.select().from(schema.insightCards).where(eq(schema.insightCards.id, id)).limit(1);
  if (!card) return fail("Card not found");
  if (publish) {
    const spec = parseCardSpec(card.spec);
    if (!spec.ok) return fail(`Invalid card spec: ${spec.message}`);
    const built = await buildCardData(spec.value, card.title);
    if (!built.ok) return fail(built.message);
    if (built.data.headlineRaw == null) return fail("This card has no data to show — pick another year or place.");
  }
  await db
    .update(schema.insightCards)
    .set(publish ? { status: "published", publishedAt: card.publishedAt ?? new Date() } : { status: "draft" })
    .where(eq(schema.insightCards.id, id));
  await writeAudit({
    actorId: user.id,
    action: publish ? "content.publish_card" : "content.unpublish_card",
    entity: "insight_card",
    entityId: id,
    detail: { slug: card.slug, title: card.title, spec: card.spec },
  });
  revalidateContent("card", card.slug);
  revalidatePath("/editor/content");
  return { ok: true, data: { status: publish ? "published" : "draft" } };
}

export async function deleteCardAction(input: unknown): Promise<ActionResult> {
  const user = await gate();
  const parsed = z.object({ id: z.number().int().positive() }).safeParse(input);
  if (!parsed.success) return fail(zodMessage(parsed.error));
  const rows = await db.delete(schema.insightCards).where(eq(schema.insightCards.id, parsed.data.id)).returning({
    slug: schema.insightCards.slug,
    title: schema.insightCards.title,
  });
  if (rows.length === 0) return fail("Card not found");
  await writeAudit({ actorId: user.id, action: "content.delete_card", entity: "insight_card", entityId: parsed.data.id, detail: rows[0] });
  revalidateContent("card", rows[0]!.slug);
  revalidatePath("/editor/content");
  return { ok: true, data: undefined };
}

/** Live card data for the generator: suggested title/caption + facts. */
export async function suggestCardAction(
  specInput: unknown,
): Promise<ActionResult<{ title: string; caption: string; data: CardData }>> {
  await gate();
  const spec = parseCardSpec(specInput);
  if (!spec.ok) return fail(spec.message);
  const built = await buildCardData(spec.value, null);
  if (!built.ok) return fail(built.message);
  const d = built.data;
  const where = d.place?.name ?? "Nigeria";
  const yr = d.year != null ? `, ${d.year}` : "";
  let caption: string;
  switch (d.kind) {
    case "top5":
      caption =
        d.rows.length > 0
          ? `The five ${d.rankLine?.includes("LGAs") ? "LGAs" : "states"} with the highest ${d.indicator.name.toLowerCase()}${yr}: ${d.rows
              .map((r) => `${r.name} (${r.formatted})`)
              .join(", ")}.`
          : `No published data for ${d.indicator.name.toLowerCase()}${yr}.`;
      break;
    case "vs_national":
      caption = `${d.indicator.name} in ${where}: ${d.headline}, against ${d.national?.formatted ?? "No data"} nationally${yr}.`;
      break;
    case "single_stat":
      caption = `${d.indicator.name} in ${where}${yr}: ${d.headline}.${d.rankLine ? ` ${d.rankLine}.` : ""}`;
      break;
    case "trend":
      caption = `${d.indicator.name} in ${where} over time${d.rankLine ? ` (${d.rankLine})` : ""}.${d.sourcesDiffer ? " Sources differ across years." : ""}`;
      break;
  }
  caption += ` Source: ${d.sourceLine}.`;
  if (d.isEstimate) caption += " Modelled estimate.";
  if (d.isSynthetic) caption += " SYNTHETIC demo data — not real statistics.";
  return { ok: true, data: { title: d.title, caption: caption.slice(0, 500), data: d } };
}

/** Years with published data for the generator's year picker. */
export async function cardYearsAction(input: unknown): Promise<ActionResult<number[]>> {
  await gate();
  const parsed = z
    .object({
      indicatorCode: z.string().regex(/^[A-Za-z0-9_.-]{1,64}$/),
      level: z.enum(["state", "lga"]).optional(),
      placeCode: z.string().regex(/^[A-Za-z0-9-]{2,40}$/).optional(),
    })
    .safeParse(input);
  if (!parsed.success) return fail(zodMessage(parsed.error));
  const ind = await getIndicatorByCode(parsed.data.indicatorCode);
  if (!ind) return fail("Unknown indicator");
  let level: GeoLevel = parsed.data.level ?? "state";
  if (parsed.data.placeCode) {
    const u = await getGeoUnitByCode(parsed.data.placeCode.toUpperCase());
    if (u) level = u.level;
  }
  return { ok: true, data: await getAvailableYears(ind.id, level) };
}
