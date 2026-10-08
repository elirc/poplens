import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getStorage } from "@/adapters";
import { writeAudit } from "@/lib/audit";
import {
  confirmAlias,
  loadPlaceMatcher,
  type MatchCandidate,
  type MatchResult,
  type PlaceMatcher,
} from "@/server/geo/matching";
import type { GeoLevel } from "@/server/geo/queries";
import { colGetter, guessMapping, parseUploadFile, type ParsedTable } from "./parse";
import { createIndicatorDraft, createOutbreakDraft } from "./store";
import type {
  ColumnMapping,
  IndicatorColumnMapping,
  OutbreakColumnMapping,
  ValidationReport,
} from "./types";
import {
  validateIndicatorRows,
  validateOutbreakRows,
  type PreparedIndicatorRow,
  type PreparedOutbreakRow,
  type ValueType,
} from "./validate";

/**
 * Upload wizard back end. One upload = one import_runs row (kind 'upload');
 * the wizard state lives in its `stats` jsonb (UploadSession). The original
 * file and the parsed table are kept in storage under uploads/<runId>/.
 *
 *   start → mapping → review (place matches) → validated → done (draft)
 */

export type UploadKind = ColumnMapping["kind"];
export type UploadStage = "mapping" | "review" | "validated" | "done" | "cancelled";

export interface PendingPlace {
  key: string;
  rawName: string;
  level: GeoLevel;
  stateName: string | null;
  status: MatchResult["status"];
  candidates: MatchCandidate[];
  rowCount: number;
}

export interface UploadSession {
  stage: UploadStage;
  kind: UploadKind;
  fileName: string;
  fileKey: string;
  rowsKey: string;
  headers: string[];
  rowCount: number;
  title: string;
  seriesKey: string;
  sourceId: number;
  isSynthetic: boolean;
  releaseDate: string | null;
  mapping?: ColumnMapping;
  autoMatched?: number;
  pending?: PendingPlace[];
  /** key → chosen geoUnitId (null = exclude rows). */
  decisions?: Record<string, number | null>;
  validation?: ValidationReport;
  datasetId?: number;
}

function safeName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120) || "upload";
}

async function saveSession(runId: number, session: UploadSession, extra: Partial<typeof schema.importRuns.$inferInsert> = {}) {
  await db
    .update(schema.importRuns)
    .set({ stats: session as unknown as Record<string, unknown>, ...extra })
    .where(eq(schema.importRuns.id, runId));
}

export async function getUploadSession(runId: number): Promise<{
  run: typeof schema.importRuns.$inferSelect;
  session: UploadSession;
} | null> {
  const [run] = await db.select().from(schema.importRuns).where(eq(schema.importRuns.id, runId));
  if (!run || run.kind !== "upload" || !run.stats) return null;
  return { run, session: run.stats as UploadSession };
}

export async function loadTable(session: UploadSession): Promise<ParsedTable> {
  const buf = await getStorage().get(session.rowsKey);
  if (!buf) throw new Error("Parsed upload not found in storage — start the upload again.");
  return JSON.parse(buf.toString("utf8")) as ParsedTable;
}

/* ── Step 1: upload ──────────────────────────────────────────────────────── */

export async function startUpload(input: {
  buffer: Buffer;
  fileName: string;
  contentType: string;
  kind: UploadKind;
  title: string;
  seriesKey: string;
  sourceId: number;
  isSynthetic: boolean;
  releaseDate: string | null;
  actorId: string;
}): Promise<number> {
  const table = await parseUploadFile(input.buffer, input.fileName);
  if (table.headers.length === 0 || table.rows.length === 0) {
    throw new Error("The file has no data rows under a header row.");
  }
  const [run] = await db
    .insert(schema.importRuns)
    .values({ kind: "upload", status: "running", triggeredBy: input.actorId })
    .returning({ id: schema.importRuns.id });
  const base = `uploads/${run.id}`;
  const fileKey = `${base}/original-${safeName(input.fileName)}`;
  const rowsKey = `${base}/table.json`;
  const storage = getStorage();
  await storage.put(fileKey, input.buffer, input.contentType || "application/octet-stream");
  await storage.put(rowsKey, Buffer.from(JSON.stringify(table)), "application/json");
  const session: UploadSession = {
    stage: "mapping",
    kind: input.kind,
    fileName: input.fileName,
    fileKey,
    rowsKey,
    headers: table.headers,
    rowCount: table.rows.length,
    title: input.title,
    seriesKey: input.seriesKey,
    sourceId: input.sourceId,
    isSynthetic: input.isSynthetic,
    releaseDate: input.releaseDate,
    mapping: guessMapping(table.headers, input.kind),
  };
  await saveSession(run.id, session, { log: `Uploaded ${input.fileName} (${table.rows.length} rows)` });
  await writeAudit({
    actorId: input.actorId,
    action: "upload.start",
    entity: "import_run",
    entityId: run.id,
    detail: { fileName: input.fileName, rows: table.rows.length, kind: input.kind },
  });
  return run.id;
}

/* ── Place resolution (shared by review + validation) ────────────────────── */

interface PlaceRef {
  key: string;
  rawName: string;
  level: GeoLevel;
  stateName: string | null;
  result: MatchResult;
}

function placeLevel(mapping: ColumnMapping): GeoLevel {
  return mapping.kind === "outbreak_reports" ? "state" : mapping.level;
}

/** Resolve every row's place. Returns per-row refs + distinct places. */
export async function resolveTablePlaces(
  table: ParsedTable,
  mapping: ColumnMapping,
  matcher: PlaceMatcher,
): Promise<{ perRow: PlaceRef[]; distinct: Map<string, PlaceRef & { rowCount: number }> }> {
  const get = colGetter(table.headers);
  const level = placeLevel(mapping);
  const nameCol = mapping.kind === "outbreak_reports" ? mapping.state : mapping.place;
  const codeCol = mapping.kind === "indicator_values" ? mapping.placeCode : null;
  const stateCol =
    mapping.kind === "indicator_values" && (level === "lga" || level === "ward") ? mapping.stateColumn : null;

  const stateCache = new Map<string, number | null>();
  const cache = new Map<string, PlaceRef>();
  const distinct = new Map<string, PlaceRef & { rowCount: number }>();
  const perRow: PlaceRef[] = [];

  for (const row of table.rows) {
    const rawName = get(row, nameCol);
    const code = get(row, codeCol);
    const stateName = stateCol ? get(row, stateCol) : "";
    let stateId: number | null = null;
    if (stateName) {
      if (!stateCache.has(stateName)) {
        const m = await matcher.match({ name: stateName, level: "state" });
        stateCache.set(stateName, m.status === "matched" ? (m.geoUnitId ?? null) : null);
      }
      stateId = stateCache.get(stateName) ?? null;
    }
    const key = `${level}|${stateId ?? ""}|${code}|${rawName}`;
    let ref = cache.get(key);
    if (!ref) {
      const result = await matcher.match({ name: rawName, code: code || null, level, stateId });
      ref = { key, rawName: rawName || code, level, stateName: stateName || null, result };
      cache.set(key, ref);
    }
    perRow.push(ref);
    const d = distinct.get(key);
    if (d) d.rowCount++;
    else distinct.set(key, { ...ref, rowCount: 1 });
  }
  return { perRow, distinct };
}

/* ── Step 2: column mapping → place review ───────────────────────────────── */

export async function saveMapping(runId: number, mapping: ColumnMapping): Promise<void> {
  const s = await getUploadSession(runId);
  if (!s) throw new Error("Upload not found");
  const { session } = s;
  if (session.stage === "done" || session.stage === "cancelled") throw new Error("Upload is closed");
  if (mapping.kind !== session.kind) throw new Error("Mapping kind does not match the upload kind");
  for (const col of mappedColumns(mapping)) {
    if (!session.headers.includes(col)) throw new Error(`Column "${col}" is not in the file`);
  }
  const table = await loadTable(session);
  const matcher = await loadPlaceMatcher([placeLevel(mapping)]);
  const { distinct } = await resolveTablePlaces(table, mapping, matcher);
  const pending: PendingPlace[] = [];
  let autoMatched = 0;
  for (const d of distinct.values()) {
    if (d.result.status === "matched") autoMatched++;
    else
      pending.push({
        key: d.key,
        rawName: d.rawName,
        level: d.level,
        stateName: d.stateName,
        status: d.result.status,
        candidates: d.result.candidates,
        rowCount: d.rowCount,
      });
  }
  pending.sort((a, b) => b.rowCount - a.rowCount);
  await saveSession(runId, {
    ...session,
    mapping,
    stage: "review",
    autoMatched,
    pending: pending.slice(0, 500),
    decisions: {},
    validation: undefined,
  });
}

function mappedColumns(m: ColumnMapping): string[] {
  const cols =
    m.kind === "outbreak_reports"
      ? [m.disease, m.state, m.year, m.week, m.suspected, m.confirmed, m.deaths]
      : [
          m.place,
          m.stateColumn,
          m.placeCode,
          m.year,
          m.indicatorColumn,
          m.value,
          m.lower,
          m.upper,
          m.sex,
          m.ageGroup,
          m.residence,
          m.note,
        ];
  return cols.filter((c): c is string => !!c);
}

/* ── Step 3: review decisions → validation ───────────────────────────────── */

async function indicatorLookup(): Promise<{
  byKey: Map<string, { id: number; code: string; valueType: ValueType }>;
}> {
  const inds = await db
    .select({
      id: schema.indicators.id,
      code: schema.indicators.code,
      name: schema.indicators.name,
      valueType: schema.indicators.valueType,
    })
    .from(schema.indicators);
  const byKey = new Map<string, { id: number; code: string; valueType: ValueType }>();
  for (const i of inds) {
    byKey.set(i.code.toLowerCase(), i);
    byKey.set(i.name.toLowerCase(), i);
  }
  return { byKey };
}

async function buildValidation(session: UploadSession) {
  const mapping = session.mapping;
  if (!mapping) throw new Error("Map the columns first");
  const table = await loadTable(session);
  const matcher = await loadPlaceMatcher([placeLevel(mapping)]);
  const { perRow } = await resolveTablePlaces(table, mapping, matcher);
  const decisions = session.decisions ?? {};
  const get = colGetter(table.headers);
  const place = (i: number) => {
    const ref = perRow[i];
    if (ref.result.status === "matched") return { id: ref.result.geoUnitId ?? null, excluded: false };
    if (ref.key in decisions) {
      const d = decisions[ref.key];
      return d === null ? { id: null, excluded: true } : { id: d, excluded: false };
    }
    return { id: null, excluded: false };
  };

  if (mapping.kind === "outbreak_reports") {
    const m = mapping as OutbreakColumnMapping;
    const rows: PreparedOutbreakRow[] = table.rows.map((row, i) => {
      const p = place(i);
      return {
        row: i + 1,
        diseaseRaw: get(row, m.disease),
        stateName: get(row, m.state),
        stateId: p.id,
        excluded: p.excluded,
        yearRaw: get(row, m.year),
        weekRaw: get(row, m.week),
        suspectedRaw: get(row, m.suspected),
        confirmedRaw: get(row, m.confirmed),
        deathsRaw: get(row, m.deaths),
      };
    });
    return { kind: "outbreak_reports" as const, ...validateOutbreakRows(rows) };
  }

  const m = mapping as IndicatorColumnMapping;
  const { byKey } = await indicatorLookup();
  const indicators = new Map([...byKey.values()].map((i) => [i.code.toLowerCase(), i]));
  const rows: PreparedIndicatorRow[] = table.rows.map((row, i) => {
    const p = place(i);
    const rawInd = m.fixedIndicator ?? get(row, m.indicatorColumn);
    const canonical = byKey.get(rawInd.trim().toLowerCase())?.code ?? rawInd.trim();
    return {
      row: i + 1,
      placeName: perRow[i].rawName,
      geoUnitId: p.id,
      excluded: p.excluded,
      indicatorCode: canonical,
      yearRaw: get(row, m.year),
      valueRaw: get(row, m.value),
      lowerRaw: get(row, m.lower),
      upperRaw: get(row, m.upper),
      sexRaw: get(row, m.sex),
      ageRaw: get(row, m.ageGroup),
      residenceRaw: get(row, m.residence),
      note: get(row, m.note) || null,
      periodLabel: m.periodLabel,
      isEstimate: m.isEstimate,
    };
  });
  return { kind: "indicator_values" as const, ...validateIndicatorRows(rows, indicators) };
}

export async function saveDecisionsAndValidate(
  runId: number,
  decisions: Record<string, number | null>,
  confirmAsAlias: boolean,
  actorId: string,
): Promise<ValidationReport> {
  const s = await getUploadSession(runId);
  if (!s) throw new Error("Upload not found");
  const { session } = s;
  if (session.stage === "done" || session.stage === "cancelled") throw new Error("Upload is closed");
  const pendingByKey = new Map((session.pending ?? []).map((p) => [p.key, p]));
  const clean: Record<string, number | null> = {};
  for (const [k, v] of Object.entries(decisions)) {
    if (!pendingByKey.has(k)) continue;
    clean[k] = v;
  }
  // Confirmed matches become aliases so future uploads match automatically.
  if (confirmAsAlias) {
    for (const [k, v] of Object.entries(clean)) {
      const p = pendingByKey.get(k);
      if (v != null && p && p.rawName) {
        await confirmAlias({ geoUnitId: v, alias: p.rawName, actorId, origin: "upload-review" });
      }
    }
  }
  const next: UploadSession = { ...session, decisions: clean };
  const { report } = await buildValidation(next);
  await saveSession(runId, { ...next, validation: report, stage: "validated" });
  return report;
}

/* ── Step 4: create the draft ────────────────────────────────────────────── */

export async function createDraftFromUpload(
  runId: number,
  actorId: string,
): Promise<{ datasetId: number } | { report: ValidationReport }> {
  const s = await getUploadSession(runId);
  if (!s) throw new Error("Upload not found");
  const { session } = s;
  if (session.stage === "done" && session.datasetId) return { datasetId: session.datasetId };
  if (session.stage !== "validated") throw new Error("Validate the upload first");
  // Re-validate from scratch: never trust a stale report.
  const v = await buildValidation(session);
  if (!v.report.ok) {
    await saveSession(runId, { ...session, validation: v.report });
    return { report: v.report };
  }
  const warnings = v.report.issues
    .filter((i) => i.severity === "warning")
    .map((i) => `${i.message}${i.rows.length ? ` (rows ${i.rows.slice(0, 10).join(", ")}${i.rows.length > 10 ? "…" : ""})` : ""}`);
  const meta = {
    sourceId: session.sourceId,
    seriesKey: session.seriesKey,
    title: session.title,
    description: `Uploaded from ${session.fileName}`,
    releaseDate: session.releaseDate,
    isSynthetic: session.isSynthetic,
    fileKey: session.fileKey,
    uploadedBy: actorId,
    warnings,
  };
  const draft =
    v.kind === "outbreak_reports"
      ? await createOutbreakDraft(meta, v.values)
      : await createIndicatorDraft(meta, v.values);
  await saveSession(
    runId,
    { ...session, validation: v.report, stage: "done", datasetId: draft.datasetId },
    {
      status: "succeeded",
      datasetId: draft.datasetId,
      finishedAt: new Date(),
      log: `Draft dataset #${draft.datasetId} v${draft.version} created from ${session.fileName} (${draft.inserted} rows)`,
    },
  );
  return { datasetId: draft.datasetId };
}

export async function cancelUpload(runId: number, actorId: string): Promise<void> {
  const s = await getUploadSession(runId);
  if (!s || s.session.stage === "done") return;
  await saveSession(
    runId,
    { ...s.session, stage: "cancelled" },
    { status: "failed", error: "Cancelled by editor", finishedAt: new Date() },
  );
  await writeAudit({ actorId, action: "upload.cancel", entity: "import_run", entityId: runId });
}

/** Preview helper for the mapping screen. */
export async function previewRows(session: UploadSession, n = 8): Promise<string[][]> {
  const t = await loadTable(session);
  return t.rows.slice(0, n);
}
