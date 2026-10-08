import { env } from "@/env";
import type {
  ConnectorAdapter,
  ConnectorKind,
  EmailAdapter,
  PaymentsAdapter,
  SmsAdapter,
  StorageAdapter,
} from "./types";
import { mockEmail } from "./email/mock";
import { resendEmail } from "./email/resend";
import { mockSms } from "./sms/mock";
import { termiiSms } from "./sms/termii";
import { mockPayments } from "./payments/mock";
import { paystackPayments } from "./payments/paystack";
import { localStorageAdapter } from "./storage/local";
import { s3StorageAdapter } from "./storage/s3";
import { mockDhsConnector } from "./connectors/dhs/mock";
import { realDhsConnector } from "./connectors/dhs/real";
import { mockWhoConnector } from "./connectors/who/mock";
import { realWhoConnector } from "./connectors/who/real";
import { mockWorldBankConnector } from "./connectors/worldbank/mock";
import { realWorldBankConnector } from "./connectors/worldbank/real";

export function getEmail(): EmailAdapter {
  return env.ADAPTER_EMAIL === "resend" ? resendEmail : mockEmail;
}

export function getSms(): SmsAdapter {
  return env.ADAPTER_SMS === "termii" ? termiiSms : mockSms;
}

export function getPayments(): PaymentsAdapter {
  return env.ADAPTER_PAYMENTS === "paystack" ? paystackPayments : mockPayments;
}

export function getStorage(): StorageAdapter {
  return env.ADAPTER_STORAGE === "s3" ? s3StorageAdapter : localStorageAdapter;
}

export function getConnector(kind: ConnectorKind): ConnectorAdapter {
  switch (kind) {
    case "dhs":
      return env.ADAPTER_CONNECTOR_DHS === "real"
        ? realDhsConnector
        : mockDhsConnector;
    case "who":
      return env.ADAPTER_CONNECTOR_WHO === "real"
        ? realWhoConnector
        : mockWhoConnector;
    case "worldbank":
      return env.ADAPTER_CONNECTOR_WORLDBANK === "real"
        ? realWorldBankConnector
        : mockWorldBankConnector;
  }
}

export * from "./types";
