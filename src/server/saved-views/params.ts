import { z } from "zod";

/**
 * Saved-view contract (pure). A saved view stores the page kind plus the
 * page path and its query params, so "open" rebuilds the exact URL:
 *   params = { path: "/explore", query: { indicator: "u5mr", year: "2018" } }
 */

export const SAVED_VIEW_KINDS = ["map", "compare", "trends", "rankings", "relationships", "area", "place"] as const;
export type SavedViewKind = (typeof SAVED_VIEW_KINDS)[number];

export const KIND_LABELS: Record<SavedViewKind, string> = {
  map: "Map",
  compare: "Compare",
  trends: "Trends",
  rankings: "Rankings",
  relationships: "Relationships",
  area: "Area analysis",
  place: "Place profile",
};

/** Same-site absolute path only (no protocol-relative or external URLs). */
export const safePathSchema = z
  .string()
  .max(300)
  .regex(/^\/(?!\/)[A-Za-z0-9\-._~/%]*$/, "Path must be a same-site path");

export const savedViewInputSchema = z.object({
  kind: z.enum(SAVED_VIEW_KINDS),
  name: z.string().trim().min(1, "Give the view a name").max(120),
  path: safePathSchema,
  query: z
    .record(z.string().max(60), z.string().max(500))
    .refine((q) => Object.keys(q).length <= 30, "Too many parameters"),
});

export type SavedViewInput = z.infer<typeof savedViewInputSchema>;

export interface StoredParams {
  path: string;
  query: Record<string, string>;
}

/** Rebuild the link for a stored view; tolerant of malformed rows. */
export function savedViewHref(params: unknown): string {
  const p = (params ?? {}) as Partial<StoredParams>;
  const path = safePathSchema.safeParse(p.path);
  const base = path.success ? path.data : "/";
  const qs = new URLSearchParams();
  if (p.query && typeof p.query === "object") {
    for (const [k, v] of Object.entries(p.query)) if (typeof v === "string") qs.set(k, v);
  }
  const s = qs.toString();
  return s ? `${base}?${s}` : base;
}
