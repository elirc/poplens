"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Crosshair, Map as MapIcon, MapPin, Users, X } from "lucide-react";
import { Layer, Marker, Source, type MapLayerMouseEvent, type MapRef } from "react-map-gl/maplibre";
import type { BreakMethod } from "@/lib/class-breaks";
import { formatValue, sourceLine, type IndicatorMeta } from "@/lib/format";
import { SourceLine } from "@/components/data/source-line";
import { Alert, Checkbox, Spinner } from "@/components/ui/misc";
import { BaseMap, NIGERIA_BOUNDS } from "@/components/map/base-map";
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
import type { FacilityProps, GeoFeatureCollection } from "@/components/map/types";
import {
  CARE_LABELS,
  CARE_LEVELS,
  OWNERSHIP_LABELS,
  OWNERSHIPS,
  facilitiesGeoUrl,
  facilitiesHref,
  formatDistance,
  type CareLevel,
  type FacilityQuery,
  type Ownership,
} from "./_lib/filters";
import type {
  FacilitySource,
  NearestResponse,
  PeoplePerFacilityByLga,
} from "./_lib/types";

const FAC_ID = "facilities";
const FAC = facilityLayerIds(FAC_ID);
const PPF_ID = "ppf";
const NEAREST_ID = "nearest";

interface Option {
  code: string;
  name: string;
}

type Popup =
  | { kind: "facility"; props: FacilityProps; lng: number; lat: number; pinned: boolean }
  | { kind: "lga"; id: number; code: string; name: string; lng: number; lat: number; pinned: boolean };

export function facilitySourceLabel(s: FacilitySource): string {
  const who = s.isSynthetic ? `${s.publisher} (SYNTHETIC demo data)` : s.publisher;
  return s.datasetTitle ? `${who} — ${s.datasetTitle}` : who;
}

export function FacilitiesExplorer({
  styleUrl,
  query,
  states,
  lgas,
  types,
  sources,
  total,
  ppf,
}: {
  styleUrl: string;
  query: FacilityQuery;
  states: Option[];
  lgas: Option[];
  types: string[];
  sources: FacilitySource[];
  total: number | null;
  ppf: PeoplePerFacilityByLga | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const mapRef = useRef<MapRef>(null);
  const [loaded, setLoaded] = useState(false);
  const [popup, setPopup] = useState<Popup | null>(null);
  const [pin, setPin] = useState<{ lng: number; lat: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [method, setMethod] = useState<BreakMethod>("quantile");
  const [classes, setClasses] = useState(5);

  const isMap = query.view === "map";

  const go = useCallback(
    (patch: Partial<FacilityQuery>) => {
      const next: FacilityQuery = { ...query, page: 1, ...patch };
      setPopup(null);
      startTransition(() => router.push(facilitiesHref(next), { scroll: false }));
    },
    [query, router],
  );

  /* ── data ─────────────────────────────────────────────────────────── */

  const points = useJson<GeoJSON.FeatureCollection>(isMap ? facilitiesGeoUrl(query) : null);
  const lgaShapes = useJson<GeoFeatureCollection>(
    isMap ? null : `/api/geo/levels/lga${query.state ? `?parent=${encodeURIComponent(query.state)}` : ""}`,
  );

  const nearestUrl = useMemo(() => {
    if (!pin || !isMap) return null;
    const q = new URLSearchParams({ lng: pin.lng.toFixed(5), lat: pin.lat.toFixed(5), n: "10" });
    if (query.care.length) q.set("care", query.care.join(","));
    if (query.own.length) q.set("own", query.own.join(","));
    if (query.type) q.set("type", query.type);
    return `/api/facilities/nearest?${q.toString()}`;
  }, [pin, isMap, query.care, query.own, query.type]);
  const nearest = useJson<NearestResponse>(nearestUrl);

  /* ── people per facility choropleth ───────────────────────────────── */

  const ppfMeta = useMemo<IndicatorMeta | null>(
    () =>
      ppf
        ? { unit: ppf.indicator.unit, valueType: ppf.indicator.valueType, decimals: ppf.indicator.decimals }
        : null,
    [ppf],
  );
  const ppfById = useMemo(() => new Map((ppf?.rows ?? []).map((r) => [r.id, r])), [ppf]);
  const scheme = useMemo(
    () => computeScheme((ppf?.rows ?? []).map((r) => r.value), classes, method),
    [ppf, classes, method],
  );
  const fillColor = useMemo(
    () => fillColorExpression((ppf?.rows ?? []).map((r) => ({ id: r.id, value: r.value })), scheme),
    [ppf, scheme],
  );
  const legend = useMemo(() => (ppfMeta ? legendItems(scheme, ppfMeta) : []), [scheme, ppfMeta]);
  const ppfSourceNodes = ppf?.sources.length ? (
    <div className="space-y-0.5">
      {ppf.sources.map((s) => (
        <SourceLine
          key={s.id}
          sourceName={`${s.isSynthetic ? `${s.publisher} (SYNTHETIC demo data)` : s.publisher} — ${s.title}`}
          year={ppf.year}
          isEstimate={ppf.rows.some((r) => r.sourceId === s.id && r.isEstimate)}
        />
      ))}
    </div>
  ) : (
    <p className="text-xs text-muted-foreground">No published people-per-facility values; LGAs show &ldquo;No data&rdquo;.</p>
  );

  /* ── fit to scope ─────────────────────────────────────────────────── */

  const fitted = useRef<string | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!loaded || !map) return;
    const scopeKey = `${query.view}|${query.state ?? ""}|${query.lga ?? ""}`;
    if (fitted.current === scopeKey) return;
    if (!query.state && !query.lga) {
      if (fitted.current !== null) map.fitBounds(NIGERIA_BOUNDS, { padding: 16, duration: 600 });
      fitted.current = scopeKey;
      return;
    }
    const fc = isMap ? points.data : (lgaShapes.data as unknown as GeoJSON.FeatureCollection | undefined);
    if (!fc) return;
    const b = boundsOf(fc);
    fitted.current = scopeKey;
    if (b) map.fitBounds(b, { padding: 32, duration: 600, maxZoom: 12 });
  }, [loaded, query.view, query.state, query.lga, isMap, points.data, lgaShapes.data]);

  /* ── interaction ──────────────────────────────────────────────────── */

  const ppfFill = choroplethFillLayerId(PPF_ID);
  const interactiveLayerIds = useMemo(
    () => (isMap ? [FAC.clusters, FAC.points] : [ppfFill]),
    [isMap, ppfFill],
  );

  const onClick = useCallback(
    (e: MapLayerMouseEvent) => {
      const f = e.features?.[0];
      const { lng, lat } = e.lngLat;
      if (f?.layer.id === FAC.clusters) {
        const map = mapRef.current;
        if (map) map.easeTo({ center: e.lngLat, zoom: Math.min(map.getZoom() + 2, 14) });
        return;
      }
      if (f?.layer.id === FAC.points) {
        setPopup({ kind: "facility", props: f.properties as unknown as FacilityProps, lng, lat, pinned: true });
        return;
      }
      if (f?.layer.id === ppfFill) {
        const p = f.properties as { id?: number | string; code?: string; name?: string };
        if (p.code) {
          setPopup({ kind: "lga", id: Number(p.id ?? f.id), code: p.code, name: p.name ?? p.code, lng, lat, pinned: true });
        }
        return;
      }
      setPopup(null);
      if (isMap) {
        setGeoError(null);
        setPin({ lng, lat });
      }
    },
    [isMap, ppfFill],
  );

  const onMouseMove = useCallback(
    (e: MapLayerMouseEvent) => {
      if (popup?.pinned) return;
      const f = e.features?.[0];
      if (!f || f.layer.id !== ppfFill) {
        if (popup) setPopup(null);
        return;
      }
      const p = f.properties as { id?: number | string; code?: string; name?: string };
      const id = Number(p.id ?? f.id);
      if (!p.code || (popup?.kind === "lga" && popup.id === id)) return;
      setPopup({ kind: "lga", id, code: p.code, name: p.name ?? p.code, lng: e.lngLat.lng, lat: e.lngLat.lat, pinned: false });
    },
    [popup, ppfFill],
  );

  function locateMe() {
    if (!("geolocation" in navigator)) {
      setGeoError("Location is not available in this browser. Tap the map instead.");
      return;
    }
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lng: pos.coords.longitude, lat: pos.coords.latitude };
        setPin(p);
        mapRef.current?.flyTo({ center: [p.lng, p.lat], zoom: Math.max(mapRef.current.getZoom(), 10) });
      },
      () => setGeoError("Could not get your location. Tap the map to choose a point instead."),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  const nearestFc = useMemo<GeoJSON.FeatureCollection | null>(() => {
    const list = nearest.data?.facilities;
    if (!list?.length) return null;
    return {
      type: "FeatureCollection",
      features: list.map((f, i) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [f.lng, f.lat] },
        properties: { rank: i + 1 },
      })),
    };
  }, [nearest.data]);

  /* ── render ───────────────────────────────────────────────────────── */

  const popupNode = (() => {
    if (!popup) return null;
    if (popup.kind === "facility") {
      const p = popup.props;
      return (
        <HoverPopup
          lng={popup.lng}
          lat={popup.lat}
          title={p.name}
          detail={`${p.type} · ${FACILITY_LEVEL_LABELS[p.careLevel] ?? p.careLevel} · ${OWNERSHIP_LABELS[p.ownership as Ownership] ?? p.ownership}`}
          source={`Source: facility list${p.sourceVersion ? ` ${p.sourceVersion}` : ""}`}
          onClose={() => setPopup(null)}
        />
      );
    }
    const row = ppfById.get(popup.id);
    const src = row ? ppf?.sources.find((s) => s.id === row.sourceId) : undefined;
    return (
      <HoverPopup
        lng={popup.lng}
        lat={popup.lat}
        title={`${popup.name}${row?.stateName ? `, ${row.stateName}` : ""}`}
        value={ppfMeta ? `${formatValue(row?.value ?? null, ppfMeta)}${row ? " people per facility" : ""}` : null}
        source={
          src
            ? sourceLine({
                sourceName: src.isSynthetic ? `${src.publisher} (SYNTHETIC demo data)` : src.publisher,
                year: ppf?.year,
                isEstimate: row?.isEstimate,
              })
            : undefined
        }
        href={popup.pinned ? `/places/${encodeURIComponent(popup.code)}` : undefined}
        hint="Click for the profile link"
        onClose={popup.pinned ? () => setPopup(null) : undefined}
      />
    );
  })();

  const facilitySourceNodes = sources.length ? (
    <div className="space-y-0.5">
      {sources.map((s, i) => (
        <SourceLine key={i} sourceName={facilitySourceLabel(s)} year={s.sourceVersion ?? s.year} />
      ))}
    </div>
  ) : (
    <p className="text-xs text-muted-foreground">No facilities match these filters.</p>
  );

  const toggle = <T extends string>(list: T[], v: T): T[] =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

  const anyFilter = Boolean(query.state || query.lga || query.care.length || query.own.length || query.type);

  return (
    <div className="grid gap-3 lg:grid-cols-[300px_minmax(0,1fr)]">
      {/* Controls */}
      <aside
        className="space-y-4 rounded-lg border border-border p-3 lg:sticky lg:top-16 lg:self-start"
        aria-label="Facility filters"
      >
        <div role="tablist" aria-label="View" className="grid grid-cols-2 rounded-md border border-border text-sm">
          {(
            [
              { v: "map", label: "Facilities", icon: MapIcon },
              { v: "ppf", label: "People per facility", icon: Users },
            ] as const
          ).map(({ v, label, icon: Icon }, i) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={query.view === v}
              onClick={() => go({ view: v })}
              className={`inline-flex items-center justify-center gap-1 px-2 py-1.5 ${i === 0 ? "rounded-l-md" : "rounded-r-md"} ${
                query.view === v ? "bg-emerald-700 font-medium text-white" : "hover:bg-muted"
              }`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {label}
            </button>
          ))}
        </div>

        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          State
          <select
            value={query.state ?? ""}
            onChange={(e) => go({ state: e.target.value || null, lga: null })}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
          >
            <option value="">All of Nigeria</option>
            {states.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        {isMap && (
          <>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              LGA
              <select
                value={query.lga ?? ""}
                disabled={!query.state}
                onChange={(e) => go({ lga: e.target.value || null })}
                className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground disabled:opacity-60"
              >
                <option value="">{query.state ? "All LGAs" : "Choose a state first"}</option>
                {lgas.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Facility type
              <select
                value={query.type ?? ""}
                onChange={(e) => go({ type: e.target.value || null })}
                className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
              >
                <option value="">All types</option>
                {types.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>

            <fieldset className="space-y-1.5">
              <legend className="text-xs font-medium text-muted-foreground">Level of care</legend>
              {CARE_LEVELS.map((c: CareLevel) => (
                <label key={c} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={query.care.includes(c)} onChange={() => go({ care: toggle(query.care, c) })} />
                  {CARE_LABELS[c]}
                </label>
              ))}
            </fieldset>

            <fieldset className="space-y-1.5">
              <legend className="text-xs font-medium text-muted-foreground">Ownership</legend>
              {OWNERSHIPS.filter((o) => o !== "unknown").map((o) => (
                <label key={o} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={query.own.includes(o)} onChange={() => go({ own: toggle(query.own, o) })} />
                  {OWNERSHIP_LABELS[o]}
                </label>
              ))}
            </fieldset>

            <FacilityLegend />
          </>
        )}

        {!isMap && ppf && ppfMeta && (
          <MapLegend
            title={ppf.indicator.name}
            subtitle={`LGAs${ppf.year ? ` · ${ppf.year}` : ""} · ${ppf.indicator.unit}`}
            items={legend}
            method={method}
            onMethodChange={setMethod}
            classes={classes}
            onClassesChange={setClasses}
            footer={ppfSourceNodes}
          />
        )}

        {anyFilter && (
          <Link
            href={facilitiesHref({ view: query.view })}
            className="inline-block text-xs font-medium text-emerald-700 hover:underline"
            onClick={() => setPopup(null)}
          >
            Clear filters
          </Link>
        )}
      </aside>

      {/* Map + nearest */}
      <section className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {isMap
              ? total == null
                ? ""
                : `${total.toLocaleString("en-NG")} ${total === 1 ? "facility matches" : "facilities match"} these filters`
              : ppf
                ? `${ppf.rows.length.toLocaleString("en-NG")} LGAs with a published value`
                : "People per facility is not available"}
          </p>
          <div className="flex items-center gap-2">
            {(pending || points.loading || lgaShapes.loading) && <Spinner />}
            {isMap && (
              <button
                type="button"
                onClick={locateMe}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
              >
                <Crosshair className="h-3.5 w-3.5" aria-hidden />
                Nearest to me
              </button>
            )}
          </div>
        </div>

        {points.error && <Alert variant="destructive">Could not load facilities: {points.error}</Alert>}
        {lgaShapes.error && <Alert variant="destructive">Could not load LGA boundaries: {lgaShapes.error}</Alert>}
        {!isMap && !ppf && (
          <Alert variant="warning">The people-per-facility indicator is not in the catalogue yet.</Alert>
        )}

        <BaseMap
          ref={mapRef}
          styleUrl={styleUrl}
          className="h-[58vh] min-h-[320px] lg:h-[calc(100vh-12rem)]"
          label={isMap ? "Map of health facilities" : "Map of people per facility by LGA"}
          interactiveLayerIds={interactiveLayerIds}
          cursor={isMap ? "crosshair" : undefined}
          onClick={onClick}
          onMouseMove={isMap ? undefined : onMouseMove}
          onMouseOut={() => {
            if (!popup?.pinned) setPopup(null);
          }}
          onLoad={() => setLoaded(true)}
        >
          {!isMap && lgaShapes.data && (
            <ChoroplethLayer
              id={PPF_ID}
              key={`ppf-${query.state ?? "all"}`}
              mode="geojson"
              data={lgaShapes.data}
              fillColor={fillColor}
              highlightId={popup?.kind === "lga" ? popup.id : null}
            />
          )}
          {isMap && points.data && (
            <FacilityLayer
              id={FAC_ID}
              key={query.lga ? "fac-lga" : "fac-all"}
              data={points.data}
              cluster={!query.lga}
            />
          )}
          {isMap && nearestFc && (
            <Source id={NEAREST_ID} type="geojson" data={nearestFc}>
              <Layer
                id={`${NEAREST_ID}-ring`}
                type="circle"
                paint={{
                  "circle-radius": 10,
                  "circle-color": "rgba(0,0,0,0)",
                  "circle-stroke-color": "#111827",
                  "circle-stroke-width": 2,
                }}
              />
              <Layer
                id={`${NEAREST_ID}-rank`}
                type="symbol"
                layout={{
                  "text-field": ["to-string", ["get", "rank"]],
                  "text-size": 11,
                  "text-font": ["Noto Sans Regular"],
                  "text-offset": [0, -1.5],
                  "text-allow-overlap": true,
                }}
                paint={{ "text-color": "#111827", "text-halo-color": "#ffffff", "text-halo-width": 1.5 }}
              />
            </Source>
          )}
          {isMap && pin && (
            <Marker longitude={pin.lng} latitude={pin.lat} anchor="bottom">
              <MapPin className="h-7 w-7 fill-red-600 text-white drop-shadow" aria-label="Chosen point" />
            </Marker>
          )}
          {popupNode}
        </BaseMap>

        {isMap ? (
          <div className="rounded-md bg-muted/40 px-3 py-2">{facilitySourceNodes}</div>
        ) : (
          <div className="rounded-md bg-muted/40 px-3 py-2 lg:hidden">{ppfSourceNodes}</div>
        )}

        {isMap && (
          <NearestPanel
            pin={pin}
            loading={nearest.loading}
            error={nearest.error ?? geoError}
            data={nearest.data}
            filtered={Boolean(query.care.length || query.own.length || query.type)}
            onClear={() => setPin(null)}
            onFocus={(lng, lat) => mapRef.current?.flyTo({ center: [lng, lat], zoom: Math.max(mapRef.current.getZoom(), 13) })}
          />
        )}
      </section>
    </div>
  );
}

function NearestPanel({
  pin,
  loading,
  error,
  data,
  filtered,
  onClear,
  onFocus,
}: {
  pin: { lng: number; lat: number } | null;
  loading: boolean;
  error: string | null;
  data: NearestResponse | undefined;
  filtered: boolean;
  onClear: () => void;
  onFocus: (lng: number, lat: number) => void;
}) {
  if (!pin) {
    return (
      <p className="rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
        <MapPin className="mr-1 inline h-4 w-4 align-text-bottom" aria-hidden />
        Tap anywhere on the map (or use &ldquo;Nearest to me&rdquo;) to list the 10 nearest
        facilities{filtered ? " matching your filters" : ""}.
        {error && <span className="mt-1 block text-red-700">{error}</span>}
      </p>
    );
  }
  return (
    <section aria-labelledby="nearest-heading" className="rounded-lg border border-border p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 id="nearest-heading" className="text-sm font-semibold">
          Nearest facilities{filtered ? " matching your filters" : ""}
          <span className="ml-1 font-normal text-muted-foreground">
            to {pin.lat.toFixed(4)}, {pin.lng.toFixed(4)}
          </span>
        </h2>
        <button
          type="button"
          onClick={onClear}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
          Clear
        </button>
      </div>
      {loading && <Spinner />}
      {error && <Alert variant="destructive">{error}</Alert>}
      {data && data.facilities.length === 0 && (
        <p className="text-sm text-muted-foreground">No facilities found.</p>
      )}
      {data && data.facilities.length > 0 && (
        <ol className="divide-y divide-border text-sm">
          {data.facilities.map((f, i) => (
            <li key={f.id} className="flex items-start gap-3 py-1.5">
              <span className="w-5 shrink-0 pt-0.5 text-right text-xs tabular-nums text-muted-foreground">{i + 1}</span>
              <button
                type="button"
                onClick={() => onFocus(f.lng, f.lat)}
                className="min-w-0 flex-1 text-left hover:underline"
              >
                <span className="block truncate font-medium">{f.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {f.type} · {OWNERSHIP_LABELS[f.ownership] ?? f.ownership}
                  {f.lgaName ? ` · ${f.lgaName}` : ""}
                </span>
              </button>
              <span className="shrink-0 tabular-nums">{formatDistance(f.meters)}</span>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        Straight-line distance, not travel distance or time.
      </p>
    </section>
  );
}

/** [[w,s],[e,n]] of any FeatureCollection's coordinates. */
function boundsOf(fc: GeoJSON.FeatureCollection): [[number, number], [number, number]] | null {
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
  if (!Number.isFinite(w)) return null;
  // Pad a single point so fitBounds has an area to frame.
  if (w === e && s === n) return [[w - 0.05, s - 0.05], [e + 0.05, n + 0.05]];
  return [[w, s], [e, n]];
}
