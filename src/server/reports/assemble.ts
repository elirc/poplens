import { formatCI, formatValue, type IndicatorMeta } from "@/lib/format";

/**
 * Pure report-data assembly: turns published values (as returned by the
 * shared indicator queries) into the tables, bar data and source-aware trend
 * segments the PDF draws. No database, no rendering — unit-tested.
 *
 * Rules carried over from the spec:
 *  - missing data stays null and renders "No data", never 0;
 *  - each value keeps its source, year, estimate flag and CI;
 *  - trend lines are split into segments wherever the source changes.
 */

export interface ReportPlace {
  id: number;
  code: string;
  name: string;
  level: string;
}

export interface ReportIndicator extends IndicatorMeta {
  id: number;
  code: string;
  name: string;
  definition: string;
  higherIsBetter: boolean | null;
}

/** Subset of PublicValue (src/server/indicators/queries.ts) the report needs. */
export interface ReportValueInput {
  geoUnitId: number;
  year: number;
  periodLabel: string | null;
  value: number;
  lower: number | null;
  upper: number | null;
  isEstimate: boolean;
  datasetId: number;
  datasetTitle: string;
  isSynthetic: boolean;
  sourceId: number;
  sourceKey: string;
  sourcePublisher: string;
  sourceTitle: string;
}

export interface ReportRow {
  place: ReportPlace;
  value: number | null;
  display: string;
  ci: string;
  year: number | null;
  periodLabel: string | null;
  isEstimate: boolean;
  isSynthetic: boolean;
  source: string | null;
}

export interface TrendSegment {
  sourceKey: string;
  points: Array<{ year: number; value: number }>;
}

export interface TrendLine {
  place: ReportPlace;
  segments: TrendSegment[];
  /** Years at which the source changed (marked on the chart). */
  sourceBreaks: number[];
}

export interface ReportSection {
  indicator: ReportIndicator;
  rows: ReportRow[];
  bars: Array<{ label: string; value: number }>;
  trend: { lines: TrendLine[]; minYear: number; maxYear: number; minValue: number; maxValue: number } | null;
  sources: string[];
  hasData: boolean;
}

export interface ReportSourceRef {
  sourceId: number;
  publisher: string;
  title: string;
  datasetTitle: string;
  isSynthetic: boolean;
}

export interface ReportModel {
  places: ReportPlace[];
  sections: ReportSection[];
  sources: ReportSourceRef[];
  anySynthetic: boolean;
  year: number | null;
}

/** One value per (place, year): the most recent dataset wins on ties. */
export function dedupeByYear(rows: ReportValueInput[]): Map<number, Map<number, ReportValueInput>> {
  const out = new Map<number, Map<number, ReportValueInput>>();
  for (const r of rows) {
    let byYear = out.get(r.geoUnitId);
    if (!byYear) out.set(r.geoUnitId, (byYear = new Map()));
    const prev = byYear.get(r.year);
    if (!prev || r.datasetId > prev.datasetId) byYear.set(r.year, r);
  }
  return out;
}

/** Split a year-ordered series into runs that share one source. */
export function segmentBySource(points: ReportValueInput[]): { segments: TrendSegment[]; breaks: number[] } {
  const segments: TrendSegment[] = [];
  const breaks: number[] = [];
  for (const p of points) {
    const last = segments[segments.length - 1];
    if (last && last.sourceKey === p.sourceKey) last.points.push({ year: p.year, value: p.value });
    else {
      if (last) breaks.push(p.year);
      segments.push({ sourceKey: p.sourceKey, points: [{ year: p.year, value: p.value }] });
    }
  }
  return { segments, breaks };
}

function sourceLabel(v: ReportValueInput): string {
  return `${v.sourcePublisher} — ${v.datasetTitle}`;
}

export function assembleReport(input: {
  places: ReportPlace[];
  indicators: ReportIndicator[];
  /** Published rows per indicator id, for all report places. */
  valuesByIndicator: Map<number, ReportValueInput[]>;
  year?: number | null;
}): ReportModel {
  const year = input.year ?? null;
  const sourceMap = new Map<string, ReportSourceRef>();
  let anySynthetic = false;

  const sections: ReportSection[] = input.indicators.map((indicator) => {
    const rowsIn = input.valuesByIndicator.get(indicator.id) ?? [];
    const byPlace = dedupeByYear(rowsIn);
    const sectionSources = new Set<string>();

    const rows: ReportRow[] = input.places.map((place) => {
      const byYear = byPlace.get(place.id);
      let pick: ReportValueInput | undefined;
      if (byYear) {
        if (year !== null) pick = byYear.get(year);
        else {
          const latest = Math.max(...byYear.keys());
          pick = byYear.get(latest);
        }
      }
      if (!pick) {
        return {
          place,
          value: null,
          display: formatValue(null, indicator),
          ci: "",
          year: null,
          periodLabel: null,
          isEstimate: false,
          isSynthetic: false,
          source: null,
        };
      }
      const label = sourceLabel(pick);
      sectionSources.add(label);
      if (pick.isSynthetic) anySynthetic = true;
      sourceMap.set(`${pick.sourceId}:${pick.datasetTitle}`, {
        sourceId: pick.sourceId,
        publisher: pick.sourcePublisher,
        title: pick.sourceTitle,
        datasetTitle: pick.datasetTitle,
        isSynthetic: pick.isSynthetic,
      });
      return {
        place,
        value: pick.value,
        display: formatValue(pick.value, indicator, { compact: false }),
        ci: formatCI(pick.lower, pick.upper, indicator),
        year: pick.year,
        periodLabel: pick.periodLabel,
        isEstimate: pick.isEstimate,
        isSynthetic: pick.isSynthetic,
        source: label,
      };
    });

    const bars = rows
      .filter((r): r is ReportRow & { value: number } => r.value !== null)
      .map((r) => ({ label: r.place.name, value: r.value }));

    const lines: TrendLine[] = [];
    let minYear = Infinity;
    let maxYear = -Infinity;
    let minValue = Infinity;
    let maxValue = -Infinity;
    for (const place of input.places) {
      const byYear = byPlace.get(place.id);
      if (!byYear || byYear.size === 0) continue;
      const pts = [...byYear.values()].sort((a, b) => a.year - b.year);
      for (const p of pts) {
        minYear = Math.min(minYear, p.year);
        maxYear = Math.max(maxYear, p.year);
        minValue = Math.min(minValue, p.value);
        maxValue = Math.max(maxValue, p.value);
        if (p.isSynthetic) anySynthetic = true;
        sectionSources.add(sourceLabel(p));
        sourceMap.set(`${p.sourceId}:${p.datasetTitle}`, {
          sourceId: p.sourceId,
          publisher: p.sourcePublisher,
          title: p.sourceTitle,
          datasetTitle: p.datasetTitle,
          isSynthetic: p.isSynthetic,
        });
      }
      const { segments, breaks } = segmentBySource(pts);
      lines.push({ place, segments, sourceBreaks: breaks });
    }
    const multiYear = lines.some((l) => l.segments.reduce((n, s) => n + s.points.length, 0) > 1);

    return {
      indicator,
      rows,
      bars,
      trend: multiYear ? { lines, minYear, maxYear, minValue, maxValue } : null,
      sources: [...sectionSources].sort(),
      hasData: rows.some((r) => r.value !== null) || lines.length > 0,
    };
  });

  return {
    places: input.places,
    sections,
    sources: [...sourceMap.values()].sort((a, b) => a.publisher.localeCompare(b.publisher)),
    anySynthetic,
    year,
  };
}

/** Linear scale helper shared by the PDF charts. */
export function linearScale(domain: [number, number], range: [number, number]): (v: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  if (d1 === d0) return () => (r0 + r1) / 2;
  return (v) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
}

/** "Nice" upper bound for a bar axis: 0..niceMax(max). */
export function niceMax(max: number): number {
  if (!(max > 0)) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(max)));
  const f = max / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * exp;
}
