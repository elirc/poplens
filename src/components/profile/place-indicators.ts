import type { GeoUnitLite } from "@/server/geo/queries";
import {
  getPublishedValue,
  getValuesForLevel,
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
 * All values come through the published-join contract (queries.ts).
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

  return Promise.all(
    indicators.map(async (meta): Promise<PlaceIndicator> => {
      const value = await getPublishedValue(meta.id, unit.id);
      let nationalLabel: string | null = null;
      let rankLabel: string | null = null;

      if (nation && nation.id !== unit.id) {
        const nat =
          (value && (await getPublishedValue(meta.id, nation.id, { year: value.year }))) ||
          (await getPublishedValue(meta.id, nation.id));
        if (nat) {
          const sameYear = value && nat.year === value.year;
          nationalLabel = `${nation.name}: ${formatValue(nat.value, meta)}${
            sameYear ? "" : ` (${nat.year})`
          }`;
        }
      }

      if (value && rankable) {
        const siblings = await getValuesForLevel(meta.id, unit.level, value.year, { parentId });
        const ranked = computeRanks(
          siblings.map((s) => ({ geoUnitId: s.geoUnitId, value: Number(s.value) })),
          meta.higherIsBetter,
        );
        const mine = rankOf(ranked, unit.id);
        if (mine && mine.outOf > 1) {
          const qualifier = meta.higherIsBetter === null ? " highest" : "";
          rankLabel = `${ordinal(mine.rank)}${qualifier} of ${mine.outOf} ${
            LEVEL_PLURAL[unit.level]
          }${scopeSuffix}`;
        }
      }

      return { meta, value, nationalLabel, rankLabel };
    }),
  );
}
