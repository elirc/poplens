"use client";

import { useCallback, useMemo, useState } from "react";
import type { MapLayerMouseEvent } from "react-map-gl/maplibre";
import {
  BaseMap,
  ChoroplethLayer,
  HoverPopup,
  MapLegend,
  choroplethFillLayerId,
  computeScheme,
  fillColorExpression,
  legendItems,
  useJson,
  type GeoFeatureCollection,
  type PlaceValue,
  type ValuesIndicator,
  type ValuesSource,
} from "@/components/map";
import { ChartFrame } from "@/components/data/chart-frame";
import { SourceLine } from "@/components/data/source-line";
import { formatCI, formatValue, sourceLine } from "@/lib/format";

/**
 * Compact embeddable choropleth (reuses A3's map components). Values are
 * passed from the server page; shapes come from the cached geo routes (or
 * MVT tiles for wards). Places without a value render in the "No data" colour.
 */
export function EmbedMap({
  styleUrl,
  level,
  parent,
  indicator,
  year,
  values,
  sources,
  appUrl,
}: {
  styleUrl: string;
  level: "state" | "lga" | "ward";
  parent: string | null;
  indicator: ValuesIndicator;
  year: number | null;
  values: PlaceValue[];
  sources: Record<string, ValuesSource>;
  appUrl: string;
}) {
  const shapesUrl =
    level === "ward" ? null : `/api/geo/levels/${level}${parent ? `?parent=${encodeURIComponent(parent)}` : ""}`;
  const shapes = useJson<GeoFeatureCollection>(shapesUrl);
  const [hover, setHover] = useState<{ id: number; name: string; lng: number; lat: number } | null>(null);

  const scheme = useMemo(() => computeScheme(values.map((v) => v.value), 5, "quantile"), [values]);
  const fill = useMemo(() => fillColorExpression(values, scheme), [values, scheme]);
  const legend = useMemo(() => legendItems(scheme, indicator), [scheme, indicator]);
  const byId = useMemo(() => new Map(values.map((v) => [v.id, v])), [values]);
  const CHORO = "embed-choropleth";
  const fillLayer = choroplethFillLayerId(CHORO);

  const usedSources = Object.values(sources);
  const sourceName =
    usedSources.map((s) => (s.isSynthetic ? `${s.publisher} (SYNTHETIC demo data)` : s.publisher)).join("; ") || "—";
  const anyEstimate = values.some((v) => v.isEstimate);

  const onMove = useCallback((e: MapLayerMouseEvent) => {
    const f = e.features?.[0];
    if (!f) {
      setHover(null);
      return;
    }
    const p = f.properties as { id?: number | string; name?: string };
    const id = Number(p.id ?? f.id);
    if (!Number.isFinite(id)) return;
    setHover((prev) =>
      prev && prev.id === id ? prev : { id, name: p.name ?? "", lng: e.lngLat.lng, lat: e.lngLat.lat },
    );
  }, []);

  const hv = hover ? byId.get(hover.id) : undefined;
  const fmt = (v: number | null | undefined) => formatValue(v, indicator);
  const sorted = useMemo(() => [...values].sort((a, b) => b.value - a.value), [values]);

  const table = (
    <div className="max-h-80 overflow-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="py-1 pr-2 font-medium">Place</th>
            <th className="py-1 pr-2 text-right font-medium">Value</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((v) => (
            <tr key={v.id} className="border-b border-border/60">
              <td className="py-1 pr-2">
                <a href={`${appUrl}/places/${encodeURIComponent(v.code)}`} target="_blank" rel="noopener" className="hover:underline">
                  {v.name}
                </a>
              </td>
              <td className="py-1 pr-2 text-right tabular-nums">
                {fmt(v.value)} {formatCI(v.lower, v.upper, indicator)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {sorted.length === 0 && <p className="py-4 text-center text-muted-foreground">No data</p>}
    </div>
  );

  return (
    <ChartFrame
      title={`${indicator.name}${year != null ? `, ${year}` : ""}`}
      table={table}
      source={<SourceLine sourceName={sourceName} year={year} isEstimate={anyEstimate} />}
      footnote={level === "ward" ? "Zoom in to see ward shapes." : undefined}
    >
      <BaseMap
        styleUrl={styleUrl}
        className="h-[300px] sm:h-[360px]"
        label={`Map of ${indicator.name}`}
        interactiveLayerIds={[fillLayer]}
        cursor={hover ? "pointer" : undefined}
        onMouseMove={onMove}
        onMouseOut={() => setHover(null)}
      >
        {level === "ward" ? (
          <ChoroplethLayer
            id={CHORO}
            mode="tiles"
            tilePath="/api/tiles/wards/{z}/{x}/{y}"
            sourceLayer="wards"
            fillColor={fill}
            highlightId={hover?.id ?? null}
          />
        ) : shapes.data ? (
          <ChoroplethLayer id={CHORO} mode="geojson" data={shapes.data} fillColor={fill} highlightId={hover?.id ?? null} />
        ) : null}
        {hover && (
          <HoverPopup
            lng={hover.lng}
            lat={hover.lat}
            title={hover.name || hv?.name || ""}
            value={hv ? fmt(hv.value) : "No data"}
            source={
              hv
                ? sourceLine({
                    sourceName: sources[String(hv.sourceId)]?.publisher ?? "—",
                    year,
                    isEstimate: hv.isEstimate,
                  })
                : undefined
            }
          />
        )}
      </BaseMap>
      {shapes.error && <p className="mt-1 text-xs text-red-700">Map shapes could not load: {shapes.error}</p>}
      <MapLegend title={indicator.unit} items={legend} className="mt-2 shadow-none" />
    </ChartFrame>
  );
}
