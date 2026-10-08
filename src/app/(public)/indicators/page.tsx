import type { Metadata } from "next";
import { listIndicators } from "@/server/indicators/queries";
import { CatalogueFilter } from "@/components/indicators/catalogue-filter";
import { CATEGORY_ORDER } from "@/components/indicators/labels";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "Indicators",
  description:
    "Every population and health indicator in PopLens: definitions, units, methods, and the levels and years each source covers.",
};

export default async function IndicatorsIndexPage() {
  const indicators = await listIndicators();
  const known = new Set<string>(CATEGORY_ORDER);
  const categories = [
    ...CATEGORY_ORDER,
    ...[...new Set(indicators.map((i) => i.category))].filter((c) => !known.has(c)),
  ];
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Indicators</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          The catalogue of population and health indicators PopLens shows. Each page gives the
          definition, method notes and caveats, which levels and years are available, and the
          sources behind the figures.
        </p>
      </header>
      {indicators.length === 0 ? (
        <p className="text-sm text-muted-foreground">The indicator catalogue has not been loaded yet.</p>
      ) : (
        <CatalogueFilter
          categories={categories}
          items={indicators.map((i) => ({
            code: i.code,
            name: i.name,
            category: i.category,
            unit: i.unit,
            definition: i.definition,
          }))}
        />
      )}
    </div>
  );
}
