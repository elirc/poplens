/** Okabe-Ito categorical palette (colour-blind safe; COMMON.md order). */
export const OKABE_ITO = [
  "#0072B2",
  "#E69F00",
  "#009E73",
  "#CC79A7",
  "#56B4E9",
  "#D55E00",
  "#F0E442",
] as const;

export function seriesColor(i: number): string {
  return OKABE_ITO[i % OKABE_ITO.length]!;
}

/** Neutral colour for national reference lines/markers. */
export const REFERENCE_COLOR = "#374151";
