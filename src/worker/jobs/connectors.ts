import type { JobDef } from "./types";

/**
 * Connector jobs (owned by the data-pipeline area). Each run executes the
 * configured connector adapter and lands a draft dataset with a comparison
 * against the published version. Implemented in src/server/pipeline.
 */
export const connectorJobs: JobDef[] = [
  // Filled in by the pipeline implementation:
  // { name: 'connector.dhs',       cron: '0 2 * * 0', handler: … }
  // { name: 'connector.who',       cron: '0 3 * * 0', handler: … }
  // { name: 'connector.worldbank', cron: '0 4 * * 0', handler: … }
];
