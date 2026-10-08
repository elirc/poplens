"use client";

import { X } from "lucide-react";
import { Alert } from "@/components/ui/misc";
import { ControlPanel } from "@/components/analytics/controls";
import { IndicatorSelect } from "@/components/analytics/indicator-select";
import { PlaceChips, PlacePicker } from "@/components/analytics/place-picker";
import { seriesColor } from "@/components/analytics/palette";
import {
  MAX_COMPARE_INDICATORS,
  MAX_COMPARE_PLACES,
  compareHref,
} from "@/components/analytics/params";
import type { CompareData, IndicatorOption, PlaceOption } from "@/components/analytics/types";
import { useUrlNav } from "@/components/analytics/use-url-nav";
import { CompareChart } from "./compare-chart";

export function CompareView({
  data,
  indicators,
  quickPlaces,
}: {
  data: CompareData;
  indicators: IndicatorOption[];
  quickPlaces: PlaceOption[];
}) {
  const { go, pending } = useUrlNav();
  const placeCodes = data.places.map((p) => p.code);
  const indicatorCodes = data.charts.map((c) => c.indicator.code);
  const colors = data.places.map((_, i) => seriesColor(i));
  const colorFor = (code: string) => colors[placeCodes.indexOf(code)] ?? seriesColor(0);

  const setPlaces = (places: string[]) => go(compareHref({ places, indicators: indicatorCodes }));
  const setIndicators = (inds: string[]) => go(compareHref({ places: placeCodes, indicators: inds }));
  const byCode = new Map(indicators.map((i) => [i.code, i]));

  return (
    <div className="space-y-4">
      {/* Sticky place header: the chips stay visible while scrolling through charts. */}
      <div className="sticky top-14 z-30 -mx-3 border-b border-border bg-background/95 px-3 py-2 backdrop-blur sm:-mx-4 sm:px-4">
        <PlaceChips
          places={data.places}
          colors={colors}
          disabled={pending}
          onRemove={(code) => setPlaces(placeCodes.filter((c) => c !== code))}
        />
      </div>

      <ControlPanel pending={pending}>
        <div className="grid gap-4 lg:grid-cols-2">
          <PlacePicker
            selected={data.places}
            quickOptions={quickPlaces}
            max={MAX_COMPARE_PLACES}
            onChange={setPlaces}
            disabled={pending}
            label="Places to compare"
          />
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground">
              Indicators ({indicatorCodes.length} of {MAX_COMPARE_INDICATORS})
            </span>
            <ul className="flex flex-wrap gap-1.5" aria-label="Selected indicators">
              {indicatorCodes.map((code) => (
                <li
                  key={code}
                  className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-card py-1 pl-2.5 pr-1 text-sm"
                >
                  <span className="truncate">{byCode.get(code)?.name ?? code}</span>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setIndicators(indicatorCodes.filter((c) => c !== code))}
                    aria-label={`Remove ${byCode.get(code)?.name ?? code}`}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
            {indicatorCodes.length < MAX_COMPARE_INDICATORS ? (
              <IndicatorSelect
                indicators={indicators}
                value={null}
                exclude={indicatorCodes}
                onChange={(code) => setIndicators([...indicatorCodes, code])}
                label="Add an indicator"
                placeholder="Add an indicator…"
                disabled={pending}
              />
            ) : (
              <p className="text-xs text-muted-foreground">
                Up to {MAX_COMPARE_INDICATORS} indicators — remove one to add another.
              </p>
            )}
          </div>
        </div>
      </ControlPanel>

      {(data.unknownPlaces.length > 0 || data.unknownIndicators.length > 0) && (
        <Alert variant="warning">
          {data.unknownPlaces.length > 0 && <p>Unknown place code(s) ignored: {data.unknownPlaces.join(", ")}.</p>}
          {data.unknownIndicators.length > 0 && (
            <p>Unknown indicator code(s) ignored: {data.unknownIndicators.join(", ")}.</p>
          )}
        </Alert>
      )}

      {data.places.length === 0 ? (
        <Alert>Add up to {MAX_COMPARE_PLACES} places above to compare them side by side.</Alert>
      ) : data.charts.length === 0 ? (
        <Alert>Add an indicator above to see a chart for each one.</Alert>
      ) : (
        <div className={`grid gap-3 md:grid-cols-2 ${pending ? "opacity-70 transition-opacity" : ""}`}>
          {data.charts.map((c) => (
            <CompareChart key={c.indicator.code} chart={c} colorFor={colorFor} />
          ))}
        </div>
      )}
    </div>
  );
}
