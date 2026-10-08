"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { Circle, Hexagon, Link2, LogIn, MapPin, Play, Undo2, X } from "lucide-react";
import { Layer, Marker, Source, type MapLayerMouseEvent, type MapRef } from "react-map-gl/maplibre";
import { NO_DATA, compactNumber, formatValue, type IndicatorMeta } from "@/lib/format";
import { SourceLine } from "@/components/data/source-line";
import { StatTile } from "@/components/data/stat-tile";
import { Alert, Checkbox, Spinner } from "@/components/ui/misc";
import { BaseMap } from "@/components/map/base-map";
import { FACILITY_LEVEL_LABELS, FacilityLayer, FacilityLegend } from "@/components/map/facility-layer";
import { useJson } from "@/components/map/use-json";
import { runAreaAnalysis, type AreaActionResult } from "./actions";
import {
  MAX_VERTICES,
  RADIUS_MAX_KM,
  RADIUS_MIN_KM,
  decodeShapeHash,
  encodeShapeHash,
  shapeAreaSqKm,
  shapeBounds,
  shapeToPolygon,
  validateAreaShape,
  type AreaShape,
  type LngLat,
} from "./_lib/shape";
import type { AreaAnalysisResult, AreaQuotaView } from "./_lib/types";

/* ── URL-hash store (the shareable shape lives in location.hash) ─────── */

const hashListeners = new Set<() => void>();
function subscribeHash(cb: () => void) {
  hashListeners.add(cb);
  window.addEventListener("hashchange", cb);
  return () => {
    hashListeners.delete(cb);
    window.removeEventListener("hashchange", cb);
  };
}
const readHash = () => window.location.hash;
const serverHash = () => "";
function writeHash(shape: AreaShape | null) {
  const next = shape ? `#${encodeShapeHash(shape)}` : "";
  if (window.location.hash === next || (!next && !window.location.hash)) return;
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${next}`);
  for (const l of hashListeners) l();
}

/* ── editing state ───────────────────────────────────────────────────── */

type Mode = "circle" | "polygon";
interface Edit {
  mode: Mode;
  center: LngLat | null;
  radiusKm: number;
  vertices: LngLat[];
  closed: boolean;
}
const DEFAULT_EDIT: Edit = { mode: "circle", center: null, radiusKm: 5, vertices: [], closed: false };

function editFromShape(shape: AreaShape | null): Edit {
  if (!shape) return DEFAULT_EDIT;
  if (shape.kind === "circle") {
    return { ...DEFAULT_EDIT, mode: "circle", center: shape.center, radiusKm: shape.radiusKm };
  }
  return { ...DEFAULT_EDIT, mode: "polygon", vertices: shape.coordinates, closed: true };
}

function shapeFromEdit(e: Edit): AreaShape | null {
  if (e.mode === "circle") return e.center ? { kind: "circle", center: e.center, radiusKm: e.radiusKm } : null;
  return e.closed && e.vertices.length >= 3 ? { kind: "polygon", coordinates: e.vertices } : null;
}

const SHAPE_COLOR = "#0072B2";
const COUNT_META: IndicatorMeta = { unit: "people", valueType: "count", decimals: 0 };

export function AreaTool({
  styleUrl,
  signedIn,
  initialQuota,
}: {
  styleUrl: string;
  signedIn: boolean;
  initialQuota: AreaQuotaView | null;
}) {
  const mapRef = useRef<MapRef>(null);
  const hash = useSyncExternalStore(subscribeHash, readHash, serverHash);
  const hashShape = useMemo(() => decodeShapeHash(hash), [hash]);
  const [localEdit, setLocalEdit] = useState<Edit | null>(null);
  const edit = useMemo(() => localEdit ?? editFromShape(hashShape), [localEdit, hashShape]);

  const [showFacilities, setShowFacilities] = useState(false);
  const [quota, setQuota] = useState<AreaQuotaView | null>(initialQuota);
  const [outcome, setOutcome] = useState<{ key: string; res: AreaActionResult } | null>(null);
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const hashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const shape = useMemo(() => shapeFromEdit(edit), [edit]);
  const check = shape ? validateAreaShape(shape) : null;
  const shapeKey = shape ? encodeShapeHash(shape) : "";

  const facilities = useJson<GeoJSON.FeatureCollection>(showFacilities ? "/api/facilities" : null);

  /** Apply an edit and mirror the complete shape into the URL hash (debounced). */
  const apply = useCallback((next: Edit) => {
    setLocalEdit(next);
    if (hashTimer.current) clearTimeout(hashTimer.current);
    hashTimer.current = setTimeout(() => writeHash(shapeFromEdit(next)), 250);
  }, []);

  const onClick = useCallback(
    (e: MapLayerMouseEvent) => {
      const p: LngLat = [e.lngLat.lng, e.lngLat.lat];
      if (edit.mode === "circle") {
        apply({ ...edit, center: p });
        return;
      }
      if (edit.closed) return;
      // Clicking near the first vertex closes the shape.
      const first = edit.vertices[0];
      const map = mapRef.current;
      if (first && edit.vertices.length >= 3 && map) {
        const a = map.project(first);
        const b = e.point;
        if (Math.hypot(a.x - b.x, a.y - b.y) < 12) {
          apply({ ...edit, closed: true });
          return;
        }
      }
      if (edit.vertices.length >= MAX_VERTICES) return;
      apply({ ...edit, vertices: [...edit.vertices, p] });
    },
    [edit, apply],
  );

  function run() {
    if (!shape || !check?.ok) return;
    const key = shapeKey;
    startTransition(async () => {
      const res = await runAreaAnalysis(shape);
      setOutcome({ key, res });
      if (res.quota) setQuota(res.quota);
    });
  }

  async function copyLink() {
    try {
      writeHash(shape);
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — the URL bar still has the link */
    }
  }

  function onMapLoad() {
    if (hashShape && mapRef.current) {
      mapRef.current.fitBounds(shapeBounds(hashShape), { padding: 40, duration: 0, maxZoom: 13 });
    }
  }

  /* ── map overlays ─────────────────────────────────────────────────── */

  const shapeFc = useMemo<GeoJSON.FeatureCollection | null>(
    () => (shape ? { type: "FeatureCollection", features: [{ type: "Feature", geometry: shapeToPolygon(shape), properties: {} }] } : null),
    [shape],
  );
  const draftFc = useMemo<GeoJSON.FeatureCollection | null>(() => {
    if (edit.mode !== "polygon" || edit.closed || edit.vertices.length === 0) return null;
    const features: GeoJSON.Feature[] = edit.vertices.map((v, i) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: v },
      properties: { first: i === 0 },
    }));
    if (edit.vertices.length >= 2) {
      features.push({ type: "Feature", geometry: { type: "LineString", coordinates: edit.vertices }, properties: {} });
    }
    return { type: "FeatureCollection", features };
  }, [edit]);

  const ok = outcome?.res.ok ? outcome.res : null;
  const stale = Boolean(outcome && outcome.key !== shapeKey);
  const quotaExhausted = quota?.remaining === 0;

  return (
    <div className="grid gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="space-y-4 rounded-lg border border-border p-3 lg:sticky lg:top-16 lg:self-start" aria-label="Area controls">
        <div role="radiogroup" aria-label="Shape" className="grid grid-cols-2 rounded-md border border-border text-sm">
          {(
            [
              { m: "circle", label: "Pin + radius", icon: Circle },
              { m: "polygon", label: "Draw shape", icon: Hexagon },
            ] as const
          ).map(({ m, label, icon: Icon }, i) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={edit.mode === m}
              onClick={() => edit.mode !== m && apply({ ...DEFAULT_EDIT, mode: m, radiusKm: edit.radiusKm })}
              className={`inline-flex items-center justify-center gap-1 py-1.5 ${i === 0 ? "rounded-l-md" : "rounded-r-md"} ${
                edit.mode === m ? "bg-emerald-700 font-medium text-white" : "hover:bg-muted"
              }`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {label}
            </button>
          ))}
        </div>

        {edit.mode === "circle" ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {edit.center ? "Tap the map to move the pin." : "Tap the map to drop a pin."}
            </p>
            <label className="block text-sm">
              <span className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                Radius <span className="tabular-nums text-foreground">{edit.radiusKm} km</span>
              </span>
              <input
                type="range"
                min={RADIUS_MIN_KM}
                max={RADIUS_MAX_KM}
                step={1}
                value={edit.radiusKm}
                onChange={(e) => apply({ ...edit, radiusKm: Number(e.target.value) })}
                className="mt-1 w-full accent-emerald-700"
                aria-valuetext={`${edit.radiusKm} kilometres`}
              />
              <span className="flex justify-between text-[11px] text-muted-foreground">
                <span>{RADIUS_MIN_KM} km</span>
                <span>{RADIUS_MAX_KM} km</span>
              </span>
            </label>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {edit.closed
                ? "Shape finished. Clear it to draw another."
                : `Tap the map to add points (${edit.vertices.length}/${MAX_VERTICES}). Tap the first point or press Finish to close the shape.`}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={edit.closed || edit.vertices.length === 0}
                onClick={() => apply({ ...edit, vertices: edit.vertices.slice(0, -1) })}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
              >
                <Undo2 className="h-3.5 w-3.5" aria-hidden /> Undo point
              </button>
              <button
                type="button"
                disabled={edit.closed || edit.vertices.length < 3}
                onClick={() => apply({ ...edit, closed: true })}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
              >
                Finish shape
              </button>
            </div>
          </div>
        )}

        {shape && (
          <p className="text-xs text-muted-foreground">
            Area ≈ <span className="tabular-nums">{Math.round(shapeAreaSqKm(shape)).toLocaleString("en-NG")}</span> km²
          </p>
        )}
        {check && !check.ok && <Alert variant="warning">{check.error}</Alert>}

        <div className="flex flex-wrap gap-2">
          {signedIn ? (
            <button
              type="button"
              onClick={run}
              disabled={!shape || !check?.ok || pending || quotaExhausted}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              {pending ? <Spinner className="border-white border-t-transparent" /> : <Play className="h-4 w-4" aria-hidden />}
              Run analysis
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => apply({ ...DEFAULT_EDIT, mode: edit.mode, radiusKm: edit.radiusKm })}
            disabled={!edit.center && edit.vertices.length === 0}
            className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
          >
            <X className="h-4 w-4" aria-hidden /> Clear
          </button>
          {shape && (
            <button
              type="button"
              onClick={copyLink}
              className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
            >
              <Link2 className="h-4 w-4" aria-hidden /> {copied ? "Copied" : "Copy link"}
            </button>
          )}
        </div>

        {signedIn ? (
          quota && (
            <p className={`text-xs ${quotaExhausted ? "text-amber-800" : "text-muted-foreground"}`} aria-live="polite">
              {quota.message}
              {quota.limit !== null && (
                <>
                  {" "}
                  <Link href="/pricing" className="font-medium text-emerald-700 hover:underline">
                    Pro has no daily limit
                  </Link>
                </>
              )}
            </p>
          )
        ) : (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
            <p className="font-medium">Sign in to run the analysis</p>
            <p className="mt-0.5 text-xs">
              You can draw freely. Running an analysis needs a free account — 3 analyses a day, or
              unlimited on Pro.
            </p>
            <Link
              href="/sign-in?next=/area"
              className="mt-2 inline-flex items-center gap-1 rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800"
            >
              <LogIn className="h-3.5 w-3.5" aria-hidden /> Sign in or create an account
            </Link>
          </div>
        )}

        <div className="space-y-1.5 border-t border-border pt-3">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={showFacilities} onChange={(e) => setShowFacilities(e.target.checked)} />
            Show health facilities
            {facilities.loading && <Spinner className="h-3 w-3" />}
          </label>
          {showFacilities && <FacilityLegend />}
        </div>
      </aside>

      <section className="min-w-0 space-y-3">
        <BaseMap
          ref={mapRef}
          styleUrl={styleUrl}
          className="h-[55vh] min-h-[320px] lg:h-[calc(100vh-14rem)]"
          label="Map for drawing an analysis area"
          cursor="crosshair"
          onClick={onClick}
          onLoad={onMapLoad}
        >
          {showFacilities && facilities.data && <FacilityLayer id="area-facilities" data={facilities.data} />}
          {shapeFc && (
            <Source id="area-shape" type="geojson" data={shapeFc}>
              <Layer id="area-shape-fill" type="fill" paint={{ "fill-color": SHAPE_COLOR, "fill-opacity": 0.14 }} />
              <Layer id="area-shape-line" type="line" paint={{ "line-color": SHAPE_COLOR, "line-width": 2 }} />
            </Source>
          )}
          {draftFc && (
            <Source id="area-draft" type="geojson" data={draftFc}>
              <Layer
                id="area-draft-line"
                type="line"
                filter={["==", ["geometry-type"], "LineString"]}
                paint={{ "line-color": SHAPE_COLOR, "line-width": 2, "line-dasharray": [2, 1.5] }}
              />
              <Layer
                id="area-draft-points"
                type="circle"
                filter={["==", ["geometry-type"], "Point"]}
                paint={{
                  "circle-radius": ["case", ["get", "first"], 7, 4.5],
                  "circle-color": "#ffffff",
                  "circle-stroke-color": SHAPE_COLOR,
                  "circle-stroke-width": 2,
                }}
              />
            </Source>
          )}
          {edit.mode === "circle" && edit.center && (
            <Marker longitude={edit.center[0]} latitude={edit.center[1]} anchor="bottom">
              <MapPin className="h-7 w-7 fill-red-600 text-white drop-shadow" aria-label="Pin" />
            </Marker>
          )}
        </BaseMap>

        {outcome && !outcome.res.ok && (
          <Alert variant={outcome.res.code === "error" ? "destructive" : "warning"}>
            {outcome.res.message}
            {outcome.res.code === "auth" && (
              <>
                {" "}
                <Link href="/sign-in?next=/area" className="font-medium underline">
                  Sign in
                </Link>
              </>
            )}
          </Alert>
        )}

        {ok ? (
          <AreaResults result={ok.result} stale={stale} />
        ) : (
          !outcome && (
            <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
              Results appear here: estimated population inside, health facilities by type, people
              per facility and the LGAs touched.
            </p>
          )
        )}
      </section>
    </div>
  );
}

/* ── results panel ───────────────────────────────────────────────────── */

function popSourceName(r: AreaAnalysisResult): string | undefined {
  const s = r.populationSource;
  if (!s) return undefined;
  const who = s.publisher ?? "Population grid";
  const label = s.isSynthetic ? `${who} (SYNTHETIC demo data)` : who;
  return s.sourceVersion ? `${label} — population grid ${s.sourceVersion}` : `${label} — population grid`;
}

function AreaResults({ result: r, stale }: { result: AreaAnalysisResult; stale: boolean }) {
  const p = r.population;
  const popSource = popSourceName(r);
  const year = r.populationSource?.year ?? null;
  const partial = (n: number) => (n > 0 && n < p.cells ? `Available for ${n.toLocaleString("en-NG")} of ${p.cells.toLocaleString("en-NG")} cells` : null);
  const facilityLabel = r.facilitySources
    .map((s) => `${s.isSynthetic ? `${s.publisher} (SYNTHETIC demo data)` : s.publisher}${s.sourceVersion ? ` ${s.sourceVersion}` : ""}`)
    .join("; ");

  return (
    <section aria-labelledby="area-results-heading" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="area-results-heading" className="text-base font-semibold">
          Inside this area{" "}
          <span className="font-normal text-muted-foreground">
            · ≈{Math.round(r.shapeAreaSqKm).toLocaleString("en-NG")} km²
          </span>
        </h2>
        {stale && (
          <p className="text-xs text-amber-800">The shape has changed since this analysis — run it again to update.</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <StatTile
          label="Estimated population"
          value={p.total}
          meta={COUNT_META}
          sourceName={popSource}
          year={year}
          isEstimate
        />
        <div className="flex flex-col">
          <StatTile label="Children under 5" value={p.under5} meta={COUNT_META} sourceName={popSource} year={year} isEstimate />
          {partial(p.under5Cells) && <p className="mt-1 text-[11px] text-muted-foreground">{partial(p.under5Cells)}</p>}
        </div>
        <div className="flex flex-col">
          <StatTile label="Women aged 15–49" value={p.women1549} meta={COUNT_META} sourceName={popSource} year={year} isEstimate />
          {partial(p.women1549Cells) && <p className="mt-1 text-[11px] text-muted-foreground">{partial(p.women1549Cells)}</p>}
        </div>
        <div className="flex h-full flex-col rounded-lg border border-border bg-card p-3">
          <p className="text-xs font-medium text-muted-foreground">People per facility</p>
          <p className={`mt-1 text-2xl font-semibold tabular-nums ${r.peoplePerFacility == null ? "text-muted-foreground" : ""}`}>
            {r.peoplePerFacility == null ? NO_DATA : compactNumber(r.peoplePerFacility)}
          </p>
          <p className="text-xs text-muted-foreground">
            {r.facilities.total === 0 ? "No facilities inside" : `${r.facilities.total.toLocaleString("en-NG")} facilities inside`}
          </p>
          {r.peoplePerFacility != null && (
            <SourceLine
              sourceName="Estimated population ÷ facilities inside"
              year={year}
              isEstimate
              className="mt-auto pt-2"
            />
          )}
        </div>
      </div>

      {p.total == null && (
        <Alert>
          {r.populationSource
            ? "No population cell centres fall inside this shape, so there is no population estimate. Try a larger area."
            : "No published population grid is loaded, so there is no population estimate."}
        </Alert>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-border p-3">
          <h3 className="mb-2 text-sm font-medium">Health facilities by type</h3>
          {r.facilities.total === 0 ? (
            <p className="text-sm text-muted-foreground">No health facilities inside this area.</p>
          ) : (
            <table className="w-full text-sm">
              <caption className="sr-only">Facilities inside the area by type</caption>
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-1 font-medium">Type</th>
                  <th className="py-1 text-right font-medium">Facilities</th>
                </tr>
              </thead>
              <tbody>
                {r.facilities.byType.map((t) => (
                  <tr key={t.type} className="border-b border-border/60 last:border-0">
                    <td className="py-1">{t.type}</td>
                    <td className="py-1 text-right tabular-nums">{t.count.toLocaleString("en-NG")}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="text-xs text-muted-foreground">
                  <td className="pt-2" colSpan={2}>
                    {(Object.keys(r.facilities.byCareLevel) as Array<keyof typeof r.facilities.byCareLevel>)
                      .map((k) => `${FACILITY_LEVEL_LABELS[k]}: ${r.facilities.byCareLevel[k].toLocaleString("en-NG")}`)
                      .join(" · ")}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
          {facilityLabel && <SourceLine sourceName={facilityLabel} className="mt-2" />}
        </div>

        <div className="rounded-lg border border-border p-3">
          <h3 className="mb-2 text-sm font-medium">
            LGAs touched <span className="font-normal text-muted-foreground">({r.lgas.length})</span>
          </h3>
          {r.lgas.length === 0 ? (
            <p className="text-sm text-muted-foreground">This area does not touch any LGA boundary.</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {r.lgas.map((l) => (
                <li key={l.id}>
                  <Link
                    href={`/places/${encodeURIComponent(l.code)}`}
                    className="inline-block rounded-full border border-border px-2.5 py-0.5 text-xs hover:bg-muted"
                    title={l.stateName ? `${l.name}, ${l.stateName}` : l.name}
                  >
                    {l.name}
                    {l.stateName && <span className="text-muted-foreground"> · {l.stateName}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Estimate from ~1 km population cells: a cell is counted when its centre lies inside the
        shape, so populations near the edge are approximate and very small shapes may contain no
        cells. Facilities are counted by their mapped location.
        {r.populationSource && (
          <>
            {" "}
            Population: {formatValue(p.cells, { unit: "cells", valueType: "count", decimals: 0 }, { compact: false })}{" "}
            cells from {popSourceName(r)} ({r.populationSource.year}).
          </>
        )}
      </p>
    </section>
  );
}
