import { z } from "zod";

/**
 * All environment access goes through this module. Never read process.env
 * directly elsewhere — add the variable here with a Zod schema instead.
 */

const driver = <T extends readonly [string, ...string[]]>(values: T, def: T[number]) =>
  z.enum(values as unknown as [string, ...string[]]).default(def);

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z
    .string()
    .url()
    .default("postgres://postgres:postgres@localhost:5541/poplens_dev"),
  TEST_DATABASE_URL: z
    .string()
    .url()
    .default("postgres://postgres:postgres@localhost:5541/poplens_test"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  AUTH_SECRET: z.string().min(8).default("dev-only-secret-change-me"),
  AUTH_MODE: z.enum(["mock", "real"]).default("mock"),

  ADAPTER_EMAIL: driver(["mock", "resend"] as const, "mock"),
  ADAPTER_SMS: driver(["mock", "termii"] as const, "mock"),
  ADAPTER_PAYMENTS: driver(["mock", "paystack"] as const, "mock"),
  ADAPTER_STORAGE: driver(["local", "s3"] as const, "local"),
  ADAPTER_CONNECTOR_DHS: driver(["mock", "real"] as const, "mock"),
  ADAPTER_CONNECTOR_WHO: driver(["mock", "real"] as const, "mock"),
  ADAPTER_CONNECTOR_WORLDBANK: driver(["mock", "real"] as const, "mock"),

  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("PopLens <noreply@example.com>"),
  TERMII_API_KEY: z.string().optional(),
  TERMII_SENDER_ID: z.string().default("PopLens"),
  PAYSTACK_SECRET_KEY: z.string().optional(),
  PAYSTACK_PUBLIC_KEY: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: z.string().default("poplens"),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  LOCAL_STORAGE_DIR: z.string().default(".storage"),

  MAP_STYLE_URL: z
    .string()
    .url()
    .default("https://tiles.openfreemap.org/styles/positron"),

  DHS_API_BASE: z.string().url().default("https://api.dhsprogram.com/rest/dhs"),
  WHO_GHO_API_BASE: z.string().url().default("https://ghoapi.azureedge.net/api"),
  WORLD_BANK_API_BASE: z.string().url().default("https://api.worldbank.org/v2"),
});

export type Env = z.infer<typeof schema>;

function load(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment: ${parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
  }
  const env = parsed.data;

  // Safety rails required by the spec.
  if (env.NODE_ENV === "production") {
    if (env.AUTH_MODE === "mock") {
      throw new Error(
        "Refusing to start: AUTH_MODE=mock is not allowed in production.",
      );
    }
    if (env.AUTH_SECRET === "dev-only-secret-change-me") {
      throw new Error("Refusing to start: AUTH_SECRET is the dev default.");
    }
  }
  return env;
}

export const env = load();

/** True when any adapter would hit the network — used to assert mock purity in tests. */
export const isFullyMocked = () =>
  env.ADAPTER_EMAIL === "mock" &&
  env.ADAPTER_SMS === "mock" &&
  env.ADAPTER_PAYMENTS === "mock" &&
  env.ADAPTER_STORAGE === "local" &&
  env.ADAPTER_CONNECTOR_DHS === "mock" &&
  env.ADAPTER_CONNECTOR_WHO === "mock" &&
  env.ADAPTER_CONNECTOR_WORLDBANK === "mock";
