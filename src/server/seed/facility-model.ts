import type { StateNode } from "./hierarchy";
import type { PopulationModel } from "./population-model";
import { hash01, intBetween } from "./prng";

/**
 * SYNTHETIC health facility list (~3,000 rows). Names are generic and
 * clearly demo ("<Ward> Primary Health Centre", "<LGA> General Hospital");
 * they do not describe real facilities. Every facility is attached to a ward
 * (points are generated inside that ward's polygon by PostGIS at seed time).
 *
 * Mix per LGA: 1 general hospital (secondary, public), 2–3 PHCs (primary,
 * public), sometimes a health post and a private / faith-based / NGO clinic.
 * Per state: 1 teaching hospital (tertiary) in its most populous LGA, and a
 * federal medical centre in about half the states.
 */

export type CareLevel = "primary" | "secondary" | "tertiary";
export type Ownership = "public" | "private" | "faith_based" | "ngo" | "unknown";

export interface FacilitySpec {
  key: string;
  name: string;
  type: string;
  careLevel: CareLevel;
  ownership: Ownership;
  stateCode: string;
  lgaCode: string;
  wardCode: string;
}

function pickWard(lga: StateNode["lgas"][number], salt: string): string {
  const i = Math.floor(hash01(`fac-ward:${lga.code}:${salt}`) * lga.wards.length);
  return lga.wards[Math.min(i, lga.wards.length - 1)].code;
}

export function generateFacilities(
  states: StateNode[],
  pop: PopulationModel,
): FacilitySpec[] {
  const out: FacilitySpec[] = [];
  for (const s of states) {
    for (const l of s.lgas) {
      out.push({
        key: `gh:${l.code}`,
        name: `${l.name} General Hospital`,
        type: "General Hospital",
        careLevel: "secondary",
        ownership: "public",
        stateCode: s.code,
        lgaCode: l.code,
        wardCode: pickWard(l, "gh"),
      });
      // 2–3 PHCs in distinct wards.
      const nPhc = intBetween(`phc-n:${l.code}`, 2, 3);
      const wardsShuffled = [...l.wards].sort(
        (a, b) => hash01(`phc:${a.code}`) - hash01(`phc:${b.code}`),
      );
      for (const w of wardsShuffled.slice(0, nPhc)) {
        out.push({
          key: `phc:${w.code}`,
          name: `${w.name} Primary Health Centre`,
          type: "Primary Health Centre",
          careLevel: "primary",
          ownership: "public",
          stateCode: s.code,
          lgaCode: l.code,
          wardCode: w.code,
        });
      }
      if (hash01(`hp:${l.code}`) < 0.3) {
        const w = wardsShuffled[wardsShuffled.length - 1];
        out.push({
          key: `hp:${w.code}`,
          name: `${w.name} Health Post`,
          type: "Health Post",
          careLevel: "primary",
          ownership: "public",
          stateCode: s.code,
          lgaCode: l.code,
          wardCode: w.code,
        });
      }
      const r = hash01(`clinic:${l.code}`);
      if (r < 0.45) {
        const ownership: Ownership = r < 0.27 ? "private" : r < 0.38 ? "faith_based" : "ngo";
        const label =
          ownership === "private"
            ? "Private Clinic"
            : ownership === "faith_based"
              ? "Mission Hospital"
              : "Community Clinic";
        out.push({
          key: `clinic:${l.code}`,
          name: `${l.name} ${label}`,
          type: ownership === "faith_based" ? "Mission Hospital" : "Clinic",
          careLevel: ownership === "faith_based" ? "secondary" : "primary",
          ownership,
          stateCode: s.code,
          lgaCode: l.code,
          wardCode: pickWard(l, "clinic"),
        });
      }
    }
    // Tertiary care in the most populous LGA of the state.
    const biggest = [...s.lgas].sort(
      (a, b) => (pop.counts.get(b.code)?.total ?? 0) - (pop.counts.get(a.code)?.total ?? 0),
    )[0];
    out.push({
      key: `th:${s.code}`,
      name: `${s.name} Teaching Hospital`,
      type: "Teaching Hospital",
      careLevel: "tertiary",
      ownership: "public",
      stateCode: s.code,
      lgaCode: biggest.code,
      wardCode: pickWard(biggest, "th"),
    });
    if (hash01(`fmc:${s.code}`) < 0.5) {
      const second = [...s.lgas].sort(
        (a, b) => hash01(`fmc-lga:${a.code}`) - hash01(`fmc-lga:${b.code}`),
      )[0];
      out.push({
        key: `fmc:${s.code}`,
        name: `Federal Medical Centre, ${second.name}`,
        type: "Federal Medical Centre",
        careLevel: "tertiary",
        ownership: "public",
        stateCode: s.code,
        lgaCode: second.code,
        wardCode: pickWard(second, "fmc"),
      });
    }
  }
  return out;
}
