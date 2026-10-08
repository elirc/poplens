/**
 * Pure helpers shared by the REAL data loaders (scripts/load-grid3.ts and
 * scripts/population-grid.ts): CLI flags, attribute-field detection and
 * XYZ → ~1 km grid aggregation. Unit-tested in loader-utils.test.ts.
 */

/** `--key value` / `--key=value` / bare `--flag` → map. */
export function parseArgs(argv: string[]): Map<string, string | true> {
  const out = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const eq = a.indexOf("=");
    if (eq > 0) {
      out.set(a.slice(2, eq), a.slice(eq + 1));
    } else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
      out.set(a.slice(2), argv[++i]);
    } else {
      out.set(a.slice(2), true);
    }
  }
  return out;
}

export function argString(args: Map<string, string | true>, key: string): string | undefined {
  const v = args.get(key);
  return typeof v === "string" ? v : undefined;
}

/**
 * Pick the attribute name to use for a role: an explicit override wins,
 * otherwise the first candidate present (case-insensitive) in the sample
 * properties. Returns null when nothing matches — callers must then stop and
 * ask the operator to pass --field-<role> (we never guess silently).
 */
export function pickField(
  sample: Record<string, unknown>,
  candidates: string[],
  override?: string,
): string | null {
  const keys = Object.keys(sample);
  if (override) {
    const hit = keys.find((k) => k.toLowerCase() === override.toLowerCase());
    return hit ?? null;
  }
  for (const c of candidates) {
    const hit = keys.find((k) => k.toLowerCase() === c.toLowerCase());
    if (hit) return hit;
  }
  return null;
}

/** Parse one line of `gdal2xyz` output ("x y z" or "x,y,z"). */
export function parseXyzLine(line: string): [number, number, number] | null {
  const t = line.trim();
  if (!t || t.startsWith("#")) return null;
  const parts = t.split(/[\s,;]+/);
  if (parts.length < 3) return null;
  const x = Number(parts[0]);
  const y = Number(parts[1]);
  const z = Number(parts[2]);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  return [x, y, z];
}

/**
 * Accumulates raster points into square cells of `cellDeg` degrees, summing
 * values. Cell key = integer column/row; the output point is the cell centre.
 * 30 arc-seconds (0.008333°) ≈ 0.9 km at Nigeria's latitudes.
 */
export class GridAccumulator {
  readonly cells = new Map<string, number>();
  constructor(readonly cellDeg = 30 / 3600) {}

  add(x: number, y: number, value: number): void {
    if (!(value > 0)) return; // nodata / zero population contributes nothing
    const k = `${Math.floor(x / this.cellDeg)}:${Math.floor(y / this.cellDeg)}`;
    this.cells.set(k, (this.cells.get(k) ?? 0) + value);
  }

  centre(key: string): [number, number] {
    const [cx, cy] = key.split(":").map(Number);
    return [(cx + 0.5) * this.cellDeg, (cy + 0.5) * this.cellDeg];
  }

  total(): number {
    let s = 0;
    for (const v of this.cells.values()) s += v;
    return s;
  }
}
