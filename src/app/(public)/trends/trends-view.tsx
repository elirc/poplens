"use client";

import { Alert } from "@/components/ui/misc";
import { ControlPanel } from "@/components/analytics/controls";
import { IndicatorSelect } from "@/components/analytics/indicator-select";
import { PlaceChips, PlacePicker } from "@/components/analytics/place-picker";
import { seriesColor } from "@/components/analytics/palette";
import { MAX_TREND_PLACES, trendsHref } from "@/components/analytics/params";
import type { IndicatorOption, PlaceOption, TrendsData } from "@/components/analytics/types";
import { useUrlNav } from "@/components/analytics/use-url-nav";
import { NO_DATA } from "@/lib/format";
import { TrendsChart } from "./trends-chart";

export function TrendsView({
  data,
  indicators,
  quickPlaces,
}: {
  data: TrendsData;
  indicators: IndicatorOption[];
  quickPlaces: PlaceOption[];
}) {
  const { go, pending } = useUrlNav();
  const placeCodes = data.places.map((p) => p.code);
  const colors = data.places.map((_, i) => seriesColor(i));
  const setPlaces = (places: string[]) => go(trendsHref({ indicator: data.indicator.code, places }));
  const hasAny = data.series.some((s) => s.points.length > 0);

  return (
    <div className="space-y-4">
      <ControlPanel pending={pending}>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <IndicatorSelect
            indicators={indicators}
            value={data.indicator.code}
            onChange={(code) => go(trendsHref({ indicator: code, places: placeCodes }))}
            disabled={pending}
          />
          <div className="space-y-2">
            <PlaceChips
              places={data.places}
              colors={colors}
              disabled={pending}
              onRemove={(code) => setPlaces(placeCodes.filter((c) => c !== code))}
            />
            <PlacePicker
              selected={data.places}
              quickOptions={quickPlaces}
              max={MAX_TREND_PLACES}
              onChange={setPlaces}
              disabled={pending}
              label="Places (one line each)"
            />
          </div>
        </div>
      </ControlPanel>

      {data.unknownPlaces.length > 0 && (
        <Alert variant="warning">Unknown place code(s) ignored: {data.unknownPlaces.join(", ")}.</Alert>
      )}

      {data.places.length === 0 ? (
        <Alert>Add at least one place to draw its trend.</Alert>
      ) : !hasAny ? (
        <Alert>
          {NO_DATA}: {data.indicator.name} has no published values for the selected places.
        </Alert>
      ) : (
        <div className={pending ? "opacity-70 transition-opacity" : ""}>
          <TrendsChart indicator={data.indicator} series={data.series} colors={colors} />
        </div>
      )}
    </div>
  );
}
