import { z } from "zod";
import { env } from "@/env";
import { requireRole } from "@/lib/session";
import { MAX_UPLOAD_BYTES } from "@/server/pipeline/parse";
import { startUpload } from "@/server/pipeline/uploads";

/**
 * Step 1 of the upload wizard. A route handler (not a Server Action) because
 * Server Actions cap request bodies at 1 MB by default and uploads may be up
 * to 10 MB. Same-origin check + session role gate; responds with a 303 to
 * the wizard (or back to the form with ?error=).
 */

const meta = z.object({
  kind: z.enum(["indicator_values", "outbreak_reports"]),
  title: z.string().trim().min(3, "title is too short").max(200),
  seriesKey: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]{2,80}$/, "series key: lowercase letters, digits and dashes"),
  sourceId: z.coerce.number().int().positive("choose a source"),
  isSynthetic: z.boolean(),
  releaseDate: z
    .string()
    .trim()
    .transform((s) => (s === "" ? null : s))
    .refine((s) => s === null || /^\d{4}-\d{2}-\d{2}$/.test(s), "release date must be YYYY-MM-DD"),
});

function back(req: Request, path: string): Response {
  return Response.redirect(new URL(path, req.url), 303);
}

export async function POST(req: Request) {
  // CSRF: browsers send Origin on POST; it must be our own origin.
  const origin = req.headers.get("origin");
  const allowed = new Set([new URL(env.APP_URL).origin, new URL(req.url).origin]);
  if (origin && !allowed.has(origin)) {
    return new Response("Cross-origin upload refused", { status: 403 });
  }
  let user;
  try {
    user = await requireRole("data_editor");
  } catch {
    return new Response("Forbidden", { status: 403 });
  }
  try {
    const fd = await req.formData();
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) throw new Error("Choose a CSV or Excel file");
    if (file.size > MAX_UPLOAD_BYTES) throw new Error("File is larger than 10 MB");
    const s = (k: string) => (typeof fd.get(k) === "string" ? (fd.get(k) as string) : "");
    const m = meta.parse({
      kind: s("kind"),
      title: s("title"),
      seriesKey: s("seriesKey"),
      sourceId: s("sourceId"),
      isSynthetic: s("isSynthetic") === "on",
      releaseDate: s("releaseDate"),
    });
    const runId = await startUpload({
      buffer: Buffer.from(await file.arrayBuffer()),
      fileName: file.name,
      contentType: file.type,
      ...m,
      actorId: user.id,
    });
    return back(req, `/editor/uploads/${runId}`);
  } catch (e) {
    const message =
      e instanceof z.ZodError
        ? e.issues.map((i) => i.message).join("; ")
        : e instanceof Error
          ? e.message
          : String(e);
    return back(req, `/editor/uploads?error=${encodeURIComponent(message.slice(0, 300))}`);
  }
}
