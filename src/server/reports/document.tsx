import { Circle, Document, G, Line, Page, Path, Polyline, Rect, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import { formatLagosDate, formatValue } from "@/lib/format";
import { linearScale, niceMax, type ReportSection } from "./assemble";
import type { ReportData } from "./data";
import { projectFeatures } from "./geo-svg";

/**
 * The custom report PDF (React-PDF). Charts are simple SVG drawn here:
 * horizontal bars for the chosen/latest year, and trend lines split at
 * source changes (dashed marker). Maps are d3-geo Mercator paths fitted to
 * each frame. Colours: Okabe-Ito (colour-blind safe). Every table row
 * carries source, year and estimate flag; missing data prints "No data".
 */

const OKABE_ITO = ["#0072B2", "#E69F00", "#009E73", "#CC79A7", "#56B4E9", "#D55E00", "#F0E442", "#000000"];
const INK = "#1f2937";
const MUTED = "#6b7280";
const RULE = "#d1d5db";

const s = StyleSheet.create({
  page: { padding: 36, paddingBottom: 48, fontSize: 9, fontFamily: "Helvetica", color: INK },
  h1: { fontSize: 20, fontFamily: "Helvetica-Bold", marginBottom: 6 },
  h2: { fontSize: 13, fontFamily: "Helvetica-Bold", marginBottom: 4, marginTop: 8 },
  h3: { fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 3, marginTop: 6 },
  muted: { color: MUTED },
  small: { fontSize: 7.5, color: MUTED },
  p: { marginBottom: 4, lineHeight: 1.35 },
  warn: {
    borderWidth: 1,
    borderColor: "#d97706",
    backgroundColor: "#fffbeb",
    padding: 8,
    marginVertical: 8,
    color: "#78350f",
  },
  table: { borderTopWidth: 1, borderColor: RULE, marginTop: 4 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: RULE, paddingVertical: 3 },
  th: { fontFamily: "Helvetica-Bold", color: MUTED, fontSize: 7.5 },
  footer: { position: "absolute", bottom: 20, left: 36, right: 36, fontSize: 7, color: MUTED, flexDirection: "row", justifyContent: "space-between" },
  mapGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  mapCell: { width: 250, marginBottom: 10 },
  legendRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 3 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 3 },
  swatch: { width: 8, height: 8 },
});

const COLS = { place: 120, value: 70, ci: 90, year: 50, est: 34 };

function Footer({ title }: { title: string }) {
  return (
    <View style={s.footer} fixed>
      <Text>PopLens · {title}</Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  );
}

function BarChart({ section }: { section: ReportSection }) {
  const bars = section.bars;
  if (bars.length === 0) return null;
  const width = 520;
  const rowH = 16;
  const labelW = 120;
  const valueW = 60;
  const height = bars.length * rowH + 8;
  const max = Math.max(...bars.map((b) => b.value));
  const min = Math.min(0, ...bars.map((b) => b.value));
  const x = linearScale([min, niceMax(max)], [labelW, width - valueW]);
  const meta = section.indicator;
  return (
    <Svg width={width} height={height}>
      <Line x1={x(0)} x2={x(0)} y1={0} y2={height - 4} stroke={RULE} strokeWidth={0.75} />
      {bars.map((b, i) => {
        const y = i * rowH + 3;
        const x0 = x(Math.min(0, b.value));
        const w = Math.max(0.5, Math.abs(x(b.value) - x(0)));
        return (
          <G key={b.label}>
            <Text x={labelW - 4} y={y + 9} style={{ fontSize: 7.5 }} textAnchor="end" fill={INK}>
              {b.label.length > 26 ? `${b.label.slice(0, 25)}…` : b.label}
            </Text>
            <Rect x={x0} y={y} width={w} height={rowH - 5} fill={OKABE_ITO[0]} />
            <Text x={Math.max(x(b.value), x(0)) + 3} y={y + 9} style={{ fontSize: 7.5 }} fill={INK}>
              {formatValue(b.value, meta, { compact: true })}
            </Text>
          </G>
        );
      })}
    </Svg>
  );
}

function TrendChart({ section }: { section: ReportSection }) {
  const t = section.trend;
  if (!t) return null;
  const width = 520;
  const height = 170;
  const left = 50;
  const right = 12;
  const top = 10;
  const bottom = 22;
  const span = t.maxValue - t.minValue;
  const pad = span === 0 ? Math.abs(t.maxValue) * 0.1 || 1 : span * 0.08;
  const y = linearScale([t.minValue - pad, t.maxValue + pad], [height - bottom, top]);
  const x = linearScale([t.minYear, t.maxYear], [left, width - right]);
  const meta = section.indicator;
  const yTicks = [t.minValue, (t.minValue + t.maxValue) / 2, t.maxValue];
  const yearTicks = t.maxYear === t.minYear ? [t.minYear] : [t.minYear, Math.round((t.minYear + t.maxYear) / 2), t.maxYear];
  const breaks = new Set<number>();
  t.lines.forEach((l) => l.sourceBreaks.forEach((b) => breaks.add(b)));
  return (
    <View wrap={false}>
      <Svg width={width} height={height}>
        <Line x1={left} x2={width - right} y1={height - bottom} y2={height - bottom} stroke={RULE} strokeWidth={0.75} />
        {yTicks.map((v, i) => (
          <G key={`y${i}`}>
            <Line x1={left} x2={width - right} y1={y(v)} y2={y(v)} stroke="#eef0f3" strokeWidth={0.5} />
            <Text x={left - 4} y={y(v) + 3} style={{ fontSize: 7 }} textAnchor="end" fill={MUTED}>
              {formatValue(v, meta, { compact: true })}
            </Text>
          </G>
        ))}
        {yearTicks.map((yr) => (
          <Text key={`x${yr}`} x={x(yr)} y={height - bottom + 12} style={{ fontSize: 7 }} textAnchor="middle" fill={MUTED}>
            {String(yr)}
          </Text>
        ))}
        {[...breaks].map((b) => (
          <G key={`b${b}`}>
            <Line x1={x(b)} x2={x(b)} y1={top} y2={height - bottom} stroke={MUTED} strokeWidth={0.75} strokeDasharray="3,2" />
            <Text x={x(b) + 2} y={top + 7} style={{ fontSize: 6.5 }} fill={MUTED}>
              source changes
            </Text>
          </G>
        ))}
        {t.lines.map((line, li) => {
          const colour = OKABE_ITO[li % OKABE_ITO.length];
          return (
            <G key={line.place.code}>
              {line.segments.map((seg, si) =>
                seg.points.length === 1 ? (
                  <Circle key={si} cx={x(seg.points[0].year)} cy={y(seg.points[0].value)} r={2} fill={colour} />
                ) : (
                  <Polyline
                    key={si}
                    points={seg.points.map((p) => `${x(p.year)},${y(p.value)}`).join(" ")}
                    stroke={colour}
                    strokeWidth={1.5}
                    fill="none"
                  />
                ),
              )}
              {line.segments.flatMap((seg) => seg.points).map((p) => (
                <Circle key={`p${p.year}`} cx={x(p.year)} cy={y(p.value)} r={1.6} fill={colour} />
              ))}
            </G>
          );
        })}
      </Svg>
      <View style={s.legendRow}>
        {t.lines.map((line, li) => (
          <View key={line.place.code} style={s.legendItem}>
            <View style={[s.swatch, { backgroundColor: OKABE_ITO[li % OKABE_ITO.length] }]} />
            <Text style={{ fontSize: 7.5 }}>{line.place.name}</Text>
          </View>
        ))}
      </View>
      {breaks.size > 0 && (
        <Text style={s.small}>
          Lines are broken where the data source changes; values from different sources are not joined.
        </Text>
      )}
    </View>
  );
}

function SectionBlock({ section }: { section: ReportSection }) {
  const ind = section.indicator;
  return (
    <View style={{ marginBottom: 14 }}>
      <View wrap={false}>
        <Text style={s.h2}>{ind.name}</Text>
        <Text style={[s.p, s.muted]}>
          {ind.definition} Unit: {ind.unit}.
        </Text>
      </View>
      <View style={s.table}>
        <View style={s.tr} fixed>
          <Text style={[s.th, { width: COLS.place }]}>Place</Text>
          <Text style={[s.th, { width: COLS.value, textAlign: "right" }]}>Value</Text>
          <Text style={[s.th, { width: COLS.ci, textAlign: "right" }]}>95% CI</Text>
          <Text style={[s.th, { width: COLS.year, textAlign: "right" }]}>Year</Text>
          <Text style={[s.th, { width: COLS.est, textAlign: "center" }]}>Est.</Text>
          <Text style={[s.th, { flex: 1 }]}>Source</Text>
        </View>
        {section.rows.map((r) => (
          <View key={r.place.code} style={s.tr} wrap={false}>
            <Text style={{ width: COLS.place }}>{r.place.name}</Text>
            <Text style={{ width: COLS.value, textAlign: "right", color: r.value === null ? MUTED : INK }}>{r.display}</Text>
            <Text style={{ width: COLS.ci, textAlign: "right", color: MUTED }}>{r.ci || "-"}</Text>
            <Text style={{ width: COLS.year, textAlign: "right" }}>{r.periodLabel ?? (r.year ? String(r.year) : "-")}</Text>
            <Text style={{ width: COLS.est, textAlign: "center" }}>{r.value === null ? "-" : r.isEstimate ? "yes" : "no"}</Text>
            <Text style={{ flex: 1, fontSize: 7.5, color: MUTED }}>
              {r.source ?? "-"}
              {r.isSynthetic ? " · SYNTHETIC demo value" : ""}
            </Text>
          </View>
        ))}
      </View>
      {!section.hasData && <Text style={[s.p, s.muted, { marginTop: 4 }]}>No published data for these places.</Text>}
      {section.bars.length > 1 && (
        <View wrap={false}>
          <Text style={s.h3}>
            {ind.name} by place{section.rows.some((r) => r.year !== null) ? " (latest or selected year)" : ""}
          </Text>
          <BarChart section={section} />
        </View>
      )}
      {section.trend && (
        <View>
          <Text style={s.h3}>Trend over time</Text>
          <TrendChart section={section} />
        </View>
      )}
      {section.sources.length > 0 && (
        <Text style={[s.small, { marginTop: 4 }]}>Source: {section.sources.join("; ")}</Text>
      )}
    </View>
  );
}

function MiniMap({ frame }: { frame: ReportData["maps"][number] }) {
  const w = 250;
  const h = 170;
  if (!frame.feature) {
    return (
      <View style={s.mapCell}>
        <Text style={s.h3}>{frame.place.name}</Text>
        <Text style={s.muted}>No boundary available for this place.</Text>
      </View>
    );
  }
  const ctx = frame.context && frame.context !== frame.feature ? frame.context : null;
  const features = ctx ? [ctx, frame.feature] : [frame.feature];
  const projected = projectFeatures(features, w, h, { fitTo: ctx ? [ctx] : [frame.feature] });
  const [ctxPath, placePath] = ctx ? projected.paths : [null, projected.paths[0]];
  return (
    <View style={s.mapCell} wrap={false}>
      <Svg width={w} height={h} style={{ borderWidth: 0.5, borderColor: RULE }}>
        {ctxPath && <Path d={ctxPath} fill="#f3f4f6" stroke="#9ca3af" strokeWidth={0.6} />}
        {placePath && <Path d={placePath} fill={OKABE_ITO[0]} fillOpacity={0.8} stroke="#003f63" strokeWidth={0.8} />}
      </Svg>
      <Text style={{ fontSize: 8, marginTop: 2 }}>
        {frame.place.name} <Text style={s.muted}>({frame.place.level.toUpperCase()} · {frame.place.code})</Text>
      </Text>
    </View>
  );
}

export function ReportDocument({
  title,
  data,
  generatedAt,
}: {
  title: string;
  data: ReportData;
  generatedAt: Date;
}) {
  const { model, maps, licences, missing } = data;
  return (
    <Document title={title} author="PopLens" subject="Custom report" creator="PopLens">
      <Page size="A4" style={s.page}>
        <Text style={[s.small, { marginBottom: 6 }]}>POPLENS CUSTOM REPORT</Text>
        <Text style={s.h1}>{title}</Text>
        <Text style={[s.p, s.muted]}>
          Generated {formatLagosDate(generatedAt)} (Africa/Lagos).{" "}
          {model.year ? `Values for ${model.year} where available.` : "Latest published value for each place."}
        </Text>
        {model.anySynthetic && (
          <View style={s.warn}>
            <Text style={{ fontFamily: "Helvetica-Bold", marginBottom: 2 }}>Synthetic demo data</Text>
            <Text>
              This report includes SYNTHETIC demo values generated for demonstration. They are not real statistics and
              must not be cited.
            </Text>
          </View>
        )}
        <Text style={s.h2}>Places</Text>
        {model.places.map((p) => (
          <Text key={p.code} style={s.p}>
            {p.name} ({p.level}, {p.code})
          </Text>
        ))}
        <Text style={s.h2}>Indicators</Text>
        {model.sections.map((sec) => (
          <Text key={sec.indicator.code} style={s.p}>
            {sec.indicator.name} ({sec.indicator.unit})
          </Text>
        ))}
        {(missing.places.length > 0 || missing.indicators.length > 0) && (
          <Text style={[s.p, s.muted]}>
            Skipped unknown codes: {[...missing.places, ...missing.indicators].join(", ")}
          </Text>
        )}
        <Text style={s.h2}>How to read this report</Text>
        <Text style={s.p}>
          Only published values are included. Missing data is shown as &quot;No data&quot;, never as zero. Every value
          carries its source and year; &quot;Est.&quot; marks modelled estimates (all current population figures are
          estimates — Nigeria&apos;s last census was in 2006). Confidence intervals are shown where the source gives
          them. Indicators are reported at the finest level a source provides; PopLens does not estimate finer values.
        </Text>
        <Footer title={title} />
      </Page>

      <Page size="A4" style={s.page}>
        <Text style={s.h2}>Location maps</Text>
        <Text style={[s.p, s.muted]}>
          Each place is shaded within its state (LGAs and wards) or within Nigeria. Simplified boundaries.
        </Text>
        <View style={s.mapGrid}>
          {maps.map((m) => (
            <MiniMap key={m.place.code} frame={m} />
          ))}
        </View>
        <Footer title={title} />
      </Page>

      <Page size="A4" style={s.page} wrap>
        {model.sections.map((sec) => (
          <SectionBlock key={sec.indicator.code} section={sec} />
        ))}
        <Footer title={title} />
      </Page>

      <Page size="A4" style={s.page}>
        <Text style={s.h2}>Sources and licences</Text>
        {model.sources.length === 0 && <Text style={s.muted}>No published values were found for this selection.</Text>}
        {model.sources.map((src) => {
          const lic = licences.get(src.sourceId);
          return (
            <View key={`${src.sourceId}-${src.datasetTitle}`} style={{ marginBottom: 6 }} wrap={false}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>
                {src.publisher} — {src.title}
              </Text>
              <Text style={s.muted}>
                Dataset: {src.datasetTitle}
                {src.isSynthetic ? " (SYNTHETIC demo data)" : ""}
              </Text>
              {lic && (
                <Text style={s.muted}>
                  Licence: {lic.licence}
                  {lic.url ? ` (${lic.url})` : ""}
                </Text>
              )}
            </View>
          );
        })}
        <Text style={[s.small, { marginTop: 10 }]}>
          Produced with PopLens. Cite the original sources above, not PopLens, for any value you reuse.
        </Text>
        <Footer title={title} />
      </Page>
    </Document>
  );
}
