/**
 * Server-side parsing of download requests (pure; unit-tested). Mirrors
 * downloadHref() in src/components/content/download-url.ts.
 */

import { z } from "zod";
import type { DownloadFormat, DownloadSpec } from "@/components/content/types";
import type { ParseResult } from "@/server/content/shortcode";

const indicator = z.string().trim().regex(/^[A-Za-z0-9_.-]{1,64}$/, "invalid indicator code");
const placeCode = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9-]{2,40}$/, "invalid place code")
  .transform((s) => s.toUpperCase());
const year = z.coerce.number().int().min(1900).max(2100);

const tableSpec = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("level"),
    indicator,
    level: z.enum(["state", "lga", "ward"]),
    year: year.optional(),
    parent: placeCode.optional(),
  }),
  z.object({
    kind: z.literal("places"),
    indicator,
    places: z
      .string()
      .transform((s) => s.split(",").map((p) => p.trim()).filter(Boolean))
      .pipe(z.array(placeCode).min(1, "at least one place").max(12, "at most 12 places")),
    year: year.optional(),
  }),
  z.object({ kind: z.literal("place"), place: placeCode }),
]);

export function parseFormat(v: string | null | undefined): DownloadFormat | null {
  const f = (v ?? "csv").toLowerCase();
  return f === "csv" || f === "xlsx" ? f : null;
}

export function parseTableSpec(sp: URLSearchParams): ParseResult<DownloadSpec> {
  const raw: Record<string, string> = {};
  for (const [k, v] of sp.entries()) if (v !== "" && k !== "format") raw[k] = v;
  const r = tableSpec.safeParse(raw);
  if (!r.success) {
    return {
      ok: false,
      message: r.error.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)).join("; "),
    };
  }
  const v = r.data;
  switch (v.kind) {
    case "level":
      return { ok: true, value: { kind: "level", indicator: v.indicator, level: v.level, year: v.year ?? null, parent: v.parent ?? null } };
    case "places":
      return { ok: true, value: { kind: "places", indicator: v.indicator, places: [...new Set(v.places)], year: v.year ?? null } };
    case "place":
      return { ok: true, value: { kind: "place", place: v.place } };
  }
}

export function parseDatasetId(raw: string): number | null {
  if (!/^\d{1,10}$/.test(raw)) return null;
  const n = Number(raw);
  return n > 0 && n <= 2_147_483_647 ? n : null;
}
