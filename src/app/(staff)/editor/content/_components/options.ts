import "server-only";
import { listIndicators } from "@/server/indicators/queries";
import { getGeoUnitByCode, listGeoUnits } from "@/server/geo/queries";
import type { EditorIndicator, EditorPlace } from "./story-editor";

/** Picker options for the content editor: all indicators; Nigeria + states. */
export async function editorOptions(): Promise<{ indicators: EditorIndicator[]; places: EditorPlace[] }> {
  const [inds, ng, states] = await Promise.all([listIndicators(), getGeoUnitByCode("NG"), listGeoUnits("state")]);
  return {
    indicators: inds.map((i) => ({ code: i.code, name: i.name, category: i.category })),
    places: [...(ng ? [ng] : []), ...states].map((u) => ({ code: u.code, name: u.name, level: u.level })),
  };
}
