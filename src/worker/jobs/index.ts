import type { JobDef } from "./types";
import { connectorJobs } from "./connectors";
import { reportJobs } from "./reports";

export const JOBS: JobDef[] = [...connectorJobs, ...reportJobs];
export type { JobDef } from "./types";
