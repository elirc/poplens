import {
  NIGERIA_STATES,
  NIGERIA_ZONES,
  type ZoneCode,
} from "@/server/geo/nigeria-states";
import { lgasForState } from "./nigeria-lgas";
import { intBetween } from "./prng";

/**
 * The full place hierarchy used by the seed: nation → 6 zones → 37 states →
 * 774 real LGAs → SYNTHETIC wards (8–12 per LGA, "<LGA> Ward N", codes
 * `<lgaCode>-W01`…). Real ward names/shapes need GRID3 operational wards —
 * see docs/DATA-LOADING.md. Pure and deterministic.
 */

export interface WardNode {
  code: string;
  name: string;
}

export interface LgaNode {
  code: string;
  name: string;
  aliases: string[];
  wards: WardNode[];
}

export interface StateNode {
  code: string;
  name: string;
  zone: ZoneCode;
  lgas: LgaNode[];
}

export const MIN_WARDS_PER_LGA = 8;
export const MAX_WARDS_PER_LGA = 12;

export function wardCountFor(lgaCode: string): number {
  return intBetween(`wards:${lgaCode}`, MIN_WARDS_PER_LGA, MAX_WARDS_PER_LGA);
}

export function wardCode(lgaCode: string, n: number): string {
  return `${lgaCode}-W${String(n).padStart(2, "0")}`;
}

export function buildHierarchy(): StateNode[] {
  return NIGERIA_STATES.map((s) => ({
    code: s.code,
    name: s.name,
    zone: s.zone,
    lgas: lgasForState(s.code).map((l) => {
      const n = wardCountFor(l.code);
      return {
        code: l.code,
        name: l.name,
        aliases: l.aliases,
        wards: Array.from({ length: n }, (_, i) => ({
          code: wardCode(l.code, i + 1),
          name: `${l.name} Ward ${i + 1}`,
        })),
      };
    }),
  }));
}

export { NIGERIA_ZONES };

/** Common alternate spellings of state names (seeded into geo_aliases). */
export const STATE_ALIASES: Record<string, string[]> = {
  "NG-FC": [
    "FCT",
    "F.C.T.",
    "Abuja",
    "FCT Abuja",
    "FCT-Abuja",
    "Abuja FCT",
    "Abuja Federal Capital Territory",
    "Federal Capital Territory",
  ],
  "NG-AK": ["Akwa-Ibom", "AkwaIbom"],
  "NG-CR": ["Cross-River", "CrossRiver"],
  "NG-NA": ["Nassarawa"],
};

export const NATION_ALIASES = [
  "Federal Republic of Nigeria",
  "the Federal Republic of Nigeria",
  "NGA",
  "Nigeria (national)",
];
