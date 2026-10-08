/**
 * Worker job contract. Feature areas contribute jobs by exporting JobDef[]
 * from their own file under src/worker/jobs/ (imported by jobs/index.ts).
 * Handlers must be idempotent — pg-boss delivers at-least-once.
 */
export interface JobDef {
  /** Queue name, dot-namespaced: 'connector.dhs', 'report.build', … */
  name: string;
  handler: (data: unknown) => Promise<void>;
  /** Optional cron schedule (UTC) for recurring jobs. */
  cron?: string;
}
