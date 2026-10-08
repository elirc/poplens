import { ImageResponse } from "next/og";
import type { CardData } from "@/components/content/types";

/**
 * Insight-card images (next/og → Satori). Satori supports flexbox only, so
 * every element with several children is display:flex. Colours: Okabe-Ito
 * blue/orange (colour-blind-safe) on white; demo ribbon in amber when the
 * data is synthetic. Only Latin text — no emoji (they would be fetched from
 * a CDN at render time).
 */

export type CardImageSize = "square" | "wide";

export const CARD_SIZES: Record<CardImageSize, { width: number; height: number }> = {
  square: { width: 1080, height: 1080 },
  wide: { width: 1200, height: 630 },
};

const BLUE = "#0072B2";
const ORANGE = "#E69F00";
const INK = "#111827";
const MUTED = "#4B5563";
const TRACK = "#E5E7EB";

function pct(v: number | null, max: number): number {
  if (v == null || !Number.isFinite(v) || max <= 0) return 0;
  return Math.max(2, Math.min(100, (v / max) * 100));
}

function clip(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function Body({ d, size }: { d: CardData; size: CardImageSize }) {
  const sq = size === "square";
  const s = (wide: number, square: number) => (sq ? square : wide);

  if (d.kind === "top5") {
    const max = Math.max(...d.rows.map((r) => r.raw), 0);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: s(10, 22), width: "100%" }}>
        {d.rows.length === 0 && <div style={{ display: "flex", fontSize: s(40, 56), color: MUTED }}>No data</div>}
        {d.rows.map((r) => (
          <div key={r.rank} style={{ display: "flex", alignItems: "center", gap: 16, width: "100%" }}>
            <div style={{ display: "flex", width: s(260, 300), fontSize: s(26, 34), color: INK }}>
              {clip(`${r.rank}. ${r.name}`, 20)}
            </div>
            <div style={{ display: "flex", flex: 1, height: s(30, 44), background: TRACK, borderRadius: 6 }}>
              <div style={{ display: "flex", width: `${pct(r.raw, max)}%`, height: "100%", background: BLUE, borderRadius: 6 }} />
            </div>
            <div style={{ display: "flex", width: s(150, 190), justifyContent: "flex-end", fontSize: s(28, 38), color: INK }}>
              {r.formatted}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (d.kind === "vs_national") {
    const max = Math.max(d.headlineRaw ?? 0, d.national?.raw ?? 0);
    const bars: Array<[string, string, number | null, string]> = [
      [d.place?.name ?? "", d.headline, d.headlineRaw, BLUE],
      ["Nigeria", d.national?.formatted ?? "No data", d.national?.raw ?? null, ORANGE],
    ];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: s(16, 30), width: "100%" }}>
        {bars.map(([label, formatted, raw, color]) => (
          <div key={label} style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: s(28, 38), color: INK }}>
              <div style={{ display: "flex" }}>{label}</div>
              <div style={{ display: "flex" }}>{formatted}</div>
            </div>
            <div style={{ display: "flex", width: "100%", height: s(34, 52), background: TRACK, borderRadius: 6 }}>
              <div style={{ display: "flex", width: `${pct(raw, max)}%`, height: "100%", background: color, borderRadius: 6 }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (d.kind === "trend") {
    const max = Math.max(...d.points.map((p) => p.raw), 0);
    const pts = d.points.slice(-8);
    return (
      <div style={{ display: "flex", alignItems: "flex-end", gap: s(18, 26), height: s(190, 360), width: "100%" }}>
        {pts.length === 0 && <div style={{ display: "flex", fontSize: s(40, 56), color: MUTED }}>No data</div>}
        {pts.map((p, i) => (
          <div key={`${p.year}-${i}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, height: "100%", justifyContent: "flex-end", gap: 6 }}>
            <div style={{ display: "flex", fontSize: s(20, 28), color: INK }}>{p.formatted}</div>
            <div
              style={{
                display: "flex",
                width: "100%",
                height: `${pct(p.raw, max) * 0.72}%`,
                // A different source gets the other colour: never one silent series.
                background: i > 0 && pts[i - 1]!.sourceId !== p.sourceId ? ORANGE : BLUE,
                borderRadius: 6,
              }}
            />
            <div style={{ display: "flex", fontSize: s(20, 28), color: MUTED }}>{String(p.year)}</div>
          </div>
        ))}
      </div>
    );
  }

  return <div style={{ display: "flex" }} />;
}

function Card({ d, size }: { d: CardData; size: CardImageSize }) {
  const sq = size === "square";
  const s = (wide: number, square: number) => (sq ? square : wide);
  const showBigValue = d.kind !== "top5";
  const subtitle = [d.place?.name ?? (d.kind === "top5" ? "Nigeria" : null), d.year != null ? String(d.year) : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        background: "#FFFFFF",
        fontFamily: "sans-serif",
        position: "relative",
      }}
    >
      <div style={{ display: "flex", width: s(18, 24), height: "100%", background: BLUE }} />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          padding: s(44, 72),
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: s(30, 40), color: INK }}>
            <div style={{ display: "flex", width: s(18, 24), height: s(18, 24), borderRadius: 999, background: "#009E73" }} />
            PopLens
          </div>
          {d.isSynthetic && (
            <div
              style={{
                display: "flex",
                background: "#FDE68A",
                color: "#78350F",
                fontSize: s(22, 30),
                padding: "8px 18px",
                borderRadius: 8,
              }}
            >
              DEMO DATA · SYNTHETIC, NOT REAL
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: s(8, 16) }}>
          <div style={{ display: "flex", fontSize: s(40, 56), color: INK, lineHeight: 1.15 }}>{clip(d.title, sq ? 70 : 64)}</div>
          <div style={{ display: "flex", fontSize: s(26, 34), color: MUTED }}>
            {clip(`${d.indicator.name}${d.indicator.valueType === "percent" ? "" : ` (${d.indicator.unit})`}`, 80)}
          </div>
          {subtitle && <div style={{ display: "flex", fontSize: s(26, 34), color: MUTED }}>{subtitle}</div>}
        </div>

        {showBigValue && (
          <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
            <div style={{ display: "flex", fontSize: s(96, 150), color: d.headlineRaw == null ? MUTED : INK, fontWeight: 700, lineHeight: 1 }}>
              {d.headline}
            </div>
            {d.headlineRaw != null && d.indicator.valueType !== "percent" && d.indicator.valueType !== "count" && (
              <div style={{ display: "flex", fontSize: s(26, 34), color: MUTED }}>{clip(d.indicator.unit, 28)}</div>
            )}
          </div>
        )}

        {d.kind !== "single_stat" ? <Body d={d} size={size} /> : <div style={{ display: "flex", height: sq ? 160 : 0 }} />}

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {d.rankLine && <div style={{ display: "flex", fontSize: s(22, 30), color: INK }}>{d.rankLine}</div>}
          {d.sourcesDiffer && (
            <div style={{ display: "flex", fontSize: s(20, 26), color: MUTED }}>
              Sources differ across years (colour change) and are not directly comparable.
            </div>
          )}
          <div style={{ display: "flex", fontSize: s(20, 26), color: MUTED }}>{clip(`Source: ${d.sourceLine}`, 110)}</div>
        </div>
      </div>
    </div>
  );
}

export function renderCardImage(
  d: CardData,
  size: CardImageSize,
  init: { cacheControl?: string; downloadName?: string } = {},
): ImageResponse {
  const headers: Record<string, string> = {
    "Cache-Control": init.cacheControl ?? "public, max-age=300, stale-while-revalidate=3600",
  };
  if (init.downloadName) headers["Content-Disposition"] = `attachment; filename="${init.downloadName}"`;
  return new ImageResponse(<Card d={d} size={size} />, { ...CARD_SIZES[size], headers });
}

/** Fallback image when a card cannot be built (never a broken <img>). */
export function renderErrorImage(message: string, size: CardImageSize): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          background: "#FFFFFF",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: 60,
        }}
      >
        <div style={{ display: "flex", fontSize: 44, color: INK }}>PopLens</div>
        <div style={{ display: "flex", fontSize: 30, color: MUTED, textAlign: "center" }}>{clip(message, 120)}</div>
      </div>
    ),
    { ...CARD_SIZES[size], headers: { "Cache-Control": "no-store" } },
  );
}
