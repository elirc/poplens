import { and, desc, eq, max, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { writeAudit } from "@/lib/audit";

/**
 * Dataset version lifecycle. Datasets sharing a seriesKey are versions of one
 * logical series:
 *   draft ── publish ──▶ published        (previous published → superseded)
 *   published ── rollback ──▶ rolled_back (latest superseded → published)
 * Public queries only see status='published', so draft values are invisible
 * until publish and rollback restores the earlier values. Both transitions
 * are transactional and audited.
 */

export async function nextVersionForSeries(seriesKey: string): Promise<number> {
  const rows = await db
    .select({ v: max(schema.datasets.version) })
    .from(schema.datasets)
    .where(eq(schema.datasets.seriesKey, seriesKey));
  return (rows[0]?.v ?? 0) + 1;
}

export interface PublishResult {
  datasetId: number;
  supersededDatasetId: number | null;
}

export async function publishDataset(
  datasetId: number,
  actorId: string | null,
): Promise<PublishResult> {
  return db.transaction(async (tx) => {
    const [ds] = await tx
      .select()
      .from(schema.datasets)
      .where(eq(schema.datasets.id, datasetId))
      .for("update");
    if (!ds) throw new Error(`Dataset ${datasetId} not found`);
    if (ds.status !== "draft") {
      throw new Error(`Dataset ${datasetId} is ${ds.status}, not draft`);
    }
    const [current] = await tx
      .select({ id: schema.datasets.id })
      .from(schema.datasets)
      .where(
        and(
          eq(schema.datasets.seriesKey, ds.seriesKey),
          eq(schema.datasets.status, "published"),
        ),
      )
      .for("update");
    if (current) {
      await tx
        .update(schema.datasets)
        .set({ status: "superseded" })
        .where(eq(schema.datasets.id, current.id));
    }
    await tx
      .update(schema.datasets)
      .set({
        status: "published",
        publishedAt: new Date(),
        publishedBy: actorId,
      })
      .where(eq(schema.datasets.id, datasetId));
    await writeAudit({
      actorId,
      action: "dataset.publish",
      entity: "dataset",
      entityId: datasetId,
      detail: { seriesKey: ds.seriesKey, superseded: current?.id ?? null },
    });
    return { datasetId, supersededDatasetId: current?.id ?? null };
  });
}

export interface RollbackResult {
  rolledBackDatasetId: number;
  restoredDatasetId: number | null;
}

export async function rollbackDataset(
  datasetId: number,
  actorId: string | null,
): Promise<RollbackResult> {
  return db.transaction(async (tx) => {
    const [ds] = await tx
      .select()
      .from(schema.datasets)
      .where(eq(schema.datasets.id, datasetId))
      .for("update");
    if (!ds) throw new Error(`Dataset ${datasetId} not found`);
    if (ds.status !== "published") {
      throw new Error(`Dataset ${datasetId} is ${ds.status}, not published`);
    }
    // Restore the most recent superseded version of the same series, if any.
    const [previous] = await tx
      .select({ id: schema.datasets.id })
      .from(schema.datasets)
      .where(
        and(
          eq(schema.datasets.seriesKey, ds.seriesKey),
          eq(schema.datasets.status, "superseded"),
        ),
      )
      .orderBy(desc(schema.datasets.version))
      .limit(1)
      .for("update");
    await tx
      .update(schema.datasets)
      .set({ status: "rolled_back" })
      .where(eq(schema.datasets.id, datasetId));
    if (previous) {
      await tx
        .update(schema.datasets)
        .set({ status: "published" })
        .where(eq(schema.datasets.id, previous.id));
    }
    await writeAudit({
      actorId,
      action: "dataset.rollback",
      entity: "dataset",
      entityId: datasetId,
      detail: { seriesKey: ds.seriesKey, restored: previous?.id ?? null },
    });
    return {
      rolledBackDatasetId: datasetId,
      restoredDatasetId: previous?.id ?? null,
    };
  });
}

/** Public "data updates" feed: every publish/rollback, newest first. */
export async function listPublishedChanges(limit = 50): Promise<
  Array<{
    datasetId: number;
    title: string;
    seriesKey: string;
    version: number;
    status: string;
    publishedAt: Date | null;
    sourcePublisher: string;
    isSynthetic: boolean;
    changeSummary: unknown;
  }>
> {
  const rows = await db
    .select({
      datasetId: schema.datasets.id,
      title: schema.datasets.title,
      seriesKey: schema.datasets.seriesKey,
      version: schema.datasets.version,
      status: schema.datasets.status,
      publishedAt: schema.datasets.publishedAt,
      sourcePublisher: schema.sources.publisher,
      isSynthetic: schema.datasets.isSynthetic,
      changeSummary: schema.datasets.changeSummary,
    })
    .from(schema.datasets)
    .innerJoin(schema.sources, eq(schema.datasets.sourceId, schema.sources.id))
    .where(
      sql`${schema.datasets.status} IN ('published','superseded','rolled_back')`,
    )
    .orderBy(desc(schema.datasets.publishedAt))
    .limit(limit);
  return rows as Awaited<ReturnType<typeof listPublishedChanges>>;
}
