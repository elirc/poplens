"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { enqueue } from "@/server/queue";
import { publishDataset, rollbackDataset } from "@/server/datasets/versioning";
import { confirmAlias, deleteAlias } from "@/server/geo/matching";
import { runConnector } from "@/server/pipeline/connectors";
import {
  cancelUpload,
  createDraftFromUpload,
  saveDecisionsAndValidate,
  saveMapping,
} from "@/server/pipeline/uploads";
import {
  discardDraft,
  geoUnitByCode,
  QUALITY_FLAGS,
  setQualityFlag,
  upsertSource,
} from "@/server/pipeline/admin";
import type { ColumnMapping } from "@/server/pipeline/types";

/**
 * Data-editor Server Actions. Every action: requireRole("data_editor")
 * (admin passes), Zod-validated input, audited state changes (some audits
 * happen in the server modules they call). Results are reported back through
 * ?ok= / ?error= query params so pages work without client JS.
 */

function msg(e: unknown): string {
  if (e instanceof z.ZodError) return e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  return e instanceof Error ? e.message : String(e);
}

function withParam(path: string, key: "ok" | "error", value: string): string {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}${key}=${encodeURIComponent(value.slice(0, 300))}`;
}

const id = z.coerce.number().int().positive();
const optText = z
  .string()
  .trim()
  .transform((s) => (s === "" ? null : s))
  .nullable()
  .optional()
  .transform((v) => v ?? null);

function str(fd: FormData, k: string): string {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
}

/* ── Connectors ──────────────────────────────────────────────────────────── */

const connectorKind = z.enum(["dhs", "who", "worldbank"]);

export async function runConnectorAction(fd: FormData) {
  const user = await requireRole("data_editor");
  let target = "/editor/connectors";
  try {
    const kind = connectorKind.parse(str(fd, "kind"));
    const out = await runConnector(kind, user.id);
    target = out.ok
      ? withParam(`/editor/drafts/${out.datasetId}`, "ok", `Connector run #${out.runId} created this draft`)
      : withParam(target, "error", `Run #${out.runId} failed: ${out.error}`);
  } catch (e) {
    target = withParam(target, "error", msg(e));
  }
  revalidatePath("/editor", "layout");
  redirect(target);
}

export async function queueConnectorAction(fd: FormData) {
  const user = await requireRole("data_editor");
  let target = "/editor/connectors";
  try {
    const kind = connectorKind.parse(str(fd, "kind"));
    const jobId = await enqueue(`connector.${kind}`, { actorId: user.id });
    await writeAudit({ actorId: user.id, action: "connector.enqueue", entity: "connector", entityId: kind, detail: { jobId } });
    target = withParam(target, "ok", `Queued ${kind} run for the worker (job ${jobId ?? "?"})`);
  } catch (e) {
    target = withParam(target, "error", msg(e));
  }
  redirect(target);
}

/* ── Publish / rollback / discard ────────────────────────────────────────── */

export async function publishDatasetAction(fd: FormData) {
  const user = await requireRole("data_editor");
  let target = "/editor/drafts";
  try {
    const datasetId = id.parse(str(fd, "datasetId"));
    if (str(fd, "confirm") !== "yes") throw new Error("Tick the confirmation box to publish");
    const res = await publishDataset(datasetId, user.id);
    target = withParam(
      `/editor/drafts/${datasetId}`,
      "ok",
      res.supersededDatasetId
        ? `Published. Dataset #${res.supersededDatasetId} is now superseded.`
        : "Published.",
    );
  } catch (e) {
    target = withParam(target, "error", msg(e));
  }
  // Public pages are time-revalidated; refresh them now so the change shows.
  revalidatePath("/", "layout");
  redirect(target);
}

export async function rollbackDatasetAction(fd: FormData) {
  const user = await requireRole("data_editor");
  let target = "/editor/drafts";
  try {
    const datasetId = id.parse(str(fd, "datasetId"));
    if (str(fd, "confirm") !== "yes") throw new Error("Tick the confirmation box to roll back");
    const res = await rollbackDataset(datasetId, user.id);
    target = withParam(
      `/editor/drafts/${datasetId}`,
      "ok",
      res.restoredDatasetId
        ? `Rolled back. Dataset #${res.restoredDatasetId} is published again.`
        : "Rolled back. No earlier version existed, so this series is now unpublished.",
    );
  } catch (e) {
    target = withParam(target, "error", msg(e));
  }
  revalidatePath("/", "layout");
  redirect(target);
}

export async function discardDraftAction(fd: FormData) {
  const user = await requireRole("data_editor");
  let target = "/editor/drafts";
  try {
    const datasetId = id.parse(str(fd, "datasetId"));
    await discardDraft(datasetId, user.id);
    target = withParam(target, "ok", `Draft #${datasetId} discarded`);
  } catch (e) {
    target = withParam(target, "error", msg(e));
  }
  revalidatePath("/editor", "layout");
  redirect(target);
}

/* ── Upload wizard ───────────────────────────────────────────────────────── */

const col = optText;
const indicatorMapping = z.object({
  kind: z.literal("indicator_values"),
  place: z.string().min(1, "choose the place column"),
  stateColumn: col,
  placeCode: col,
  level: z.enum(["nation", "zone", "state", "lga", "ward"]),
  year: z.string().min(1, "choose the year column"),
  indicatorColumn: col,
  fixedIndicator: col,
  value: z.string().min(1, "choose the value column"),
  lower: col,
  upper: col,
  sex: col,
  ageGroup: col,
  residence: col,
  note: col,
  isEstimate: z.boolean(),
  periodLabel: optText,
});
const outbreakMapping = z.object({
  kind: z.literal("outbreak_reports"),
  disease: z.string().min(1, "choose the disease column"),
  state: z.string().min(1, "choose the state column"),
  year: z.string().min(1, "choose the year column"),
  week: z.string().min(1, "choose the week column"),
  suspected: col,
  confirmed: col,
  deaths: col,
});

export async function saveMappingAction(fd: FormData) {
  await requireRole("data_editor");
  const runId = id.parse(str(fd, "runId"));
  let target = `/editor/uploads/${runId}`;
  try {
    const kind = str(fd, "kind");
    let mapping: ColumnMapping;
    if (kind === "outbreak_reports") {
      mapping = outbreakMapping.parse({
        kind,
        disease: str(fd, "disease"),
        state: str(fd, "state"),
        year: str(fd, "year"),
        week: str(fd, "week"),
        suspected: str(fd, "suspected"),
        confirmed: str(fd, "confirmed"),
        deaths: str(fd, "deaths"),
      });
    } else {
      mapping = indicatorMapping.parse({
        kind: "indicator_values",
        place: str(fd, "place"),
        stateColumn: str(fd, "stateColumn"),
        placeCode: str(fd, "placeCode"),
        level: str(fd, "level"),
        year: str(fd, "year"),
        indicatorColumn: str(fd, "indicatorColumn"),
        fixedIndicator: str(fd, "fixedIndicator"),
        value: str(fd, "value"),
        lower: str(fd, "lower"),
        upper: str(fd, "upper"),
        sex: str(fd, "sex"),
        ageGroup: str(fd, "ageGroup"),
        residence: str(fd, "residence"),
        note: str(fd, "note"),
        isEstimate: str(fd, "isEstimate") === "on",
        periodLabel: str(fd, "periodLabel"),
      });
      if (!mapping.indicatorColumn && !mapping.fixedIndicator) {
        throw new Error("Choose an indicator column or one catalogue indicator for the whole file");
      }
    }
    await saveMapping(runId, mapping);
  } catch (e) {
    target = withParam(target, "error", msg(e));
  }
  redirect(target);
}

export async function saveReviewAction(fd: FormData) {
  const user = await requireRole("data_editor");
  const runId = id.parse(str(fd, "runId"));
  let target = `/editor/uploads/${runId}`;
  try {
    const decisions: Record<string, number | null> = {};
    const keys = fd.getAll("placeKey").filter((k): k is string => typeof k === "string");
    for (let i = 0; i < keys.length; i++) {
      const choice = str(fd, `choice_${i}`);
      const code = str(fd, `code_${i}`).trim();
      if (code) {
        const u = await geoUnitByCode(code);
        if (!u) throw new Error(`No place has the code "${code}"`);
        decisions[keys[i]] = u.id;
      } else if (choice === "exclude") {
        decisions[keys[i]] = null;
      } else if (choice) {
        decisions[keys[i]] = id.parse(choice);
      }
      // empty choice = left unresolved → validation reports it
    }
    await saveDecisionsAndValidate(runId, decisions, str(fd, "saveAliases") === "on", user.id);
  } catch (e) {
    target = withParam(target, "error", msg(e));
  }
  redirect(target);
}

export async function backToMappingAction(fd: FormData) {
  await requireRole("data_editor");
  const runId = id.parse(str(fd, "runId"));
  redirect(`/editor/uploads/${runId}?step=mapping`);
}

export async function createDraftAction(fd: FormData) {
  const user = await requireRole("data_editor");
  const runId = id.parse(str(fd, "runId"));
  let target = `/editor/uploads/${runId}`;
  try {
    const res = await createDraftFromUpload(runId, user.id);
    target =
      "datasetId" in res
        ? withParam(`/editor/drafts/${res.datasetId}`, "ok", "Draft created from your upload — review and publish")
        : withParam(target, "error", "Validation failed — fix the errors listed below");
  } catch (e) {
    target = withParam(target, "error", msg(e));
  }
  revalidatePath("/editor", "layout");
  redirect(target);
}

export async function cancelUploadAction(fd: FormData) {
  const user = await requireRole("data_editor");
  const runId = id.parse(str(fd, "runId"));
  await cancelUpload(runId, user.id);
  redirect(withParam("/editor/uploads", "ok", `Upload #${runId} cancelled`));
}

/* ── Sources ─────────────────────────────────────────────────────────────── */

const sourceSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9-]{1,40}$/, "key: lowercase letters, digits and dashes"),
  publisher: z.string().trim().min(2),
  title: z.string().trim().min(2),
  url: z.union([z.literal(""), z.string().trim().url()]).transform((v) => v || null),
  licence: z.string().trim().min(2),
  licenceUrl: z.union([z.literal(""), z.string().trim().url()]).transform((v) => v || null),
  allowsRedistribution: z.boolean(),
  citationTemplate: optText,
  notes: optText,
});

export async function saveSourceAction(fd: FormData) {
  const user = await requireRole("data_editor");
  let target = "/editor/sources";
  try {
    const sourceId = str(fd, "id") ? id.parse(str(fd, "id")) : null;
    const input = sourceSchema.parse({
      key: str(fd, "key"),
      publisher: str(fd, "publisher"),
      title: str(fd, "title"),
      url: str(fd, "url"),
      licence: str(fd, "licence"),
      licenceUrl: str(fd, "licenceUrl"),
      allowsRedistribution: str(fd, "allowsRedistribution") === "on",
      citationTemplate: str(fd, "citationTemplate"),
      notes: str(fd, "notes"),
    });
    const savedId = await upsertSource(sourceId, input, user.id);
    target = withParam(target, "ok", `Source "${input.key}" saved (#${savedId})`);
  } catch (e) {
    target = withParam(target, "error", msg(e));
  }
  revalidatePath("/", "layout");
  redirect(target);
}

/* ── Aliases ─────────────────────────────────────────────────────────────── */

export async function addAliasAction(fd: FormData) {
  const user = await requireRole("data_editor");
  let target = "/editor/aliases";
  try {
    const parsed = z
      .object({ code: z.string().trim().min(2), alias: z.string().trim().min(2).max(120) })
      .parse({ code: str(fd, "code"), alias: str(fd, "alias") });
    const unit = await geoUnitByCode(parsed.code);
    if (!unit) throw new Error(`No place has the code "${parsed.code}"`);
    const r = await confirmAlias({ geoUnitId: unit.id, alias: parsed.alias, actorId: user.id, origin: "manual" });
    target = withParam(
      target,
      "ok",
      r.inserted ? `Alias "${parsed.alias}" → ${unit.name} added` : "Alias already exists (or equals the official name)",
    );
  } catch (e) {
    target = withParam(target, "error", msg(e));
  }
  redirect(target);
}

export async function deleteAliasAction(fd: FormData) {
  const user = await requireRole("data_editor");
  let target = "/editor/aliases";
  try {
    await deleteAlias(id.parse(str(fd, "aliasId")), user.id);
    target = withParam(target, "ok", "Alias deleted");
  } catch (e) {
    target = withParam(target, "error", msg(e));
  }
  redirect(target);
}

/* ── Quality flags ───────────────────────────────────────────────────────── */

export async function setQualityFlagAction(fd: FormData) {
  const user = await requireRole("data_editor");
  const back = str(fd, "back").startsWith("/editor") ? str(fd, "back") : "/editor/quality";
  let target = back;
  try {
    const valueId = id.parse(str(fd, "valueId"));
    const flagRaw = str(fd, "flag");
    const flag = flagRaw === "" || flagRaw === "clear" ? null : z.enum(QUALITY_FLAGS).parse(flagRaw);
    await setQualityFlag(valueId, flag, user.id);
    target = withParam(back, "ok", flag ? `Value #${valueId} flagged ${flag}` : `Flag cleared on value #${valueId}`);
  } catch (e) {
    target = withParam(back, "error", msg(e));
  }
  revalidatePath("/editor", "layout");
  redirect(target);
}
