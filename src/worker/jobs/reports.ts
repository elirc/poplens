import { z } from "zod";
import { buildReport, REPORT_JOB } from "@/server/reports/build";
import type { JobDef } from "./types";

/**
 * Report jobs (owned by the reports/billing area). 'report.build' renders a
 * custom report PDF with @react-pdf/renderer and stores it via the storage
 * adapter, updating custom_reports.status. Enqueue with
 * enqueue('report.build', { reportId }). Idempotent (see buildReport).
 */
const payload = z.object({ reportId: z.coerce.number().int().positive() });

export const reportJobs: JobDef[] = [
  {
    name: REPORT_JOB,
    handler: async (data) => {
      const { reportId } = payload.parse(data);
      const outcome = await buildReport(reportId);
      console.log(`[${REPORT_JOB}] report #${reportId}: ${outcome}`);
      // A failed build is recorded on the row; don't make pg-boss retry it forever.
    },
  },
];
