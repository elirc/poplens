import type { StateNode } from "./hierarchy";
import { allocateInteger, centred, clamp, hash01 } from "./prng";

/**
 * SYNTHETIC population model for the demo seed. NOT real statistics.
 *
 * Totals are allocated top-down with largest-remainder integer splits, so
 * ward sums equal their LGA exactly, LGAs sum to their state and states sum
 * to the national total (~220m). Breakdowns (male/female, under-5, women
 * 15–49, 60+) are computed per ward and summed bottom-up, so they are also
 * consistent at every level. The age pyramid (state + national) is built so
 * that its 0–4 group equals pop_u5, its 60+ groups sum to pop_60p and its
 * male rows sum to pop_male.
 */

export const POPULATION_YEAR = 2023;
export const AGE_GROUPS = [
  "0-4", "5-9", "10-14", "15-19", "20-24", "25-29", "30-34", "35-39",
  "40-44", "45-49", "50-54", "55-59", "60-64", "65-69", "70-74", "75-79",
  "80+",
] as const;
export type AgeGroup = (typeof AGE_GROUPS)[number];

export interface PopCounts {
  total: number;
  male: number;
  female: number;
  u5: number;
  w1549: number;
  p60: number;
}

export interface AgeSexRow {
  ageGroup: AgeGroup;
  total: number;
  male: number;
  female: number;
}

export interface PopulationModel {
  nationalTotal: number;
  /** keyed by geo code (NG, zone codes, state, LGA and ward codes). */
  counts: Map<string, PopCounts>;
  /** state codes + 'NG' → age pyramid rows. */
  ageSex: Map<string, AgeSexRow[]>;
}

/** Latent "urbanisation / demographic transition" score per zone (synthetic). */
const ZONE_TRANSITION: Record<string, number> = {
  "NG-Z-SW": 0.75,
  "NG-Z-SE": 0.7,
  "NG-Z-SS": 0.65,
  "NG-Z-NC": 0.5,
  "NG-Z-NE": 0.25,
  "NG-Z-NW": 0.2,
};

/** Synthetic demographic-transition score in [0.05, 0.95] for a state. */
export function stateTransition(stateCode: string, zone: string): number {
  const boost = stateCode === "NG-LA" || stateCode === "NG-FC" ? 0.12 : 0;
  return clamp(
    (ZONE_TRANSITION[zone] ?? 0.5) + boost + 0.1 * centred(`transition:${stateCode}`),
    0.05,
    0.95,
  );
}

/** Synthetic national total for 2023 (~220m, deterministic). */
export function nationalTotal(seed = "poplens-demo"): number {
  return 220_000_000 + Math.round((hash01(`national-total:${seed}`) - 0.5) * 4_000_000);
}

function stateWeight(s: StateNode): number {
  const big = s.code === "NG-KN" || s.code === "NG-LA" ? 1.6 : 1;
  return s.lgas.length * (0.65 + 0.7 * hash01(`state-weight:${s.code}`)) * big;
}

export function buildPopulationModel(
  states: StateNode[],
  seed = "poplens-demo",
): PopulationModel {
  const total = nationalTotal(seed);
  const counts = new Map<string, PopCounts>();
  const ageSex = new Map<string, AgeSexRow[]>();
  const stateTotals = allocateInteger(total, states.map(stateWeight));

  const add = (into: PopCounts, c: PopCounts) => {
    into.total += c.total;
    into.male += c.male;
    into.female += c.female;
    into.u5 += c.u5;
    into.w1549 += c.w1549;
    into.p60 += c.p60;
  };
  const zero = (): PopCounts => ({ total: 0, male: 0, female: 0, u5: 0, w1549: 0, p60: 0 });

  const nation = zero();
  const zones = new Map<string, PopCounts>();

  states.forEach((s, si) => {
    const t = stateTransition(s.code, s.zone);
    // Shares move with the transition score: younger, more children in the north.
    const u5Share = 0.2 - 0.05 * t;
    const p60Share = 0.035 + 0.025 * t;
    const w1549Share = 0.215 + 0.025 * t;
    const maleShare = 0.503 - 0.006 * t;

    const stateCounts = zero();
    const lgaTotals = allocateInteger(
      stateTotals[si],
      s.lgas.map((l) => 0.4 + 1.2 * hash01(`lga-weight:${l.code}`)),
    );
    s.lgas.forEach((l, li) => {
      const lgaCounts = zero();
      const wardTotals = allocateInteger(
        lgaTotals[li],
        l.wards.map((w) => 0.5 + hash01(`ward-weight:${w.code}`)),
      );
      l.wards.forEach((w, wi) => {
        const pop = wardTotals[wi];
        const male = Math.round(pop * (maleShare + 0.004 * centred(`male:${w.code}`)));
        const c: PopCounts = {
          total: pop,
          male,
          female: pop - male,
          u5: Math.round(pop * u5Share * (1 + 0.05 * centred(`u5:${w.code}`))),
          w1549: Math.round(pop * w1549Share * (1 + 0.03 * centred(`w:${w.code}`))),
          p60: Math.round(pop * p60Share * (1 + 0.08 * centred(`p60:${w.code}`))),
        };
        counts.set(w.code, c);
        add(lgaCounts, c);
      });
      counts.set(l.code, lgaCounts);
      add(stateCounts, lgaCounts);
    });
    counts.set(s.code, stateCounts);
    ageSex.set(s.code, buildAgeSex(s.code, stateCounts, t));
    add(nation, stateCounts);
    if (!zones.has(s.zone)) zones.set(s.zone, zero());
    add(zones.get(s.zone)!, stateCounts);
  });

  counts.set("NG", nation);
  for (const [z, c] of zones) counts.set(z, c);

  // National pyramid = sum of state pyramids (exactly consistent).
  const natRows: AgeSexRow[] = AGE_GROUPS.map((g) => ({ ageGroup: g, total: 0, male: 0, female: 0 }));
  for (const s of states) {
    ageSex.get(s.code)!.forEach((r, i) => {
      natRows[i].total += r.total;
      natRows[i].male += r.male;
      natRows[i].female += r.female;
    });
  }
  ageSex.set("NG", natRows);

  return { nationalTotal: total, counts, ageSex };
}

/**
 * Age-sex pyramid for one state, consistent with its counts:
 * 0–4 = u5, 60+ groups sum to p60, all groups sum to total, males sum to male.
 */
export function buildAgeSex(code: string, c: PopCounts, transition: number): AgeSexRow[] {
  // Decay per 5-year group: steeper (younger population) for low transition.
  const k = 0.17 - 0.07 * transition;
  const mid = AGE_GROUPS.slice(1, 12); // 5-9 … 55-59
  const old = AGE_GROUPS.slice(12); // 60-64 … 80+
  const midW = mid.map((_, i) => Math.exp(-k * (i + 1)) * (1 + 0.03 * centred(`age:${code}:${i}`)));
  const oldW = old.map((_, i) => Math.exp(-0.45 * i));
  const midTotals = allocateInteger(c.total - c.u5 - c.p60, midW);
  const oldTotals = allocateInteger(c.p60, oldW);
  const totals = [c.u5, ...midTotals, ...oldTotals];
  // Male share drifts down with age (women live longer).
  const maleW = totals.map((t, i) => Math.max(1, t) * (0.51 - 0.004 * i));
  const males = allocateInteger(c.male, maleW).map((m, i) => Math.min(m, totals[i]));
  // Re-balance any rounding clipped by the min() above onto the largest group.
  const deficit = c.male - males.reduce((a, b) => a + b, 0);
  if (deficit !== 0) males[1] += deficit;
  return AGE_GROUPS.map((g, i) => ({
    ageGroup: g,
    total: totals[i],
    male: males[i],
    female: totals[i] - males[i],
  }));
}
