import { beforeEach, describe, expect, it } from "vitest";
import { _resetRateLimiter, rateLimit } from "@/lib/rate-limit";
import {
  API_BURST_PER_MINUTE,
  API_BURST_WINDOW_MS,
  decideKeyAccess,
  displayPrefix,
  extractApiKey,
  generateApiKey,
  hashApiKey,
  isWellFormedApiKey,
  secondsUntilLagosMidnight,
  verifyApiKey,
} from "./keys";

describe("API key generation and hashing", () => {
  it("generates pl_live_<32 hex> keys with a SHA-256 hash and a 12-char prefix", () => {
    const k = generateApiKey();
    expect(k.plaintext).toMatch(/^pl_live_[0-9a-f]{32}$/);
    expect(k.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(k.hash).toBe(hashApiKey(k.plaintext));
    expect(k.prefix).toBe(k.plaintext.slice(0, 12));
    expect(displayPrefix(k.plaintext)).toHaveLength(12);
    // The stored hash never contains the plaintext.
    expect(k.hash).not.toContain(k.plaintext.slice(8));
  });

  it("generates distinct keys", () => {
    const set = new Set(Array.from({ length: 50 }, () => generateApiKey().plaintext));
    expect(set.size).toBe(50);
  });

  it("hashes deterministically (known SHA-256 vector)", () => {
    expect(hashApiKey("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("verifies only the exact key against its stored hash", () => {
    const k = generateApiKey();
    expect(verifyApiKey(k.plaintext, k.hash)).toBe(true);
    const other = generateApiKey();
    expect(verifyApiKey(other.plaintext, k.hash)).toBe(false);
    expect(verifyApiKey(k.plaintext.toUpperCase(), k.hash)).toBe(false);
    expect(verifyApiKey("", k.hash)).toBe(false);
    expect(verifyApiKey(k.plaintext + "0", k.hash)).toBe(false);
  });

  it("rejects malformed keys", () => {
    expect(isWellFormedApiKey("pl_live_" + "a".repeat(32))).toBe(true);
    expect(isWellFormedApiKey("pl_test_" + "a".repeat(32))).toBe(false);
    expect(isWellFormedApiKey("pl_live_" + "g".repeat(32))).toBe(false);
    expect(isWellFormedApiKey("pl_live_" + "a".repeat(31))).toBe(false);
  });
});

describe("extractApiKey", () => {
  it("reads a Bearer token", () => {
    expect(extractApiKey(new Headers({ Authorization: "Bearer pl_live_x" }))).toBe("pl_live_x");
    expect(extractApiKey(new Headers({ authorization: "bearer   pl_live_y " }))).toBe("pl_live_y");
  });
  it("falls back to x-api-key", () => {
    expect(extractApiKey(new Headers({ "x-api-key": "pl_live_z" }))).toBe("pl_live_z");
  });
  it("returns null when absent or not a bearer scheme", () => {
    expect(extractApiKey(new Headers())).toBeNull();
    expect(extractApiKey(new Headers({ Authorization: "Basic abc" }))).toBeNull();
  });
});

describe("decideKeyAccess (401/403 gate)", () => {
  const base = { found: true, revoked: false, apiAccess: true, apiRequestsPerDay: 10_000 };
  it("401 for unknown keys", () => {
    expect(decideKeyAccess({ ...base, found: false })).toMatchObject({ ok: false, status: 401 });
  });
  it("403 for revoked keys", () => {
    expect(decideKeyAccess({ ...base, revoked: true })).toMatchObject({ ok: false, status: 403, code: "api_key_revoked" });
  });
  it("403 for plans without API access (free)", () => {
    expect(decideKeyAccess({ ...base, apiAccess: false, apiRequestsPerDay: 0 })).toMatchObject({
      ok: false,
      status: 403,
      code: "plan_has_no_api_access",
    });
    expect(decideKeyAccess({ ...base, apiRequestsPerDay: 0 })).toMatchObject({ ok: false, status: 403 });
  });
  it("passes paid plans with their daily limit (null = unlimited)", () => {
    expect(decideKeyAccess(base)).toEqual({ ok: true, dailyLimit: 10_000 });
    expect(decideKeyAccess({ ...base, apiRequestsPerDay: null })).toEqual({ ok: true, dailyLimit: null });
  });
});

describe("API burst limit (60/min per key)", () => {
  beforeEach(() => _resetRateLimiter());

  it("allows 60 requests in a window and rejects the 61st", () => {
    for (let i = 0; i < API_BURST_PER_MINUTE; i++) {
      expect(rateLimit("api-key:1", API_BURST_PER_MINUTE, API_BURST_WINDOW_MS).allowed).toBe(true);
    }
    const over = rateLimit("api-key:1", API_BURST_PER_MINUTE, API_BURST_WINDOW_MS);
    expect(over.allowed).toBe(false);
    expect(over.remaining).toBe(0);
  });

  it("counts keys independently", () => {
    for (let i = 0; i < API_BURST_PER_MINUTE; i++) rateLimit("api-key:1", API_BURST_PER_MINUTE, API_BURST_WINDOW_MS);
    expect(rateLimit("api-key:2", API_BURST_PER_MINUTE, API_BURST_WINDOW_MS).allowed).toBe(true);
  });
});

describe("secondsUntilLagosMidnight", () => {
  it("counts down to 00:00 Africa/Lagos (UTC+1)", () => {
    // 22:30 UTC = 23:30 Lagos → 30 minutes left.
    expect(secondsUntilLagosMidnight(new Date("2026-03-01T22:30:00Z"))).toBe(1800);
    // 23:00 UTC = 00:00 Lagos → a full day.
    expect(secondsUntilLagosMidnight(new Date("2026-03-01T23:00:00Z"))).toBe(86_400);
  });
});
