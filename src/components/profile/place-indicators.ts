import type { GeoUnitLite } from "@/server/geo/queries";
import {
  getAllPublishedHeadlineValues,
  getHeadlineValuesForScope,
  type IndicatorMetaRow,
  type PublicValue,
} from "@/server/indicators/queries";
import { computeRanks, ordinal, rankOf } from "@/server/indicators/ranks";
import { formatValue } from "@/lib/format";
import { LEVEL_PLURAL } from "@/components/indicators/labels";

export interface PlaceIndicator {
  meta: IndicatorMetaRow;
  value: PublicValue | null;
  nationalLabel: string | null;
  rankLabel: string | null;
}

/**
 * Latest published value of every indicator for a place, plus the national
 * figure and the place's rank among its siblings for the same year.
 * All values come through the published-join contract (queries.ts) using the
 * BULK readers — three queries per profile instead of ~4 per indicator.
 *
 * Sibling scope: states rank among all states; LGAs among the LGAs of their
 * state; wards among the wards of their LGA. Nation/zone are not ranked.
 */
export async function loadPlaceIndicators(
  unit: GeoUnitLite,
  nation: GeoUnitLite | null,
  indicators: IndicatorMetaRow[],
  parentName: string | null,
): Promise<PlaceIndicator[]> {
  const rankable = unit.level === "state" || unit.level === "lga" || unit.level === "ward";
  const parentId = unit.level === "state" ? undefined : (unit.parentId ?? undefined);
  const scopeSuffix =
    unit.level === "state" ? "" : parentName ? ` in ${parentName}` : "";

  const [unitRows, nationRows, siblingRows] = await Promise.all([
    getAllPublishedHeadlineValues(unit.id),
    nation && nation.id !== unit.id
      ? getAllPublishedHeadlineValues(nation.id)
      : Promise.resolve([]),
    rankable
      ? getHeadlineValuesForScope(unit.level, parentId)
      : Promise.resolve([]),
  ]);

  // Latest year per indicator for the place.
  const latestByIndicator = new Map<number, PublicValue & { indicatorId: number }>();
  for (const row of unitRows) {
    const prev = latestByIndicator.get(row.indicatorId);
    if (!prev || row.year > prev.year) latestByIndicator.set(row.indicatorId, row);
  }
  // National values: by (indicator, year) for same-year lookups + latest.
  const nationByYear = new Map<string, PublicValue & { indicatorId: number }>();
  const nationLatest = new Map<number, PublicValue & { indicatorId: number }>();
  for (const row of nationRows) {
    nationByYear.set(`${row.indicatorId}:${row.year}`, row);
    const prev = nationLatest.get(row.indicatorId);
    if (!prev || row.year > prev.year) nationLatest.set(row.indicatorId, row);
  }
  // Sibling values grouped by (indicator, year) for rank computation.
  const siblingsByKey = new Map<string, Array<{ geoUnitId: number; value: number }>>();
  for (const row of siblingRows) {
    const key = `${row.indicatorId}:${row.year}`;
    const list = siblingsByKey.get(key);
    const entry = { geoUnitId: row.geoUnitId, value: Number(row.value) };
    if (list) list.push(entry);
    else siblingsByKey.set(key, [entry]);
  }

  return indicators.map((meta): PlaceIndicator => {
    const value = latestByIndicator.get(meta.id) ?? null;
    let nationalLabel: string | null = null;
    let rankLabel: string | null = null;

    if (nation && nation.id !== unit.id) {
      const nat =
        (value && nationByYear.get(`${meta.id}:${value.year}`)) ??
        nationLatest.get(meta.id) ??
        null;
      if (nat) {
        const sameYear = value && nat.year === value.year;
        nationalLabel = `${nation.name}: ${formatValue(nat.value, meta)}${
          sameYear ? "" : ` (${nat.year})`
        }`;
      }
    }

    if (value && rankable) {
      const siblings = siblingsByKey.get(`${meta.id}:${value.year}`) ?? [];
      const ranked = computeRanks(siblings, meta.higherIsBetter);
      const mine = rankOf(ranked, unit.id);
      if (mine && mine.outOf > 1) {
        const qualifier = meta.higherIsBetter === null ? " highest" : "";
        rankLabel = `${ordinal(mine.rank)}${qualifier} of ${mine.outOf} ${
          LEVEL_PLURAL[unit.level]
        }${scopeSuffix}`;
      }
    }

    return { meta, value, nationalLabel, rankLabel };
  });
}
