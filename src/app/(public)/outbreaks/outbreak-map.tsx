"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
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
} from "@/components/map";
import { Alert, Spinner } from "@/components/ui/misc";
import type { OutbreakCell } from "@/components/analytics/types";
import { CASES, cases } from "./outbreak-format";

const CHORO_ID = "outbreak-states";
const FILL_LAYER = choroplethFillLayerId(CHORO_ID);

interface Hover {
  id: number;
  name: string;
  code: string;
  lng: number;
  lat: number;
  pinned: boolean;
}

/**
 * State map coloured by suspected cases in the selected epi week, using A3's
 * shared choropleth components. States with no report that week are grey
 * ("No data") — never painted as zero.
 */
export function OutbreakMap({
  weekRows,
  styleUrl,
  diseaseLabel,
  week,
  year,
  sourceFooter,
}: {
  weekRows: OutbreakCell[];
  styleUrl: string;
  diseaseLabel: string;
  week: number | null;
  year: number | null;
  sourceFooter: ReactNode;
}) {
  const shapes = useJson<GeoFeatureCollection>("/api/geo/levels/state");
  const [hover, setHover] = useState<Hover | null>(null);

  const values = useMemo(
    () =>
      weekRows
        .filter((r) => r.suspected != null)
        .map((r) => ({ id: r.stateId, value: r.suspected as number })),
    [weekRows],
  );
  const byId = useMemo(() => new Map(weekRows.map((r) => [r.stateId, r])), [weekRows]);
  const scheme = useMemo(() => computeScheme(values.map((v) => v.value), 5, "quantile"), [values]);
  const fillColor = useMemo(() => fillColorExpression(values, scheme), [values, scheme]);
  const legend = useMemo(() => legendItems(scheme, CASES), [scheme]);

  const hit = useCallback((e: MapLayerMouseEvent, pinned: boolean): Hover | null => {
    const f = e.features?.[0];
    if (!f || f.layer.id !== FILL_LAYER) return null;
    const p = f.properties as { id?: number | string; code?: string; name?: string };
    const id = Number(p.id ?? f.id);
    if (!Number.isFinite(id)) return null;
    return { id, name: p.name ?? "", code: p.code ?? "", lng: e.lngLat.lng, lat: e.lngLat.lat, pinned };
  }, []);

  const hovered = hover ? byId.get(hover.id) : undefined;

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_15rem]">
      <div className="relative">
        {shapes.error && <Alert variant="destructive">Could not load state shapes: {shapes.error}</Alert>}
        {shapes.loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/40">
            <Spinner />
          </div>
        )}
        <BaseMap
          styleUrl={styleUrl}
          className="h-[52vh] min-h-[300px] max-h-[560px]"
          label={`Map of ${diseaseLabel} suspected cases by state, epi week ${week ?? ""}`}
          interactiveLayerIds={[FILL_LAYER]}
          cursor={hover ? "pointer" : "grab"}
          onMouseMove={(e) => {
            if (hover?.pinned) return;
            const h = hit(e, false);
            if (h?.id !== hover?.id) setHover(h);
          }}
          onMouseOut={() => {
            if (!hover?.pinned) setHover(null);
          }}
          onClick={(e) => setHover(hit(e, true))}
        >
          {shapes.data && (
            <ChoroplethLayer
              mode="geojson"
              id={CHORO_ID}
              data={shapes.data}
              fillColor={fillColor}
              highlightId={hover?.id ?? null}
            />
          )}
          {hover && (
            <HoverPopup
              lng={hover.lng}
              lat={hover.lat}
              title={hover.name}
              value={hovered ? `${cases(hovered.suspected)} suspected` : "No report this week"}
              detail={
                hovered
                  ? `Confirmed ${cases(hovered.confirmed)} · deaths ${cases(hovered.deaths)}`
                  : undefined
              }
              source={`Epi week ${week}, ${year}`}
              href={hover.code ? `/places/${encodeURIComponent(hover.code)}` : undefined}
              onClose={hover.pinned ? () => setHover(null) : undefined}
            />
          )}
        </BaseMap>
      </div>
      <MapLegend
        title={`${diseaseLabel}: suspected cases`}
        subtitle={week ? `Epi week ${week}, ${year} · counts, not rates` : undefined}
        items={legend}
        footer={sourceFooter}
      />
    </div>
  );
}
