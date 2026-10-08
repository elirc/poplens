/**
 * Pure ranking logic (unit-tested without a database).
 * Ranking convention: rank 1 is the BEST place when the indicator has a
 * better direction (higherIsBetter true → largest value is rank 1;
 * false → smallest value is rank 1). With no direction (null), rank 1 is the
 * largest value. Ties share the same rank (competition ranking: 1,2,2,4).
 * Places with no data are excluded entirely — they are never rank-able.
 */

export interface Rankable {
  geoUnitId: number;
  value: number;
}

export interface Ranked extends Rankable {
  rank: number;
  outOf: number;
}

export function computeRanks(
  values: Rankable[],
  higherIsBetter: boolean | null,
): Ranked[] {
  const sorted = [...values].sort((a, b) =>
    higherIsBetter === false ? a.value - b.value : b.value - a.value,
  );
  const out: Ranked[] = [];
  let prevValue: number | null = null;
  let prevRank = 0;
  sorted.forEach((v, i) => {
    const rank = v.value === prevValue ? prevRank : i + 1;
    out.push({ ...v, rank, outOf: values.length });
    prevValue = v.value;
    prevRank = rank;
  });
  return out;
}

/** Rank of one place within a ranked list, or null when it has no data. */
export function rankOf(ranked: Ranked[], geoUnitId: number): Ranked | null {
  return ranked.find((r) => r.geoUnitId === geoUnitId) ?? null;
}

/** Ordinal suffix for display: 1st, 2nd, 3rd, 4th … */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
