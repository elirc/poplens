import type { GeoRef } from "../types";
import { NIGERIA_STATES } from "@/server/geo/nigeria-states";

/**
 * Deterministic pseudo-random synthetic values per state, seeded by a string,
 * so mock connector runs are stable across invocations (import diffs stay
 * meaningful). Shared by all mock connectors. SYNTHETIC ONLY.
 */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

export function syntheticStateValues(
  seed: string,
  base: number,
  spread: number,
): Array<{ geo: GeoRef; value: number }> {
  const out: Array<{ geo: GeoRef; value: number }> = [];
  for (const st of NIGERIA_STATES) {
    const r = hash(`${seed}:${st.code}`);
    out.push({
      geo: { kind: "code", value: st.code, level: "state" },
      value: Math.round((base + (r - 0.5) * 2 * spread) * 10) / 10,
    });
  }
  // National value: midpoint-ish, deterministic.
  const r = hash(`${seed}:NG`);
  out.push({
    geo: { kind: "code", value: "NG", level: "nation" },
    value: Math.round((base + (r - 0.5) * spread) * 10) / 10,
  });
  return out;
}

export function syntheticNationalSeries(
  seed: string,
  years: number[],
  start: number,
  trendPerYear: number,
  noise: number,
): Array<{ year: number; value: number }> {
  return years.map((year, i) => {
    const r = hash(`${seed}:${year}`);
    return {
      year,
      value:
        Math.round((start + trendPerYear * i + (r - 0.5) * 2 * noise) * 10) / 10,
    };
  });
}
