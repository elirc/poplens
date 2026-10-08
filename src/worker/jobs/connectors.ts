import type { ConnectorKind } from "@/adapters/types";
import { connectorRunInProgress, runConnector } from "@/server/pipeline/connectors";
import type { JobDef } from "./types";

/**
 * Connector jobs (owned by the data-pipeline area). Each run executes the
 * configured connector adapter and lands a DRAFT dataset with a comparison
 * against the published version — nothing is published automatically.
 * Weekly crons (Africa/Lagos, see src/worker/index.ts). Enqueue on demand
 * with enqueue('connector.dhs', { actorId }).
 */

function connectorJob(kind: ConnectorKind, cron: string): JobDef {
  return {
    name: `connector.${kind}`,
    cron,
    handler: async (data) => {
      // pg-boss is at-least-once: skip if an identical run is already going.
      if (await connectorRunInProgress(kind)) {
        console.log(`[connector.${kind}] a run is already in progress — skipping`);
        return;
      }
      const actorId =
        data && typeof data === "object" && typeof (data as { actorId?: unknown }).actorId === "string"
          ? (data as { actorId: string }).actorId
          : null;
      const out = await runConnector(kind, actorId);
      if (!out.ok) throw new Error(`connector.${kind} run #${out.runId} failed: ${out.error}`);
      console.log(`[connector.${kind}] run #${out.runId} → draft dataset #${out.datasetId}`);
    },
  };
}

export const connectorJobs: JobDef[] = [
  connectorJob("dhs", "0 2 * * 0"),
  connectorJob("who", "0 3 * * 0"),
  connectorJob("worldbank", "0 4 * * 0"),
];
