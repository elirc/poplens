import type { Metadata } from "next";
import { z } from "zod";
import { env } from "@/env";
import { getAvailableYears, getIndicatorByCode, getValuesForLevel } from "@/server/indicators/queries";
import { getGeoUnitByCode } from "@/server/geo/queries";
import { ChartErrorBox } from "@/components/content/chart-error";
import { EmbedFooter } from "@/components/embed/embed-footer";
import { EmbedMap } from "@/components/embed/embed-map";
import { exploreHref } from "@/components/indicators/labels";
import type { PlaceValue, ValuesSource } from "@/components/map";

/**
 * /embed/map?i=<indicator>&y=<year>&l=state|lga|ward[&p=<state code>]
 * Compact choropleth embed (same i/y/l/p keys as the explorer URL contract).
 */
export const revalidate = 300;

export const metadata: Metadata = { title: "Map" };

const Query = z.object({
  i: z.string().regex(/^[A-Za-z0-9_.-]{1,64}$/, "invalid indicator code"),
  y: z.coerce.number().int().min(1900).max(2100).optional(),
  l: z.enum(["state", "lga", "ward"]).default("state"),
  p: z.string().regex(/^[A-Za-z0-9-]{2,40}$/).optional(),
});

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function EmbedMapPage({ searchParams }: Props) {
  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    const s = Array.isArray(v) ? v[0] : v;
    return s === "" ? undefined : s;
  };
  const base = env.APP_URL.replace(/\/+$/, "");
  const q = Query.safeParse({ i: one("i"), y: one("y"), l: one("l"), p: one("p") });
  if (!q.success) {
    return (
      <>
        <ChartErrorBox message={q.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")} />
        <EmbedFooter href={base} synthetic={false} />
      </>
    );
  }
  const { i, y, l, p } = q.data;
  const ind = await getIndicatorByCode(i);
  if (!ind) {
    return (
      <>
        <ChartErrorBox message={`Unknown indicator "${i}"`} />
        <EmbedFooter href={base} synthetic={false} />
      </>
    );
  }
  let parentId: number | undefined;
  let parentCode: string | null = null;
  if (p && l === "lga") {
    const parent = await getGeoUnitByCode(p.toUpperCase());
    if (parent) {
      parentId = parent.id;
      parentCode = parent.code;
    }
  }
  const years = await getAvailableYears(ind.id, l);
  const year = y != null && years.includes(y) ? y : (years[years.length - 1] ?? null);
  const rows = year != null ? await getValuesForLevel(ind.id, l, year, { parentId }) : [];

  const sources: Record<string, ValuesSource> = {};
  const values: PlaceValue[] = [];
  for (const r of rows) {
    const value = Number(r.value);
    if (!Number.isFinite(value)) continue;
    sources[String(r.sourceId)] ??= {
      id: r.sourceId,
      key: r.sourceKey,
      publisher: r.sourcePublisher,
      title: r.sourceTitle,
      isSynthetic: Boolean(r.isSynthetic),
    };
    values.push({
      id: Number(r.geoUnitId),
      code: r.code,
      name: r.name,
      value,
      lower: r.lower == null ? null : Number(r.lower),
      upper: r.upper == null ? null : Number(r.upper),
      isEstimate: Boolean(r.isEstimate),
      sourceId: r.sourceId,
    });
  }

  return (
    <>
      {y != null && year !== y && (
        <p className="mb-1 text-xs text-muted-foreground">No data for {y}; showing {year ?? "—"}.</p>
      )}
      <EmbedMap
        styleUrl={env.MAP_STYLE_URL}
        level={l}
        parent={parentCode}
        indicator={{
          code: ind.code,
          name: ind.name,
          category: ind.category,
          unit: ind.unit,
          valueType: ind.valueType,
          decimals: ind.decimals,
          higherIsBetter: ind.higherIsBetter,
        }}
        year={year}
        values={values}
        sources={sources}
        appUrl={base}
      />
      <EmbedFooter
        href={`${base}${exploreHref(ind.code, year, l, parentCode)}`}
        synthetic={Object.values(sources).some((s) => s.isSynthetic)}
      />
    </>
  );
}
