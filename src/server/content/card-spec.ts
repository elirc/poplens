/**
 * Insight-card spec validation (pure; unit-tested). Shape documented in
 * src/db/schema/content.ts:
 *   { kind: 'top5' | 'vs_national' | 'single_stat' | 'trend',
 *     indicatorCode, placeCodes?: string[], year?, level? }
 */

import { z } from "zod";
import { CARD_KINDS, CHART_LEVELS, type CardSpec } from "@/components/content/types";
import type { ParseResult } from "./shortcode";

const code = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9-]{2,40}$/, "Invalid place code")
  .transform((s) => s.toUpperCase());

export const cardSpecSchema = z
  .object({
    kind: z.enum(CARD_KINDS),
    indicatorCode: z.string().trim().regex(/^[A-Za-z0-9_.-]{1,64}$/, "Invalid indicator code"),
    placeCodes: z.array(code).max(1, "Cards show one place").optional(),
    year: z.coerce.number().int().min(1900).max(2100).optional(),
    level: z.enum(CHART_LEVELS).optional(),
  })
  .superRefine((s, ctx) => {
    const places = s.placeCodes ?? [];
    if (s.kind === "top5" && places.length > 0) {
      ctx.addIssue({ code: "custom", path: ["placeCodes"], message: "A top-5 card ranks a whole level — no place" });
    }
    if (s.kind === "vs_national") {
      if (places.length !== 1) {
        ctx.addIssue({ code: "custom", path: ["placeCodes"], message: "Pick the place to compare with Nigeria" });
      } else if (places[0] === "NG") {
        ctx.addIssue({ code: "custom", path: ["placeCodes"], message: "Pick a state or LGA, not Nigeria itself" });
      }
    }
    if (s.level && s.kind !== "top5") {
      ctx.addIssue({ code: "custom", path: ["level"], message: "Level only applies to top-5 cards" });
    }
  });

export function parseCardSpec(input: unknown): ParseResult<CardSpec> {
  const r = cardSpecSchema.safeParse(input);
  if (!r.success) {
    return {
      ok: false,
      message: r.error.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)).join("; "),
    };
  }
  const v = r.data;
  const spec: CardSpec = { kind: v.kind, indicatorCode: v.indicatorCode };
  if (v.placeCodes && v.placeCodes.length > 0) spec.placeCodes = v.placeCodes;
  if (v.year != null) spec.year = v.year;
  if (v.level) spec.level = v.level;
  return { ok: true, value: spec };
}

/** A sensible default title for a spec (editors can override). */
export function defaultCardTitle(
  spec: CardSpec,
  names: { indicator: string; place?: string | null; year?: number | null },
): string {
  const yr = names.year != null ? ` (${names.year})` : "";
  const place = names.place ?? "Nigeria";
  switch (spec.kind) {
    case "top5":
      return `Highest ${lowerFirst(names.indicator)}${yr}`;
    case "vs_national":
      return `${place} vs Nigeria: ${lowerFirst(names.indicator)}${yr}`;
    case "single_stat":
      return `${names.indicator} in ${place}${yr}`;
    case "trend":
      return `${names.indicator} in ${place} over time`;
  }
}

function lowerFirst(s: string): string {
  // Keep acronyms (e.g. "HIV prevalence") intact.
  return /^[A-Z][a-z]/.test(s) ? s[0]!.toLowerCase() + s.slice(1) : s;
}
