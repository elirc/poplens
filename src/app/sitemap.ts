import type { MetadataRoute } from "next";
import { asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { env } from "@/env";

/**
 * Sitemap: home, static public pages, every indicator and every place.
 * States, zones, the nation and all LGAs are always listed; wards are capped
 * to the first 2,000 by code to keep the sitemap a sensible size.
 * Regenerated hourly (ISR); falls back to static pages if the DB is down.
 */
export const revalidate = 3600;

const WARD_CAP = 2000;

const STATIC_PATHS: Array<{ path: string; priority: number; freq: "daily" | "weekly" | "monthly" }> = [
  { path: "/", priority: 1, freq: "daily" },
  { path: "/explore", priority: 0.9, freq: "weekly" },
  { path: "/indicators", priority: 0.8, freq: "weekly" },
  { path: "/rankings", priority: 0.7, freq: "weekly" },
  { path: "/compare", priority: 0.6, freq: "weekly" },
  { path: "/trends", priority: 0.6, freq: "weekly" },
  { path: "/relationships", priority: 0.5, freq: "weekly" },
  { path: "/facilities", priority: 0.6, freq: "weekly" },
  { path: "/outbreaks", priority: 0.6, freq: "weekly" },
  { path: "/stories", priority: 0.6, freq: "weekly" },
  { path: "/updates", priority: 0.5, freq: "daily" },
  { path: "/about-data", priority: 0.5, freq: "monthly" },
  { path: "/pricing", priority: 0.4, freq: "monthly" },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.APP_URL.replace(/\/+$/, "");
  const now = new Date();
  const out: MetadataRoute.Sitemap = STATIC_PATHS.map((p) => ({
    url: `${base}${p.path}`,
    lastModified: now,
    changeFrequency: p.freq,
    priority: p.priority,
  }));

  try {
    const [indicators, places, wards] = await Promise.all([
      db
        .select({ code: schema.indicators.code })
        .from(schema.indicators)
        .orderBy(asc(schema.indicators.code)),
      db
        .select({ code: schema.geoUnits.code, level: schema.geoUnits.level })
        .from(schema.geoUnits)
        .where(inArray(schema.geoUnits.level, ["nation", "zone", "state", "lga"]))
        .orderBy(asc(schema.geoUnits.code)),
      db
        .select({ code: schema.geoUnits.code })
        .from(schema.geoUnits)
        .where(eq(schema.geoUnits.level, "ward"))
        .orderBy(asc(schema.geoUnits.code))
        .limit(WARD_CAP),
    ]);

    for (const i of indicators) {
      out.push({
        url: `${base}/indicators/${encodeURIComponent(i.code)}`,
        changeFrequency: "monthly",
        priority: 0.6,
      });
    }
    for (const p of places) {
      out.push({
        url: `${base}/places/${encodeURIComponent(p.code)}`,
        changeFrequency: "monthly",
        priority: p.level === "lga" ? 0.6 : 0.7,
      });
    }
    for (const w of wards) {
      out.push({
        url: `${base}/places/${encodeURIComponent(w.code)}`,
        changeFrequency: "monthly",
        priority: 0.4,
      });
    }
  } catch (err) {
    console.error("sitemap: database unavailable, static pages only", err);
  }
  return out;
}
