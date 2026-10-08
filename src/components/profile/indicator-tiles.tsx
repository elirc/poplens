import Link from "next/link";
import { StatTile } from "@/components/data/stat-tile";
import { CATEGORY_LABEL, CATEGORY_ORDER } from "@/components/indicators/labels";
import type { PlaceIndicator } from "./place-indicators";

/**
 * Indicator tiles grouped by category. Indicators without a published value
 * for this place are listed by name as "No data" (never shown as 0) rather
 * than as a wall of empty tiles.
 */
export function IndicatorTiles({ items }: { items: PlaceIndicator[] }) {
  const groups = CATEGORY_ORDER.map((cat) => ({
    cat,
    withData: items.filter((i) => i.meta.category === cat && i.value),
    noData: items.filter((i) => i.meta.category === cat && !i.value),
  })).filter((g) => g.withData.length + g.noData.length > 0);

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        Rank 1st is the best-performing place where the indicator has a better
        direction; otherwise 1st is the highest value. Places without data are
        not ranked.
      </p>
      {groups.map((g) => (
        <section key={g.cat} aria-labelledby={`cat-${g.cat}`}>
          <h3 id={`cat-${g.cat}`} className="mb-2 text-sm font-semibold">
            {CATEGORY_LABEL[g.cat]}
          </h3>
          {g.withData.length > 0 && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {g.withData.map(({ meta, value, nationalLabel, rankLabel }) => (
                <StatTile
                  key={meta.code}
                  label={meta.name}
                  value={value!.value}
                  lower={value!.lower}
                  upper={value!.upper}
                  meta={meta}
                  sourceName={value!.sourcePublisher}
                  year={value!.periodLabel ?? value!.year}
                  isEstimate={value!.isEstimate}
                  national={nationalLabel}
                  rank={rankLabel}
                  href={`/indicators/${meta.code}`}
                />
              ))}
            </div>
          )}
          {g.noData.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              <span className="font-medium">No data for this place: </span>
              {g.noData.map((i, idx) => (
                <span key={i.meta.code}>
                  {idx > 0 && ", "}
                  <Link href={`/indicators/${i.meta.code}`} className="underline-offset-2 hover:underline">
                    {i.meta.name}
                  </Link>
                </span>
              ))}
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
