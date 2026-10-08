import { sql } from "drizzle-orm";
import { db, schema } from "@/db";

/**
 * Data sources and their licences. `allowsRedistribution` gates downloads and
 * API access for every dataset from the source (spec: "Downloads and API
 * access are offered only for datasets whose licence allows redistribution").
 * Licence facts are as published by each source; check them again before any
 * real deployment. Placeholders in citationTemplate: {title} {year} {url}
 * {accessed}.
 */
export interface SourceSeed {
  key: string;
  publisher: string;
  title: string;
  url: string | null;
  licence: string;
  licenceUrl: string | null;
  allowsRedistribution: boolean;
  citationTemplate: string;
  notes: string;
}

export const SOURCE_SEEDS: SourceSeed[] = [
  {
    key: "grid3",
    publisher: "GRID3 (Geo-Referenced Infrastructure and Demographic Data for Development)",
    title: "GRID3 Nigeria boundaries, settlements, health facilities and gridded population",
    url: "https://grid3.org/",
    licence: "CC BY 4.0",
    licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
    allowsRedistribution: true,
    citationTemplate:
      "GRID3 Nigeria. {title}, {year}. {url}. Licensed under CC BY 4.0. Accessed {accessed} via PopLens.",
    notes:
      "Operational ward boundaries and facility lists are versioned per state; the version used is recorded on each geo unit / facility.",
  },
  {
    key: "dhs",
    publisher: "The DHS Program (ICF / USAID)",
    title: "DHS Program indicator data API",
    url: "https://api.dhsprogram.com/",
    licence: "DHS Program terms of use (registration required for microdata)",
    licenceUrl: "https://dhsprogram.com/data/Terms-of-Use.cfm",
    allowsRedistribution: false,
    citationTemplate:
      "The DHS Program. {title}, {year}. ICF, Rockville, Maryland. {url}. Accessed {accessed} via PopLens.",
    notes:
      "Viewable in PopLens with attribution; bulk download/API redistribution is not offered under the DHS terms.",
  },
  {
    key: "who-gho",
    publisher: "World Health Organization",
    title: "WHO Global Health Observatory (GHO) OData API",
    url: "https://www.who.int/data/gho",
    licence: "CC BY-NC-SA 3.0 IGO",
    licenceUrl: "https://creativecommons.org/licenses/by-nc-sa/3.0/igo/",
    allowsRedistribution: false,
    citationTemplate:
      "World Health Organization. Global Health Observatory: {title}, {year}. {url}. Accessed {accessed} via PopLens.",
    notes:
      "Non-commercial licence: PopLens paid downloads/API would be commercial use, so redistribution is disabled.",
  },
  {
    key: "worldbank",
    publisher: "The World Bank",
    title: "World Bank World Development Indicators API",
    url: "https://data.worldbank.org/",
    licence: "CC BY 4.0",
    licenceUrl: "https://datacatalog.worldbank.org/public-licenses",
    allowsRedistribution: true,
    citationTemplate:
      "The World Bank. World Development Indicators: {title}, {year}. {url}. CC BY 4.0. Accessed {accessed} via PopLens.",
    notes: "Most WDI series are CC BY 4.0; a few third-party series carry their own terms.",
  },
  {
    key: "nbs",
    publisher: "National Bureau of Statistics (Nigeria)",
    title: "NBS statistical reports and MICS",
    url: "https://nigerianstat.gov.ng/",
    licence: "NBS terms of use (attribution; redistribution not expressly licensed)",
    licenceUrl: null,
    allowsRedistribution: false,
    citationTemplate:
      "National Bureau of Statistics. {title}, {year}. Abuja, Nigeria. {url}. Accessed {accessed} via PopLens.",
    notes:
      "Files uploaded by data editors. Redistribution off until a licence allowing it is confirmed for the specific publication.",
  },
  {
    key: "npc",
    publisher: "National Population Commission (Nigeria)",
    title: "NPC census and population publications",
    url: "https://nationalpopulation.gov.ng/",
    licence: "NPC terms of use (attribution; redistribution not expressly licensed)",
    licenceUrl: null,
    allowsRedistribution: false,
    citationTemplate:
      "National Population Commission. {title}, {year}. Abuja, Nigeria. {url}. Accessed {accessed} via PopLens.",
    notes: "Nigeria's last census was 2006; later figures are projections/estimates.",
  },
  {
    key: "ncdc",
    publisher: "Nigeria Centre for Disease Control and Prevention",
    title: "NCDC situation reports (weekly epidemiological reports)",
    url: "https://ncdc.gov.ng/",
    licence: "NCDC terms of use (attribution; redistribution not expressly licensed)",
    licenceUrl: null,
    allowsRedistribution: false,
    citationTemplate:
      "Nigeria Centre for Disease Control and Prevention. {title}, {year}. {url}. Accessed {accessed} via PopLens.",
    notes:
      "Outbreak figures are published as PDF reports and entered by staff via the upload template — nothing is scraped.",
  },
  {
    key: "geoboundaries",
    publisher: "geoBoundaries (William & Mary geoLab)",
    title: "geoBoundaries gbOpen — Nigeria ADM0/ADM1/ADM2 (source: GRID3)",
    url: "https://www.geoboundaries.org/",
    licence: "CC BY 4.0",
    licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
    allowsRedistribution: true,
    citationTemplate:
      "Runfola, D. et al. (2020) geoBoundaries: A global database of political administrative boundaries. PLoS ONE 15(4): e0231866. Nigeria boundaries sourced from GRID3, {year}. {url}. CC BY 4.0.",
    notes:
      "Simplified state and LGA boundaries for the web. Ward shapes are NOT included (synthetic placeholders until GRID3 wards are loaded).",
  },
  {
    key: "synthetic",
    publisher: "PopLens (demo data)",
    title: "PopLens synthetic demo dataset",
    url: null,
    licence: "CC0 1.0 (synthetic, generated)",
    licenceUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    allowsRedistribution: true,
    citationTemplate:
      "PopLens synthetic demo data ({title}, {year}). SYNTHETIC — not real statistics. Do not cite as fact.",
    notes:
      "Generated deterministically by scripts/seed.ts so the portal can be demonstrated. Every value is SYNTHETIC and the site shows a demo banner while it is published.",
  },
];

/** Upsert all sources by key; returns key → id. */
export async function seedSources(): Promise<Map<string, number>> {
  for (const s of SOURCE_SEEDS) {
    await db
      .insert(schema.sources)
      .values(s)
      .onConflictDoUpdate({
        target: schema.sources.key,
        set: {
          publisher: s.publisher,
          title: s.title,
          url: s.url,
          licence: s.licence,
          licenceUrl: s.licenceUrl,
          allowsRedistribution: s.allowsRedistribution,
          citationTemplate: s.citationTemplate,
          notes: s.notes,
        },
      });
  }
  const rows = await db.execute(sql`SELECT id, key FROM sources`);
  return new Map((rows.rows as Array<{ id: number; key: string }>).map((r) => [r.key, r.id]));
}
