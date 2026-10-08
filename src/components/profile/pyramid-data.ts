/**
 * Pure helpers for the age-sex pyramid. Age groups arrive as labels like
 * '0-4', '5-9', …, '80+'; we order them numerically (youngest at the bottom
 * of the pyramid is handled by the chart's reversed axis).
 */

export interface PyramidInputRow {
  ageGroup: string;
  sex: "male" | "female" | "all";
  value: number;
}

export interface PyramidRow {
  ageGroup: string;
  male: number | null;
  female: number | null;
  total: number | null;
}

export interface PyramidData {
  /** 'sex' = male/female rows exist (true pyramid); 'total' = only both-sexes rows. */
  mode: "sex" | "total";
  rows: PyramidRow[];
}

/** Lower bound of an age-group label: '15-19' → 15, '80+' → 80, '<1' → 0. Unknown → Infinity. */
export function ageGroupStart(label: string): number {
  const m = label.match(/\d+/);
  if (!m) return Number.POSITIVE_INFINITY;
  return label.trim().startsWith("<") ? 0 : Number(m[0]);
}

export function sortAgeGroups(labels: string[]): string[] {
  return [...new Set(labels)].sort(
    (a, b) => ageGroupStart(a) - ageGroupStart(b) || a.localeCompare(b),
  );
}

export function buildPyramid(input: PyramidInputRow[]): PyramidData | null {
  if (input.length === 0) return null;
  const hasSex = input.some((r) => r.sex === "male" || r.sex === "female");
  const groups = sortAgeGroups(input.map((r) => r.ageGroup));
  const get = (g: string, sex: PyramidInputRow["sex"]) =>
    input.find((r) => r.ageGroup === g && r.sex === sex)?.value ?? null;
  const rows = groups.map((g) => {
    const male = get(g, "male");
    const female = get(g, "female");
    const all = get(g, "all");
    const total = all ?? (male != null && female != null ? male + female : null);
    return { ageGroup: g, male, female, total };
  });
  return { mode: hasSex ? "sex" : "total", rows };
}
