import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { SavedViewInput } from "./params";

export const MAX_SAVED_VIEWS = 200;

export async function listSavedViews(userId: string) {
  return db
    .select({
      id: schema.savedViews.id,
      name: schema.savedViews.name,
      kind: schema.savedViews.kind,
      params: schema.savedViews.params,
      createdAt: schema.savedViews.createdAt,
    })
    .from(schema.savedViews)
    .where(eq(schema.savedViews.userId, userId))
    .orderBy(desc(schema.savedViews.createdAt));
}

export async function countSavedViews(userId: string): Promise<number> {
  const rows = await db
    .select({ id: schema.savedViews.id })
    .from(schema.savedViews)
    .where(eq(schema.savedViews.userId, userId));
  return rows.length;
}

export async function insertSavedView(userId: string, input: SavedViewInput): Promise<number> {
  if ((await countSavedViews(userId)) >= MAX_SAVED_VIEWS) {
    throw new Error(`You can keep up to ${MAX_SAVED_VIEWS} saved views. Delete some first.`);
  }
  const [row] = await db
    .insert(schema.savedViews)
    .values({ userId, name: input.name, kind: input.kind, params: { path: input.path, query: input.query } })
    .returning({ id: schema.savedViews.id });
  return row.id;
}

export async function deleteSavedView(userId: string, id: number): Promise<boolean> {
  const res = await db
    .delete(schema.savedViews)
    .where(and(eq(schema.savedViews.id, id), eq(schema.savedViews.userId, userId)))
    .returning({ id: schema.savedViews.id });
  return res.length > 0;
}
