import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { truncateAll } from "../db-helpers";
import { publishDataset, rollbackDataset } from "@/server/datasets/versioning";
import { getPublishedValue, getValuesForLevel } from "@/server/indicators/queries";
import { createIndicatorDraft } from "@/server/pipeline/store";
import { asChangeSummary } from "@/server/pipeline/diff";
import type { ResolvedValue } from "@/server/pipeline/types";

/**
 * Spec Definition-of-done test: "a draft dataset is invisible to the public
 * until published and rollback restores the earlier values". Uses the same
 * draft path as connectors/uploads (createIndicatorDraft) and the public
 * query layer. Fixture values are arbitrary test numbers.
 */

let stateA: number;
let stateB: number;
let indicatorId: number;
let sourceId: number;
const SERIES = "test-visibility";

beforeEach(async () => {
  await truncateAll();
  const [a, b] = await db
    .insert(schema.geoUnits)
    .values([
      { level: "state", name: "State A", code: "TST-A" },
      { level: "state", name: "State B", code: "TST-B" },
    ])
    .returning({ id: schema.geoUnits.id });
  stateA = a.id;
  stateB = b.id;
  const [ind] = await db
    .insert(schema.indicators)
    .values({
      code: "test_pct",
      name: "Test percent",
      category: "health_services",
      definition: "test",
      unit: "%",
      valueType: "percent",
      decimals: 1,
      aggregation: "none",
    })
    .returning({ id: schema.indicators.id });
  indicatorId = ind.id;
  const [src] = await db
    .insert(schema.sources)
    .values({ key: "test-src", publisher: "Test", title: "Test", licence: "CC0", allowsRedistribution: true })
    .returning({ id: schema.sources.id });
  sourceId = src.id;
});

afterAll(async () => {
  await truncateAll();
});

function v(geoUnitId: number, value: number, lower: number | null = null, upper: number | null = null): ResolvedValue {
  return {
    indicatorId,
    indicatorCode: "test_pct",
    geoUnitId,
    year: 2020,
    periodLabel: null,
    value,
    lower,
    upper,
    sex: "all",
    ageGroup: "all",
    residence: "all",
    isEstimate: true,
    note: null,
  };
}

const draft = (title: string, values: ResolvedValue[]) =>
  createIndicatorDraft(
    { sourceId, seriesKey: SERIES, title, isSynthetic: false, uploadedBy: null },
    values,
  );

async function status(id: number) {
  const [d] = await db.select({ s: schema.datasets.status }).from(schema.datasets).where(eq(schema.datasets.id, id));
  return d.s;
}

describe("draft visibility, publish, supersede, rollback", () => {
  it("draft values are invisible until published", async () => {
    const d1 = await draft("v1", [v(stateA, 10, 8, 12), v(stateB, 20)]);
    expect(await getPublishedValue(indicatorId, stateA)).toBeNull();
    expect(await getValuesForLevel(indicatorId, "state", 2020)).toEqual([]);

    await publishDataset(d1.datasetId, null);
    const pub = await getPublishedValue(indicatorId, stateA);
    expect(pub).toMatchObject({ value: 10, lower: 8, upper: 12, datasetId: d1.datasetId });
    const level = await getValuesForLevel(indicatorId, "state", 2020);
    expect(level.map((r) => [r.code, r.value]).sort()).toEqual([
      ["TST-A", 10],
      ["TST-B", 20],
    ]);
  });

  it("a v2 draft stays invisible; publishing it supersedes v1; rollback restores v1 exactly", async () => {
    const d1 = await draft("v1", [v(stateA, 10, 8, 12), v(stateB, 20)]);
    await publishDataset(d1.datasetId, null);

    const d2 = await draft("v2", [v(stateA, 15, 13, 17)]); // B removed in v2
    expect(d2.version).toBe(2);
    expect(asChangeSummary(d2.changeSummary)).toMatchObject({
      comparedWithDatasetId: d1.datasetId,
      changed: 1,
      removed: 1,
      added: 0,
    });
    // still v1 publicly
    expect((await getPublishedValue(indicatorId, stateA))?.value).toBe(10);

    await publishDataset(d2.datasetId, null);
    expect(await status(d1.datasetId)).toBe("superseded");
    expect(await status(d2.datasetId)).toBe("published");
    expect(await getPublishedValue(indicatorId, stateA)).toMatchObject({ value: 15, lower: 13, upper: 17 });
    expect(await getPublishedValue(indicatorId, stateB)).toBeNull(); // superseded values are not public

    const rb = await rollbackDataset(d2.datasetId, null);
    expect(rb.restoredDatasetId).toBe(d1.datasetId);
    expect(await status(d2.datasetId)).toBe("rolled_back");
    expect(await status(d1.datasetId)).toBe("published");
    expect(await getPublishedValue(indicatorId, stateA)).toMatchObject({
      value: 10,
      lower: 8,
      upper: 12,
      datasetId: d1.datasetId,
    });
    expect((await getPublishedValue(indicatorId, stateB))?.value).toBe(20);
    const level = await getValuesForLevel(indicatorId, "state", 2020);
    expect(level.every((r) => r.datasetId === d1.datasetId)).toBe(true);
  });

  it("rolling back the only version unpublishes the series", async () => {
    const d1 = await draft("v1", [v(stateA, 10)]);
    await publishDataset(d1.datasetId, null);
    const rb = await rollbackDataset(d1.datasetId, null);
    expect(rb.restoredDatasetId).toBeNull();
    expect(await getPublishedValue(indicatorId, stateA)).toBeNull();
  });

  it("refuses to publish a non-draft or roll back a non-published dataset", async () => {
    const d1 = await draft("v1", [v(stateA, 10)]);
    await expect(rollbackDataset(d1.datasetId, null)).rejects.toThrow(/not published/);
    await publishDataset(d1.datasetId, null);
    await expect(publishDataset(d1.datasetId, null)).rejects.toThrow(/not draft/);
  });
});
