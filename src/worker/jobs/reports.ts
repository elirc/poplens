import { z } from "zod";
import type { JobDef } from "./types";

/**
 * Report jobs (owned by the reports/billing area). 'report.build' renders a
 * custom report PDF with @react-pdf/renderer and stores it via the storage
 * adapter, updating custom_reports.status. Enqueue with
 * enqueue('report.build', { reportId }). Idempotent (see buildReport).
 *
 * The reports module is loaded LAZILY with a dynamic import: the worker runs
 * under plain Node (tsx, CJS), and @react-pdf's ESM-only dependency chain
 * (`@react-pdf/hyphenate` exports only the `import` condition) cannot be
 * require()d — a dynamic import() performs a real ESM load even from CJS.
 * Keep the queue name literal in sync with REPORT_JOB in
 * src/server/reports/build.ts.
 */
const payload = z.object({ reportId: z.coerce.number().int().positive() });

export const reportJobs: JobDef[] = [
  {
    name: "report.build",
    handler: async (data) => {
      const { reportId } = payload.parse(data);
      const { buildReport } = await import("@/server/reports/build");
      const outcome = await buildReport(reportId);
      console.log(`[report.build] report #${reportId}: ${outcome}`);
      // A failed build is recorded on the row; don't make pg-boss retry it forever.
    },
  },
];
