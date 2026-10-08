/**
 * Pure data preparation for trend charts. The spec forbids silently joining
 * values from different sources into one line, so each series is split into
 * SEGMENTS of consecutive points from the same source. Each segment becomes
 * its own chart line (same colour, alternating dash), and every point where
 * the source changes is reported so the chart can mark it.
 */

export interface TrendPoint {
  year: number;
  value: number;
  lower: number | null;
  upper: number | null;
  isEstimate: boolean;
  sourceId: number;
  /** Publisher + dataset label shown in tooltips/table. */
  sourceName: string;
}

export interface TrendSeriesInput {
  key: string;
  label: string;
  color: string;
  points: TrendPoint[];
}

export interface TrendLine {
  dataKey: string;
  seriesKey: string;
  label: string;
  color: string;
  segment: number;
  sourceName: string;
}

export interface SourceChange {
  seriesKey: string;
  seriesLabel: string;
  year: number;
  from: string;
  to: string;
}

export interface TrendChartData {
  rows: Array<Record<string, number | null>>;
  lines: TrendLine[];
  changes: SourceChange[];
  years: number[];
}

/** Sort by year and drop duplicate (year, source) points, keeping the first. */
export function cleanPoints(points: TrendPoint[]): TrendPoint[] {
  const seen = new Set<string>();
  return [...points]
    .sort((a, b) => a.year - b.year || a.sourceId - b.sourceId)
    .filter((p) => {
      const k = `${p.year}:${p.sourceId}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

/** Split a cleaned, year-ordered point list into same-source runs. */
export function splitBySource(points: TrendPoint[]): TrendPoint[][] {
  const segments: TrendPoint[][] = [];
  for (const p of points) {
    const last = segments[segments.length - 1];
    if (last && last[last.length - 1]!.sourceId === p.sourceId) last.push(p);
    else segments.push([p]);
  }
  return segments;
}

export function buildTrendChartData(series: TrendSeriesInput[]): TrendChartData {
  const lines: TrendLine[] = [];
  const changes: SourceChange[] = [];
  const byYear = new Map<number, Record<string, number | null>>();

  for (const s of series) {
    const segments = splitBySource(cleanPoints(s.points));
    segments.forEach((seg, i) => {
      const dataKey = `${s.key}__${i}`;
      lines.push({
        dataKey,
        seriesKey: s.key,
        label: s.label,
        color: s.color,
        segment: i,
        sourceName: seg[0]!.sourceName,
      });
      for (const p of seg) {
        const row = byYear.get(p.year) ?? { year: p.year };
        row[dataKey] = p.value;
        byYear.set(p.year, row);
      }
      if (i > 0) {
        const prev = segments[i - 1]!;
        changes.push({
          seriesKey: s.key,
          seriesLabel: s.label,
          year: seg[0]!.year,
          from: prev[prev.length - 1]!.sourceName,
          to: seg[0]!.sourceName,
        });
      }
    });
  }

  const years = [...byYear.keys()].sort((a, b) => a - b);
  // Every row carries every key (null where absent) so tooltips stay stable;
  // each segment line uses connectNulls, which only bridges its OWN points.
  const rows = years.map((y) => {
    const row = byYear.get(y)!;
    for (const l of lines) if (!(l.dataKey in row)) row[l.dataKey] = null;
    return row;
  });
  return { rows, lines, changes, years };
}
