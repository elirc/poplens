import type { JobDef } from "./types";

/**
 * Report jobs (owned by the reports/billing area). 'report.build' renders a
 * custom report PDF with @react-pdf/renderer and stores it via the storage
 * adapter, updating custom_reports.status.
 */
export const reportJobs: JobDef[] = [
  // Filled in by the reports implementation:
  // { name: 'report.build', handler: … }
];
