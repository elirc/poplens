import { INDICATOR_CATALOGUE } from "@/server/indicators/catalogue-data";
import type { StateNode } from "./hierarchy";
import { stateTransition, type PopulationModel } from "./population-model";
import { centred, clamp, hash01, round } from "./prng";

/**
 * SYNTHETIC survey-style values (health outcomes, services, living
 * conditions, demographic structure). NOT real statistics — every row is
 * written with the "SYNTHETIC demo value" note by the seed.
 *
 * Each state has a latent synthetic "development" score (zone base + noise,
 * see stateTransition). An indicator's value sits between its `bad` and
 * `good` ends according to that score (weighted by `devWeight`, the rest is
 * indicator-specific noise) plus a small improvement between survey rounds.
 * National values are population-weighted means of the state values, so the
 * national figure is always consistent with the states.
 */

export const SURVEY_YEARS = [2013, 2018] as const;
export const SMALL_AREA_YEAR = 2023;

export interface SurveySpec {
  code: string;
  bad: number;
  good: number;
  /** 0..1 — how strongly the value follows the latent development score. */
  devWeight: number;
  /** 'state' → state + national values; 'national' → national only. */
  scope: "state" | "national";
  years: readonly number[];
  /** Survey-style confidence intervals. */
  ci: boolean;
}

const S = (
  code: string,
  bad: number,
  good: number,
  devWeight = 0.8,
  extra: Partial<SurveySpec> = {},
): SurveySpec => ({
  code,
  bad,
  good,
  devWeight,
  scope: "state",
  years: SURVEY_YEARS,
  ci: true,
  ...extra,
});

const STRUCTURE = { years: [2023], ci: false } as const;

export const SURVEY_SPECS: SurveySpec[] = [
  // Population structure (2023, state + national, no CI)
  S("urban_share", 15, 90, 0.9, STRUCTURE),
  S("household_size", 6.5, 4.0, 0.8, STRUCTURE),
  S("median_age", 15.5, 21, 0.85, STRUCTURE),
  S("dependency_ratio", 105, 68, 0.85, STRUCTURE),
  S("pop_growth_rate", 3.3, 2.1, 0.7, STRUCTURE),
  S("tfr", 7.4, 3.8, 0.85),
  // Health outcomes
  S("u5mr", 250, 55, 0.8),
  S("imr", 110, 40, 0.8),
  S("nmr", 55, 22, 0.7),
  S("mmr", 1300, 450, 1, { scope: "national" }),
  S("life_expectancy", 50, 58, 1, { scope: "national", years: [2013, 2018, 2023], ci: false }),
  S("stunting", 62, 15, 0.85),
  S("wasting", 16, 3, 0.6),
  S("underweight", 40, 8, 0.8),
  S("overweight_children", 6, 1, 0.2),
  S("anaemia_children", 85, 55, 0.6),
  S("anaemia_women", 70, 45, 0.5),
  S("malaria_prev_children", 45, 3, 0.7),
  S("hiv_prev", 5.5, 0.4, 0.15),
  S("adolescent_birth_rate", 200, 30, 0.85),
  S("low_birth_weight", 12, 5, 0.4),
  // Health services
  S("full_immunisation", 3, 75, 0.85),
  S("zero_dose", 70, 2, 0.85),
  S("measles_vaccination", 15, 90, 0.85),
  S("dpt3", 8, 90, 0.85),
  S("anc4", 10, 90, 0.85),
  S("sba", 8, 95, 0.9),
  S("facility_delivery", 5, 90, 0.9),
  S("postnatal_care", 5, 70, 0.7),
  S("mcpr", 1, 25, 0.7),
  S("unmet_need_fp", 25, 12, 0.5),
  S("itn_use", 20, 70, 0.4),
  S("health_insurance", 0.5, 8, 0.7),
  S("care_seeking_ari", 40, 85, 0.6),
  // Living conditions
  S("improved_water", 30, 95, 0.75),
  S("improved_sanitation", 10, 75, 0.8),
  S("open_defecation", 60, 2, 0.7),
  S("handwashing_facility", 10, 55, 0.6),
  S("clean_cooking_fuel", 1, 40, 0.8),
  S("female_literacy", 5, 95, 0.9),
  S("mpi", 0.6, 0.05, 0.9),
  S("electricity_access", 15, 98, 0.85),
  S("primary_attendance", 35, 90, 0.85),
  S("secondary_attendance", 20, 85, 0.85),
];

/** Indicators that also get synthetic LGA values for 2023 (LGA maps). */
export const LGA_INDICATORS = [
  "full_immunisation",
  "zero_dose",
  "anc4",
  "sba",
  "stunting",
  "malaria_prev_children",
  "improved_water",
  "improved_sanitation",
  "electricity_access",
  "female_literacy",
] as const;

export interface SurveyRow {
  code: string;
  geoCode: string;
  year: number;
  periodLabel: string;
  value: number;
  lower: number | null;
  upper: number | null;
}

const META = new Map(INDICATOR_CATALOGUE.map((e) => [e.code, e]));

function bounds(code: string): [number, number] {
  const m = META.get(code);
  if (!m) throw new Error(`Unknown indicator ${code}`);
  if (m.valueType === "percent") return [0, 100];
  if (code === "mpi") return [0, 1];
  return [0, Number.POSITIVE_INFINITY];
}

function decimals(code: string): number {
  return META.get(code)?.decimals ?? 1;
}

function labelFor(year: number, ci: boolean): string {
  if (year === SMALL_AREA_YEAR && !ci) return `${year} modelled estimate (synthetic)`;
  return ci ? `${year} survey (synthetic)` : `${year} (synthetic)`;
}

/** Position (0 good-less … 1 best) of a state for an indicator in a year. */
function position(spec: SurveySpec, stateCode: string, dev: number, year: number): number {
  const d = clamp(
    dev + 0.05 * centred(`dev:${spec.code}:${stateCode}`) + (0.035 * (year - 2013)) / 5,
    0,
    1,
  );
  const noise = hash01(`ind:${spec.code}:${stateCode}`);
  return clamp(
    spec.devWeight * d +
      (1 - spec.devWeight) * noise +
      0.02 * centred(`yr:${spec.code}:${stateCode}:${year}`),
    0,
    1,
  );
}

function valueAt(spec: SurveySpec, p: number): number {
  const [lo, hi] = bounds(spec.code);
  return clamp(spec.bad + (spec.good - spec.bad) * p, lo, hi);
}

function ciFor(
  spec: SurveySpec,
  key: string,
  value: number,
  divisor: number,
): [number, number] {
  const [lo, hi] = bounds(spec.code);
  const range = Math.abs(spec.good - spec.bad);
  const rel = 0.06 + 0.08 * hash01(`ci:${key}`);
  const hw = Math.max(range * 0.012, Math.abs(value) * rel) / divisor;
  return [clamp(value - hw, lo, hi), clamp(value + hw, lo, hi)];
}

function weightedMean(pairs: Array<[number, number]>): number {
  const w = pairs.reduce((a, [, wt]) => a + wt, 0);
  return pairs.reduce((a, [v, wt]) => a + v * wt, 0) / w;
}

export function generateSurveyRows(
  states: StateNode[],
  pop: PopulationModel,
): SurveyRow[] {
  const rows: SurveyRow[] = [];
  const dev = new Map(states.map((s) => [s.code, stateTransition(s.code, s.zone)]));
  const statePop = (code: string) => pop.counts.get(code)?.total ?? 1;

  for (const spec of SURVEY_SPECS) {
    const dp = decimals(spec.code);
    for (const year of spec.years) {
      const label = labelFor(year, spec.ci);
      const stateVals = states.map((s) => {
        const v = valueAt(spec, position(spec, s.code, dev.get(s.code)!, year));
        return { s, v };
      });
      const nat = weightedMean(stateVals.map(({ s, v }) => [v, statePop(s.code)]));
      if (spec.scope === "state") {
        for (const { s, v } of stateVals) {
          const [lower, upper] = spec.ci
            ? ciFor(spec, `${spec.code}:${s.code}:${year}`, v, 1)
            : [null, null];
          rows.push({
            code: spec.code,
            geoCode: s.code,
            year,
            periodLabel: label,
            value: round(v, dp),
            lower: lower === null ? null : round(lower, dp),
            upper: upper === null ? null : round(upper, dp),
          });
        }
      }
      const [nl, nu] = spec.ci ? ciFor(spec, `${spec.code}:NG:${year}`, nat, 3) : [null, null];
      rows.push({
        code: spec.code,
        geoCode: "NG",
        year,
        periodLabel: label,
        value: round(nat, dp),
        lower: nl === null ? null : round(nl, dp),
        upper: nu === null ? null : round(nu, dp),
      });
    }
  }

  // 2023 modelled LGA values for a subset; state and national 2023 values are
  // population-weighted means of their LGAs so every level agrees.
  for (const code of LGA_INDICATORS) {
    const spec = SURVEY_SPECS.find((s) => s.code === code)!;
    const dp = decimals(code);
    const label = `${SMALL_AREA_YEAR} modelled small-area estimate (synthetic)`;
    const natPairs: Array<[number, number]> = [];
    for (const s of states) {
      const pState = position(spec, s.code, dev.get(s.code)!, SMALL_AREA_YEAR);
      const lgaPairs: Array<[number, number]> = [];
      for (const l of s.lgas) {
        const p = clamp(pState + 0.12 * centred(`lga:${code}:${l.code}`), 0, 1);
        const v = valueAt(spec, p);
        const lp = pop.counts.get(l.code)?.total ?? 1;
        lgaPairs.push([v, lp]);
        const [lower, upper] = ciFor(spec, `${code}:${l.code}:${SMALL_AREA_YEAR}`, v, 0.6);
        rows.push({
          code,
          geoCode: l.code,
          year: SMALL_AREA_YEAR,
          periodLabel: label,
          value: round(v, dp),
          lower: round(lower, dp),
          upper: round(upper, dp),
        });
      }
      const sv = weightedMean(lgaPairs);
      natPairs.push([sv, statePop(s.code)]);
      rows.push({
        code,
        geoCode: s.code,
        year: SMALL_AREA_YEAR,
        periodLabel: label,
        value: round(sv, dp),
        lower: null,
        upper: null,
      });
    }
    rows.push({
      code,
      geoCode: "NG",
      year: SMALL_AREA_YEAR,
      periodLabel: label,
      value: round(weightedMean(natPairs), dp),
      lower: null,
      upper: null,
    });
  }
  return rows;
}
