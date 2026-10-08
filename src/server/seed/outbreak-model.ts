import { NIGERIA_STATES } from "@/server/geo/nigeria-states";
import { hash01 } from "./prng";

/**
 * SYNTHETIC weekly outbreak lines (NOT real NCDC data) for 4 diseases ×
 * 37 states × epi weeks 1–40 of 2024. Sparse like real situation reports:
 * a state-week with no cases has NO row (missing ≠ zero). Seasonality and
 * "usual hotspot" states only shape the demo so charts look plausible.
 */

export const OUTBREAK_YEAR = 2024;
export const OUTBREAK_WEEKS = 40;
export type Disease = "cholera" | "lassa_fever" | "meningitis" | "measles";
export const DISEASES: Disease[] = ["cholera", "lassa_fever", "meningitis", "measles"];

interface DiseaseProfile {
  /** Peak expected weekly suspected cases in a hotspot state. */
  peak: number;
  /** Seasonal multiplier 0..1 for an epi week. */
  season: (week: number) => number;
  hotspots: string[];
  confirmRate: number;
  /** Deaths as a share of confirmed (or suspected when confirmRate is low). */
  fatality: number;
  deathsFromSuspected: boolean;
}

const bell = (centre: number, width: number) => (w: number) =>
  Math.exp(-((w - centre) ** 2) / (2 * width * width));

const PROFILES: Record<Disease, DiseaseProfile> = {
  lassa_fever: {
    peak: 45,
    season: (w) => Math.max(bell(6, 5)(w), 0.08),
    hotspots: ["NG-ED", "NG-ON", "NG-BA", "NG-TA", "NG-EB", "NG-PL", "NG-BE", "NG-KO", "NG-NA"],
    confirmRate: 0.2,
    fatality: 0.17,
    deathsFromSuspected: false,
  },
  cholera: {
    peak: 120,
    season: (w) => Math.max(bell(31, 6)(w), 0.03),
    hotspots: ["NG-BO", "NG-YO", "NG-AD", "NG-BA", "NG-KN", "NG-ZA", "NG-KT", "NG-SO", "NG-LA", "NG-BY", "NG-CR", "NG-JI", "NG-GO"],
    confirmRate: 0.05,
    fatality: 0.025,
    deathsFromSuspected: true,
  },
  meningitis: {
    peak: 60,
    season: (w) => Math.max(bell(12, 5)(w), 0.04),
    hotspots: ["NG-SO", "NG-KE", "NG-ZA", "NG-KT", "NG-JI", "NG-YO", "NG-KN", "NG-BA", "NG-GO", "NG-NI"],
    confirmRate: 0.1,
    fatality: 0.06,
    deathsFromSuspected: true,
  },
  measles: {
    peak: 80,
    season: (w) => Math.max(bell(10, 7)(w), 0.1),
    hotspots: ["NG-BO", "NG-YO", "NG-KN", "NG-KT", "NG-SO", "NG-ZA", "NG-KE", "NG-JI", "NG-BA", "NG-GO", "NG-AD", "NG-NI", "NG-KD", "NG-PL"],
    confirmRate: 0.3,
    fatality: 0.01,
    deathsFromSuspected: true,
  },
};

export interface OutbreakRow {
  disease: Disease;
  stateCode: string;
  year: number;
  week: number;
  suspected: number;
  confirmed: number;
  deaths: number;
}

export function generateOutbreakRows(): OutbreakRow[] {
  const rows: OutbreakRow[] = [];
  for (const disease of DISEASES) {
    const p = PROFILES[disease];
    for (const st of NIGERIA_STATES) {
      const hot = p.hotspots.includes(st.code);
      const affinity = hot
        ? 0.35 + 0.65 * hash01(`ob-aff:${disease}:${st.code}`)
        : 0.015 * hash01(`ob-aff:${disease}:${st.code}`);
      for (let week = 1; week <= OUTBREAK_WEEKS; week++) {
        const key = `${disease}:${st.code}:${week}`;
        const expected = p.peak * affinity * p.season(week);
        const suspected = Math.floor(expected * (0.4 + 1.2 * hash01(`ob-s:${key}`)));
        if (suspected <= 0) continue; // sparse: zero-case weeks are omitted
        const confirmed = Math.min(
          suspected,
          Math.round(suspected * p.confirmRate * (0.6 + 0.8 * hash01(`ob-c:${key}`))),
        );
        const base = p.deathsFromSuspected ? suspected : confirmed;
        const deaths = Math.min(
          base,
          Math.round(base * p.fatality * (0.4 + 1.2 * hash01(`ob-d:${key}`))),
        );
        rows.push({
          disease,
          stateCode: st.code,
          year: OUTBREAK_YEAR,
          week,
          suspected,
          confirmed,
          deaths,
        });
      }
    }
  }
  return rows;
}
