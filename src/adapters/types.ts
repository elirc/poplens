/**
 * Adapter contracts. Every adapter has a mock driver (NO network calls) and a
 * real driver, chosen by env (see src/adapters/index.ts). Feature code depends
 * only on these interfaces.
 */

export interface EmailAdapter {
  send(msg: {
    to: string;
    subject: string;
    html: string;
    text?: string;
  }): Promise<{ id: string }>;
}

export interface SmsAdapter {
  sendSms(msg: { to: string; message: string }): Promise<{ id: string }>;
}

export interface CheckoutSession {
  checkoutUrl: string;
  reference: string;
}

export interface TransactionResult {
  status: "success" | "failed" | "pending";
  reference: string;
  planCode?: string;
  customerCode?: string;
  subscriptionCode?: string;
  paidAt?: string;
}

export interface PaymentsAdapter {
  /** Start a hosted-checkout subscription purchase. */
  createCheckout(input: {
    email: string;
    planCode: string;
    amountKobo: number;
    reference: string;
    callbackUrl: string;
    metadata?: Record<string, unknown>;
  }): Promise<CheckoutSession>;
  verifyTransaction(reference: string): Promise<TransactionResult>;
  /** Verify a webhook payload signature (raw body + signature header). */
  verifyWebhookSignature(rawBody: string, signature: string): boolean;
  cancelSubscription(subscriptionCode: string): Promise<void>;
}

export interface StorageAdapter {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
}

/* ── Data connectors ─────────────────────────────────────────────────────── */

/** A place reference as the source gives it; resolved by the matching engine. */
export interface GeoRef {
  kind: "code" | "name";
  value: string;
  level: "nation" | "zone" | "state" | "lga" | "ward";
}

/** One staged value emitted by a connector, before place matching. */
export interface StagedValue {
  /** The source's own indicator id (e.g. DHS 'CM_ECMR_C_U5M'). */
  sourceIndicatorCode: string;
  /** PopLens indicator code it maps to (from the connector's mapping table). */
  indicatorCode: string;
  geo: GeoRef;
  year: number;
  periodLabel?: string;
  value: number;
  lower?: number;
  upper?: number;
  sex?: "all" | "male" | "female";
  ageGroup?: string;
  residence?: "all" | "urban" | "rural";
  isEstimate: boolean;
  note?: string;
}

export interface ConnectorRunResult {
  /** sources.key this data belongs to. */
  sourceKey: string;
  datasetTitle: string;
  /** Series identity for dataset versioning, e.g. 'dhs-indicators'. */
  seriesKey: string;
  releaseNote?: string;
  rows: StagedValue[];
}

export interface ConnectorAdapter {
  /** Fetch everything this connector covers for Nigeria. */
  run(): Promise<ConnectorRunResult>;
}

export type ConnectorKind = "dhs" | "who" | "worldbank";
