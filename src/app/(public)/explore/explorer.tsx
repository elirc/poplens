"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Layers, Link2, Map as MapIcon, Table2 } from "lucide-react";
import type { MapLayerMouseEvent, MapRef, ViewStateChangeEvent } from "react-map-gl/maplibre";
import {
  exploreHref,
  parseMapState,
  type MapLevel,
  type MapState,
} from "@/lib/map-state";
import type { BreakMethod } from "@/lib/class-breaks";
import { formatCI, formatValue, sourceLine, type IndicatorMeta } from "@/lib/format";
import { SourceLine } from "@/components/data/source-line";
import { Alert, Checkbox, Spinner } from "@/components/ui/misc";
import { BaseMap } from "@/components/map/base-map";
import { ChoroplethLayer, choroplethFillLayerId } from "@/components/map/choropleth-layer";
import {
  FACILITY_LEVEL_LABELS,
  FacilityLayer,
  FacilityLegend,
  facilityLayerIds,
} from "@/components/map/facility-layer";
import { MapLegend } from "@/components/map/map-legend";
import { HoverPopup } from "@/components/map/hover-popup";
import { computeScheme, fillColorExpression, legendItems } from "@/components/map/choropleth";
import { useJson } from "@/components/map/use-json";
import type {
  FacilityProps,
  GeoFeatureCollection,
  PlaceValue,
  ValuesResponse,
  ValuesSource,
} from "@/components/map/types";
import { IndicatorPicker } from "./indicator-picker";
import { YearStepper } from "./year-stepper";
import { ValuesTable, type TableRowData } from "./values-table";

export interface ExplorerIndicator extends IndicatorMeta {
  code: string;
  name: string;
  category: string;
}

const LEVEL_LABELS: Record<MapLevel, { one: string; many: string }> = {
  state: { one: "State", many: "States" },
  lga: { one: "LGA", many: "LGAs" },
  ward: { one: "Ward", many: "Wards" },
};

/** Wards only render from this zoom (tile source minzoom). */
const WARD_MIN_ZOOM = 6;
const CHORO_ID = "choropleth";
const FAC = facilityLayerIds("facilities");
const DEFAULT_INDICATOR = "pop_total";

function sourceLabel(s: ValuesSource | undefined): string {
  if (!s) return "Unknown source";
  return s.isSynthetic ? `${s.publisher} (SYNTHETIC demo data)` : s.publisher;
}

type Hover =
  | { kind: "place"; id: number; code: string; name: string; lng: number; lat: number; pinned: boolean }
  | { kind: "facility"; props: FacilityProps; lng: number; lat: number; pinned: boolean };

export function Explorer({
  indicators,
  styleUrl,
}: {
  indicators: ExplorerIndicator[];
  styleUrl: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const state = useMemo(() => parseMapState(searchParams), [searchParams]);
  const mapRef = useRef<MapRef>(null);

  const [zoom, setZoom] = useState<number>(state.camera?.zoom ?? 5);
  const [hover, setHover] = useState<Hover | null>(null);
  const [copied, setCopied] = useState(false);

  const indicatorCode =
    state.indicator && indicators.some((i) => i.code === state.indicator)
      ? state.indicator
      : (indicators.find((i) => i.code === DEFAULT_INDICATOR)?.code ?? indicators[0]?.code ?? null);
  const unknownIndicator = Boolean(state.indicator && state.indicator !== indicatorCode);

  /** All state changes go through the URL (shareable / savable views). */
  const update = useCallback(
    (patch: Partial<MapState>) => {
      const next: MapState = { ...state, indicator: indicatorCode, ...patch };
      window.history.replaceState(null, "", exploreHref(next));
    },
    [state, indicatorCode],
  );

  /* ── data ─────────────────────────────────────────────────────────── */

  const statesGeo = useJson<GeoFeatureCollection>("/api/geo/levels/state");
  const lgaGeoUrl =
    state.level === "lga"
      ? `/api/geo/levels/lga${state.parent ? `?parent=${encodeURIComponent(state.parent)}` : ""}`
      : null;
  const lgaGeo = useJson<GeoFeatureCollection>(lgaGeoUrl);
  const shapes = state.level === "state" ? statesGeo : state.level === "lga" ? lgaGeo : null;

  const valuesUrl = useMemo(() => {
    if (!indicatorCode) return null;
    const q = new URLSearchParams({ indicator: indicatorCode, level: state.level });
    if (state.year != null) q.set("year", String(state.year));
    if (state.level === "lga" && state.parent) q.set("parent", state.parent);
    return `/api/geo/values?${q.toString()}`;
  }, [indicatorCode, state.level, state.year, state.parent]);
  const values = useJson<ValuesResponse>(valuesUrl);
  const vr = values.data;

  const meta: IndicatorMeta | null = vr?.indicator ?? indicators.find((i) => i.code === indicatorCode) ?? null;
  const valueById = useMemo(() => {
    const m = new Map<number, PlaceValue>();
    for (const v of vr?.values ?? []) m.set(v.id, v);
    return m;
  }, [vr]);

  const scheme = useMemo(
    () => computeScheme((vr?.values ?? []).map((v) => v.value), state.classes, state.method),
    [vr, state.classes, state.method],
  );
  const fillColor = useMemo(() => fillColorExpression(vr?.values ?? [], scheme), [vr, scheme]);
  const legend = useMemo(() => (meta ? legendItems(scheme, meta) : []), [scheme, meta]);

  /** Distinct sources behind the current values (for the always-visible attribution). */
  const usedSources = useMemo(() => {
    const out: Array<{ source: ValuesSource; anyEstimate: boolean }> = [];
    if (!vr) return out;
    const est = new Map<number, boolean>();
    for (const v of vr.values) est.set(v.sourceId, (est.get(v.sourceId) ?? false) || v.isEstimate);
    for (const [id, anyEstimate] of est) {
      const source = vr.sources[String(id)];
      if (source) out.push({ source, anyEstimate });
    }
    return out;
  }, [vr]);

  // Fit to the chosen state's LGAs when a parent filter is applied.
  const fittedParent = useRef<string | null>(null);
  useEffect(() => {
    if (state.level !== "lga" || !state.parent || !lgaGeo.data) return;
    if (fittedParent.current === state.parent) return;
    const bbox = featureBounds(lgaGeo.data);
    const map = mapRef.current;
    if (bbox && map) {
      fittedParent.current = state.parent;
      map.fitBounds(bbox, { padding: 24, duration: 600 });
    }
  }, [state.level, state.parent, lgaGeo.data]);

  /* ── interaction ──────────────────────────────────────────────────── */

  const fillLayerId = choroplethFillLayerId(CHORO_ID);
  const interactiveLayerIds = useMemo(
    () => [fillLayerId, ...(state.facilities ? [FAC.clusters, FAC.points] : [])],
    [fillLayerId, state.facilities],
  );

  const hitFromEvent = useCallback(
    (e: MapLayerMouseEvent, pinned: boolean): Hover | null => {
      const f = e.features?.[0];
      if (!f) return null;
      const { lng, lat } = e.lngLat;
      if (f.layer.id === FAC.points) {
        return { kind: "facility", props: f.properties as unknown as FacilityProps, lng, lat, pinned };
      }
      if (f.layer.id === fillLayerId) {
        const p = f.properties as { id?: number | string; code?: string; name?: string };
        const id = Number(p.id ?? f.id);
        if (!Number.isFinite(id) || !p.code) return null;
        return { kind: "place", id, code: p.code, name: p.name ?? p.code, lng, lat, pinned };
      }
      return null;
    },
    [fillLayerId],
  );

  const onMouseMove = useCallback(
    (e: MapLayerMouseEvent) => {
      if (hover?.pinned) return;
      const hit = hitFromEvent(e, false);
      setHover((prev) => {
        if (!hit) return prev ? null : prev;
        if (
          prev &&
          prev.kind === hit.kind &&
          (hit.kind === "place"
            ? prev.kind === "place" && prev.id === hit.id
            : prev.kind === "facility" && prev.props.id === hit.props.id)
        ) {
          return prev;
        }
        return hit;
      });
    },
    [hitFromEvent, hover?.pinned],
  );

  const onClick = useCallback(
    (e: MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (f && f.layer.id === FAC.clusters) {
        const map = mapRef.current;
        if (map) map.easeTo({ center: e.lngLat, zoom: Math.min(map.getZoom() + 2, 14) });
        return;
      }
      const hit = hitFromEvent(e, true);
      if (!hit) {
        setHover(null);
        return;
      }
      const canHover =
        typeof window !== "undefined" && window.matchMedia?.("(hover: hover)").matches;
      if (hit.kind === "place" && canHover) {
        router.push(`/places/${encodeURIComponent(hit.code)}`);
        return;
      }
      // Touch: a tap selects and shows the popup with an "Open profile" link.
      setHover(hit);
    },
    [hitFromEvent, router],
  );

  const onMoveEnd = useCallback(
    (e: ViewStateChangeEvent) => {
      const { longitude, latitude, zoom: z } = e.viewState;
      setZoom(z);
      update({ camera: { lng: longitude, lat: latitude, zoom: z } });
    },
    [update],
  );

  /* ── derived view bits ────────────────────────────────────────────── */

  const year = vr?.year ?? null;
  const years = vr?.years ?? [];
  const levelLabel = LEVEL_LABELS[state.level];
  const indicatorName =
    vr?.indicator.name ?? indicators.find((i) => i.code === indicatorCode)?.name ?? "Indicator";

  const tableRows: TableRowData[] = useMemo(() => {
    if (!vr) return [];
    const toRow = (id: number, code: string, name: string): TableRowData => {
      const v = valueById.get(id);
      return {
        id,
        code,
        name,
        value: v?.value ?? null,
        lower: v?.lower ?? null,
        upper: v?.upper ?? null,
        isEstimate: v?.isEstimate ?? false,
        source: v ? sourceLine({ sourceName: sourceLabel(vr.sources[String(v.sourceId)]), year: vr.year, isEstimate: v.isEstimate }) : null,
      };
    };
    const fc = shapes?.data;
    if (fc) return fc.features.map((f) => toRow(f.properties.id, f.properties.code, f.properties.name));
    return vr.values.map((v) => toRow(v.id, v.code, v.name));
  }, [vr, shapes?.data, valueById]);

  const hoverPopup = (() => {
    if (!hover || state.view !== "map") return null;
    if (hover.kind === "facility") {
      return (
        <HoverPopup
          lng={hover.lng}
          lat={hover.lat}
          title={hover.props.name}
          detail={`${hover.props.type} · ${FACILITY_LEVEL_LABELS[hover.props.careLevel] ?? hover.props.careLevel} · ${hover.props.ownership.replace("_", " ")}`}
          source={`Source: facility list${hover.props.sourceVersion ? ` ${hover.props.sourceVersion}` : ""}`}
          onClose={hover.pinned ? () => setHover(null) : undefined}
        />
      );
    }
    const v = valueById.get(hover.id);
    const src = v && vr ? vr.sources[String(v.sourceId)] : undefined;
    return (
      <HoverPopup
        lng={hover.lng}
        lat={hover.lat}
        title={hover.name}
        value={meta ? formatValue(v?.value ?? null, meta) : null}
        detail={v && meta ? formatCI(v.lower, v.upper, meta) || undefined : undefined}
        source={
          v ? sourceLine({ sourceName: sourceLabel(src), year, isEstimate: v.isEstimate }) : `${indicatorName} · ${year ?? ""}`
        }
        href={hover.pinned ? `/places/${encodeURIComponent(hover.code)}` : undefined}
        hint="Click to open the profile"
        onClose={hover.pinned ? () => setHover(null) : undefined}
      />
    );
  })();

  const attribution =
    usedSources.length > 0 ? (
      <div className="space-y-0.5">
        {usedSources.map(({ source, anyEstimate }) => (
          <SourceLine
            key={source.id}
            sourceName={`${sourceLabel(source)} — ${source.title}`}
            year={year}
            isEstimate={anyEstimate}
          />
        ))}
      </div>
    ) : (
      <p className="text-xs text-muted-foreground">
        No published values for {indicatorName} at {levelLabel.one.toLowerCase()} level
        {year ? ` in ${year}` : ""}. Places are shown as &ldquo;No data&rdquo;.
      </p>
    );

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable (insecure context) — the URL bar still has the link */
    }
  }

  /* ── render ───────────────────────────────────────────────────────── */

  if (indicators.length === 0) {
    return (
      <Alert variant="warning">
        The indicator catalogue is not available right now. Please try again shortly.
      </Alert>
    );
  }

  const stateOptions = statesGeo.data?.features
    .map((f) => f.properties)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="grid gap-3 lg:grid-cols-[300px_minmax(0,1fr)]">
      {/* Controls */}
      <aside className="space-y-4 rounded-lg border border-border p-3 lg:sticky lg:top-16 lg:self-start">
        <IndicatorPicker
          indicators={indicators}
          value={indicatorCode}
          onChange={(code) => update({ indicator: code, year: null })}
        />
        {unknownIndicator && (
          <p className="text-xs text-amber-800">
            Indicator &ldquo;{state.indicator}&rdquo; was not found; showing {indicatorName}.
          </p>
        )}

        <YearStepper
          years={years}
          value={year}
          onChange={(y) => update({ year: y })}
          disabled={values.loading}
        />

        <div className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">Level</span>
          <div role="radiogroup" aria-label="Geographic level" className="grid grid-cols-3 rounded-md border border-border text-sm">
            {(Object.keys(LEVEL_LABELS) as MapLevel[]).map((l, i) => (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={state.level === l}
                onClick={() => {
                  setHover(null);
                  update({ level: l, parent: l === "lga" ? state.parent : null });
                }}
                className={`py-1.5 ${i === 0 ? "rounded-l-md" : ""} ${i === 2 ? "rounded-r-md" : ""} ${
                  state.level === l ? "bg-emerald-700 font-medium text-white" : "hover:bg-muted"
                }`}
              >
                {LEVEL_LABELS[l].many}
              </button>
            ))}
          </div>
          {state.level === "lga" && stateOptions && (
            <label className="mt-1.5 flex flex-col gap-1 text-xs text-muted-foreground">
              Within state
              <select
                value={state.parent ?? ""}
                onChange={(e) => {
                  fittedParent.current = null;
                  update({ parent: e.target.value || null });
                }}
                className="h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground"
              >
                <option value="">All of Nigeria</option>
                {stateOptions.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={state.facilities}
              onChange={(e) => update({ facilities: e.target.checked })}
            />
            <Layers className="h-4 w-4 text-muted-foreground" aria-hidden />
            Health facilities
          </label>
          {state.facilities && <FacilityLegend />}
        </div>

        <MapLegend
          className="hidden lg:block"
          title={indicatorName}
          subtitle={`${levelLabel.many}${year ? ` · ${year}` : ""}${meta?.valueType === "percent" ? " · %" : meta?.unit ? ` · ${meta.unit}` : ""}`}
          items={legend}
          method={state.method}
          onMethodChange={(m: BreakMethod) => update({ method: m })}
          classes={state.classes}
          onClassesChange={(k) => update({ classes: k })}
          footer={attribution}
        />
      </aside>

      {/* Map / table */}
      <section className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">
              {indicatorName}
              <span className="font-normal text-muted-foreground">
                {" "}
                · {levelLabel.many}
                {year ? ` · ${year}` : ""}
              </span>
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {values.loading && <Spinner />}
            <button
              type="button"
              onClick={copyLink}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
            >
              <Link2 className="h-3.5 w-3.5" aria-hidden />
              {copied ? "Copied" : "Copy link"}
            </button>
            <div role="tablist" aria-label="Map or table view" className="flex rounded-md border border-border text-xs">
              {(["map", "table"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  aria-selected={state.view === v}
                  onClick={() => update({ view: v })}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 capitalize ${
                    state.view === v ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground"
                  } ${v === "map" ? "rounded-l-md" : "rounded-r-md"}`}
                >
                  {v === "map" ? <MapIcon className="h-3.5 w-3.5" aria-hidden /> : <Table2 className="h-3.5 w-3.5" aria-hidden />}
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>

        {values.error && (
          <Alert variant="destructive">Could not load values: {values.error}</Alert>
        )}
        {shapes?.error && (
          <Alert variant="destructive">Could not load boundaries: {shapes.error}</Alert>
        )}

        {state.view === "map" ? (
          <div className="relative">
            <BaseMap
              ref={mapRef}
              styleUrl={styleUrl}
              initialCamera={state.camera}
              className="h-[62vh] min-h-[340px] lg:h-[calc(100vh-11rem)]"
              label={`Map of ${indicatorName} by ${levelLabel.one.toLowerCase()}`}
              interactiveLayerIds={interactiveLayerIds}
              cursor={hover && !hover.pinned ? "pointer" : undefined}
              onMouseMove={onMouseMove}
              onMouseOut={() => {
                if (!hover?.pinned) setHover(null);
              }}
              onClick={onClick}
              onMoveEnd={onMoveEnd}
              onLoad={() => setZoom(mapRef.current?.getZoom() ?? zoom)}
            >
              {state.level === "ward" ? (
                <ChoroplethLayer
                  id={CHORO_ID}
                  key="ward"
                  mode="tiles"
                  tilePath="/api/tiles/wards/{z}/{x}/{y}"
                  sourceLayer="wards"
                  minzoom={WARD_MIN_ZOOM}
                  maxzoom={12}
                  fillColor={fillColor}
                  highlightId={hover?.kind === "place" ? hover.id : null}
                />
              ) : shapes?.data ? (
                <ChoroplethLayer
                  id={CHORO_ID}
                  key={`${state.level}-${state.parent ?? "all"}`}
                  mode="geojson"
                  data={shapes.data}
                  fillColor={fillColor}
                  highlightId={hover?.kind === "place" ? hover.id : null}
                />
              ) : null}
              <FacilityLayer
                // Remount with the choropleth so facility layers stay on top of the fill.
                key={`fac-${state.level}-${state.parent ?? "all"}-${shapes?.data ? 1 : 0}`}
                id="facilities"
                visible={state.facilities}
                filters={state.level === "lga" && state.parent ? { state: state.parent } : undefined}
              />
              {hoverPopup}
            </BaseMap>

            {state.level === "ward" && zoom < WARD_MIN_ZOOM && (
              <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
                <p className="rounded-full bg-neutral-900/85 px-3 py-1 text-xs text-white shadow">
                  Zoom in to see wards
                </p>
              </div>
            )}
            {(shapes?.loading || values.loading) && (
              <div className="pointer-events-none absolute left-3 top-3 rounded bg-background/90 px-2 py-1 text-xs shadow">
                Loading…
              </div>
            )}

            {/* Compact legend over the map on phones/tablets. */}
            <MapLegend
              className="mt-2 lg:hidden"
              title={indicatorName}
              subtitle={`${levelLabel.many}${year ? ` · ${year}` : ""}`}
              items={legend}
              method={state.method}
              onMethodChange={(m: BreakMethod) => update({ method: m })}
              classes={state.classes}
              onClassesChange={(k) => update({ classes: k })}
            />
          </div>
        ) : meta ? (
          <ValuesTable
            rows={tableRows}
            meta={meta}
            indicatorName={indicatorName}
            levelLabel={levelLabel.one}
            year={year}
          />
        ) : null}

        {state.view === "table" && state.level === "ward" && (
          <p className="text-xs text-muted-foreground">
            Ward table lists wards with a published value; other wards have no data.
          </p>
        )}

        {/* Attribution stays visible in both views. */}
        <div className="rounded-md bg-muted/40 px-3 py-2">{attribution}</div>
      </section>
    </div>
  );
}

/** [[w,s],[e,n]] of a FeatureCollection (polygon coordinates only). */
function featureBounds(fc: GeoFeatureCollection): [[number, number], [number, number]] | null {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  const walk = (c: unknown): void => {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === "number" && typeof c[1] === "number") {
      const [x, y] = c as [number, number];
      if (x < w) w = x;
      if (x > e) e = x;
      if (y < s) s = y;
      if (y > n) n = y;
      return;
    }
    for (const part of c) walk(part);
  };
  for (const f of fc.features) walk((f.geometry as { coordinates?: unknown } | null)?.coordinates);
  return Number.isFinite(w) ? [[w, s], [e, n]] : null;
}
