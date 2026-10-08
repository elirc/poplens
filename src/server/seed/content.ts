import { db, schema } from "@/db";

/**
 * Two demo stories and six insight cards, published and authored by the
 * demo content editor. Stories embed live charts with the shortcode contract
 * documented in src/db/schema/content.ts:
 *   {{chart type="trend|bar|top5" indicator="<code>" places="NG,NG-KN" year="2018"}}
 * Cards use the spec shape { kind, indicatorCode, placeCodes?, year?, level? }.
 * All copy says plainly that the figures are SYNTHETIC demo data.
 */

const DEMO_DISCLAIMER =
  "> **Demo data.** Every figure in this story comes from PopLens's SYNTHETIC demo dataset. The numbers are generated for demonstration and are not real statistics — do not cite them.";

export const STORY_SEEDS = [
  {
    slug: "immunisation-gap-demo",
    title: "The immunisation gap between states (synthetic demo)",
    summary:
      "A walk through childhood immunisation coverage across states using the synthetic demo dataset — how to read survey values, confidence intervals and LGA maps in PopLens.",
    coverIndicator: "full_immunisation",
    body: `${DEMO_DISCLAIMER}

Full childhood immunisation is the share of children aged 12–23 months who received all basic vaccinations. In PopLens it comes from household surveys, so it is available for survey years and usually only down to state level.

## How coverage changed between survey rounds

The chart below compares the national figure with two states across the 2013 and 2018 survey rounds. Survey years are marked as points; hover a point to see its confidence interval.

{{chart type="trend" indicator="full_immunisation" places="NG,NG-KN,NG-LA"}}

## Where are the most zero-dose children?

Children who received no vaccine dose at all are the hardest to reach. These are the five states with the highest share in the 2018 round of the demo data.

{{chart type="top5" indicator="zero_dose" year="2018"}}

## Comparing four states

{{chart type="bar" indicator="full_immunisation" places="NG-SO,NG-KN,NG-EN,NG-LA" year="2018"}}

## Reading the numbers carefully

- Survey values carry confidence intervals — two states whose intervals overlap may not really differ.
- LGA values for 2023 in the demo are *modelled* small-area estimates; real LGA figures would need a source that publishes them.
- Missing values are shown as "No data", never as zero.
`,
  },
  {
    slug: "people-per-facility-demo",
    title: "How many people does each health facility serve? (synthetic demo)",
    summary:
      "Using the synthetic facility list and population estimates to explore facilities per 100,000 people and people per facility by state.",
    coverIndicator: "people_per_facility",
    body: `${DEMO_DISCLAIMER}

PopLens derives two access measures from the facility list and the population estimates: **health facilities per 100,000 people** and **people per health facility**. Both count facilities of every level of care, so a health post and a teaching hospital count the same — read them as a rough guide to coverage, not capacity.

## States where each facility serves the most people

{{chart type="top5" indicator="people_per_facility" year="2023"}}

## Facilities per 100,000 people in selected states

{{chart type="bar" indicator="facilities_per_100k" places="NG-KN,NG-LA,NG-BO,NG-ED,NG-FC" year="2023"}}

## Population behind the numbers

Population is a modelled estimate — Nigeria's last census was in 2006 — so every "per person" figure inherits that uncertainty.

{{chart type="bar" indicator="pop_total" places="NG-KN,NG-LA,NG-BO,NG-ED,NG-FC" year="2023"}}

Try the area analysis tool to count the estimated population and facilities within a radius of any point.
`,
  },
] as const;

export const CARD_SEEDS = [
  {
    slug: "top5-u5mr-2018",
    title: "Highest under-5 mortality (2018)",
    caption:
      "Five states with the highest under-5 mortality rate in the 2018 round. SYNTHETIC demo data — not real statistics.",
    spec: { kind: "top5", indicatorCode: "u5mr", year: 2018, level: "state" },
  },
  {
    slug: "top5-full-immunisation-2018",
    title: "Top states for full immunisation (2018)",
    caption:
      "Five states with the highest full childhood immunisation coverage in the 2018 round. SYNTHETIC demo data — not real statistics.",
    spec: { kind: "top5", indicatorCode: "full_immunisation", year: 2018, level: "state" },
  },
  {
    slug: "kano-anc4-vs-national",
    title: "Kano vs Nigeria: four or more antenatal visits",
    caption:
      "Kano's share of women with four or more antenatal visits against the national figure, 2018. SYNTHETIC demo data — not real statistics.",
    spec: { kind: "vs_national", indicatorCode: "anc4", placeCodes: ["NG-KN"], year: 2018 },
  },
  {
    slug: "lagos-water-vs-national",
    title: "Lagos vs Nigeria: improved drinking water",
    caption:
      "Share of households in Lagos using an improved drinking water source, against the national figure, 2018. SYNTHETIC demo data — not real statistics.",
    spec: { kind: "vs_national", indicatorCode: "improved_water", placeCodes: ["NG-LA"], year: 2018 },
  },
  {
    slug: "nigeria-population-2023",
    title: "Nigeria's estimated population (2023)",
    caption:
      "Modelled total population estimate for 2023 — Nigeria's last census was in 2006. SYNTHETIC demo data — not a real estimate.",
    spec: { kind: "single_stat", indicatorCode: "pop_total", placeCodes: ["NG"], year: 2023 },
  },
  {
    slug: "nigeria-people-per-facility-2023",
    title: "People per health facility in Nigeria (2023)",
    caption:
      "Estimated residents for each health facility nationally, derived from the facility list and population estimates. SYNTHETIC demo data — not real statistics.",
    spec: { kind: "single_stat", indicatorCode: "people_per_facility", placeCodes: ["NG"], year: 2023 },
  },
] as const;

export async function seedContent(authorId: string): Promise<{ stories: number; cards: number }> {
  const now = new Date();
  for (const s of STORY_SEEDS) {
    const values = {
      slug: s.slug,
      title: s.title,
      summary: s.summary,
      body: s.body,
      coverIndicator: s.coverIndicator,
      status: "published" as const,
      authorId,
      publishedAt: now,
      updatedAt: now,
    };
    await db
      .insert(schema.stories)
      .values(values)
      .onConflictDoUpdate({ target: schema.stories.slug, set: values });
  }
  for (const c of CARD_SEEDS) {
    const values = {
      slug: c.slug,
      title: c.title,
      caption: c.caption,
      spec: c.spec,
      status: "published" as const,
      authorId,
      publishedAt: now,
    };
    await db
      .insert(schema.insightCards)
      .values(values)
      .onConflictDoUpdate({ target: schema.insightCards.slug, set: values });
  }
  return { stories: STORY_SEEDS.length, cards: CARD_SEEDS.length };
}
