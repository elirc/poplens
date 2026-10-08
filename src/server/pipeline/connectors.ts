import { and, eq, gt } from "drizzle-orm";
import { db, schema } from "@/db";
import { env } from "@/env";
import { getConnector } from "@/adapters";
import type { ConnectorKind, StagedValue } from "@/adapters/types";
import { loadPlaceMatcher, type MatchResult, type PlaceMatcher } from "@/server/geo/matching";
import type { GeoLevel } from "@/server/geo/queries";
import { valueKey } from "./diff";
import { createIndicatorDraft } from "./store";
import type { ResolvedValue } from "./types";

/**
 * Connector run pipeline (spec: Data pipeline §3):
 *   import_runs row → adapter.run() → resolve places via the matching engine
 *   (unresolved → run-log warnings) → draft dataset (next version of the
 *   series, changeSummary vs published) → batch insert → finish run.
 * Used by the staff "Run now" action and the pg-boss connector jobs.
 */

export const CONNECTORS: Array<{
  kind: ConnectorKind;
  label: string;
  sourceKey: string;
  description: string;
}> = [
  {
    kind: "dhs",
    label: "DHS Program indicator API",
    sourceKey: "dhs",
    description: "State, zone and national survey indicators for every Nigerian DHS/MIS survey.",
  },
  {
    kind: "who",
    label: "WHO Global Health Observatory",
    sourceKey: "who-gho",
    description: "National annual series (life expectancy, maternal mortality, HIV prevalence).",
  },
  {
    kind: "worldbank",
    label: "World Bank WDI",
    sourceKey: "worldbank",
    description: "National annual series (population, growth, urban share, fertility, electricity, literacy).",
  },
];

export function connectorMode(kind: ConnectorKind): "mock" | "real" {
  const v =
    kind === "dhs"
      ? env.ADAPTER_CONNECTOR_DHS
      : kind === "who"
        ? env.ADAPTER_CONNECTOR_WHO
        : env.ADAPTER_CONNECTOR_WORLDBANK;
  return v === "real" ? "real" : "mock";
}

export interface ConnectorRunOutcome {
  runId: number;
  ok: boolean;
  datasetId?: number;
  version?: number;
  error?: string;
  stats: Record<string, unknown>;
}

function refKey(r: StagedValue): string {
  return `${r.geo.kind}|${r.geo.level}|${r.geo.value}`;
}

/** Resolve staged rows to insertable values; collects warnings. Exported for tests. */
export async function resolveStagedValues(
  rows: StagedValue[],
  matcher: PlaceMatcher,
  indicatorIds: Map<string, number>,
): Promise<{ values: ResolvedValue[]; warnings: string[]; unresolved: string[]; unknownIndicators: string[]; duplicates: number }> {
  const cache = new Map<string, MatchResult>();
  for (const r of rows) {
    const k = refKey(r);
    if (cache.has(k)) continue;
    cache.set(
      k,
      await matcher.match({
        code: r.geo.kind === "code" ? r.geo.value : null,
        name: r.geo.kind === "name" ? r.geo.value : null,
        level: r.geo.level,
      }),
    );
  }
  const unresolved = new Set<string>();
  const unknownIndicators = new Set<string>();
  const seen = new Set<string>();
  const values: ResolvedValue[] = [];
  let duplicates = 0;
  for (const r of rows) {
    const m = cache.get(refKey(r));
    if (!m || m.status !== "matched" || m.geoUnitId == null) {
      unresolved.add(`${r.geo.level}: ${r.geo.value}`);
      continue;
    }
    const indicatorId = indicatorIds.get(r.indicatorCode);
    if (indicatorId == null) {
      unknownIndicators.add(r.indicatorCode);
      continue;
    }
    if (!Number.isFinite(r.value)) continue; // never store NaN; missing stays absent
    const v: ResolvedValue = {
      indicatorId,
      indicatorCode: r.indicatorCode,
      geoUnitId: m.geoUnitId,
      year: r.year,
      periodLabel: r.periodLabel ?? null,
      value: r.value,
      lower: r.lower ?? null,
      upper: r.upper ?? null,
      sex: r.sex ?? "all",
      ageGroup: r.ageGroup ?? "all",
      residence: r.residence ?? "all",
      isEstimate: r.isEstimate,
      note: r.note ?? null,
    };
    const k = valueKey(v);
    if (seen.has(k)) {
      duplicates++;
      continue;
    }
    seen.add(k);
    values.push(v);
  }
  const warnings: string[] = [];
  if (unresolved.size)
    warnings.push(`Unresolved places (rows skipped): ${[...unresolved].slice(0, 40).join("; ")}`);
  if (unknownIndicators.size)
    warnings.push(`Indicator codes not in catalogue (rows skipped): ${[...unknownIndicators].join(", ")}`);
  if (duplicates) warnings.push(`${duplicates} duplicate staged row(s) dropped (first kept)`);
  return {
    values,
    warnings,
    unresolved: [...unresolved],
    unknownIndicators: [...unknownIndicators],
    duplicates,
  };
}

export async function runConnector(
  kind: ConnectorKind,
  actorId: string | null,
): Promise<ConnectorRunOutcome> {
  const t0 = Date.now();
  const mode = connectorMode(kind);
  const [run] = await db
    .insert(schema.importRuns)
    .values({ kind, status: "running", triggeredBy: actorId, stats: { mode } })
    .returning({ id: schema.importRuns.id });
  const log: string[] = [`[${new Date().toISOString()}] ${kind} connector (${mode}) started`];
  try {
    const result = await getConnector(kind).run();
    log.push(`adapter returned ${result.rows.length} staged rows for series ${result.seriesKey}`);
    const [source] = await db
      .select({ id: schema.sources.id })
      .from(schema.sources)
      .where(eq(schema.sources.key, result.sourceKey));
    if (!source) {
      throw new Error(`Source '${result.sourceKey}' is not registered — add it under Sources (or run the seed).`);
    }
    const inds = await db
      .select({ id: schema.indicators.id, code: schema.indicators.code })
      .from(schema.indicators);
    const indicatorIds = new Map(inds.map((i) => [i.code, i.id]));
    const levels = [...new Set(result.rows.map((r) => r.geo.level))] as GeoLevel[];
    const matcher = await loadPlaceMatcher(levels, { fuzzy: null });
    const resolved = await resolveStagedValues(result.rows, matcher, indicatorIds);
    log.push(...resolved.warnings);
    if (resolved.values.length === 0) {
      throw new Error("No rows could be resolved to known places and indicators.");
    }
    const isSynthetic =
      mode === "mock" || result.rows.some((r) => /SYNTHETIC/i.test(r.note ?? ""));
    const draft = await createIndicatorDraft(
      {
        sourceId: source.id,
        seriesKey: result.seriesKey,
        title: result.datasetTitle,
        description: result.releaseNote ?? null,
        releaseDate: new Date().toISOString().slice(0, 10),
        isSynthetic,
        uploadedBy: actorId,
        warnings: resolved.warnings,
      },
      resolved.values,
    );
    const stats = {
      mode,
      seriesKey: result.seriesKey,
      rowsReceived: result.rows.length,
      rowsInserted: draft.inserted,
      unresolvedPlaces: resolved.unresolved.slice(0, 100),
      unknownIndicators: resolved.unknownIndicators,
      duplicatesDropped: resolved.duplicates,
      added: draft.changeSummary.added,
      changed: draft.changeSummary.changed,
      removed: draft.changeSummary.removed,
      durationMs: Date.now() - t0,
    };
    log.push(`draft dataset #${draft.datasetId} v${draft.version} created (${draft.inserted} rows)`);
    await db
      .update(schema.importRuns)
      .set({
        status: "succeeded",
        datasetId: draft.datasetId,
        stats,
        log: log.join("\n"),
        finishedAt: new Date(),
      })
      .where(eq(schema.importRuns.id, run.id));
    return { runId: run.id, ok: true, datasetId: draft.datasetId, version: draft.version, stats };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.push(`FAILED: ${msg}`);
    const stats = { mode, durationMs: Date.now() - t0 };
    await db
      .update(schema.importRuns)
      .set({ status: "failed", error: msg, stats, log: log.join("\n"), finishedAt: new Date() })
      .where(eq(schema.importRuns.id, run.id));
    return { runId: run.id, ok: false, error: msg, stats };
  }
}

/**
 * Guard for at-least-once job delivery: true when a run of this kind is
 * already in progress (started within the last hour).
 */
export async function connectorRunInProgress(kind: ConnectorKind): Promise<boolean> {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const rows = await db
    .select({ id: schema.importRuns.id })
    .from(schema.importRuns)
    .where(
      and(
        eq(schema.importRuns.kind, kind),
        eq(schema.importRuns.status, "running"),
        gt(schema.importRuns.startedAt, since),
      ),
    )
    .limit(1);
  return rows.length > 0;
}
