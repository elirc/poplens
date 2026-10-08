import { describe, expect, it, vi } from "vitest";
import { DEFAULT_PLAN_LIMITS } from "@/lib/limits";
import {
  checkLicences,
  evaluateDownloadGate,
  planDecision,
  type GateDeps,
  type SourceLicence,
} from "./licence";

/**
 * Spec definition of done: "Unit tests cover … licence gating of downloads".
 * Downloads are offered only for datasets whose licence allows
 * redistribution; plan limits are enforced on the server; the licence check
 * comes first and a refusal never consumes quota.
 */

const open: SourceLicence = {
  id: 1,
  publisher: "The World Bank",
  title: "WDI",
  licence: "CC BY 4.0",
  licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
  allowsRedistribution: true,
};
const restricted: SourceLicence = {
  id: 2,
  publisher: "The DHS Program",
  title: "DHS indicator API",
  licence: "DHS Program terms of use",
  licenceUrl: null,
  allowsRedistribution: false,
};
const restricted2: SourceLicence = { ...restricted, id: 3, publisher: "WHO", licence: "CC BY-NC-SA 3.0 IGO" };

function fakeDeps(planCode: "free" | "pro" | "org" | "capped", used = 0) {
  const limits =
    planCode === "capped"
      ? { ...DEFAULT_PLAN_LIMITS.pro!, downloadsPerDay: 2 }
      : DEFAULT_PLAN_LIMITS[planCode]!;
  const deps: GateDeps = {
    getUserPlan: vi.fn(async () => ({ planCode, limits })),
    consumeDailyQuota: vi.fn(async (_u: string, _k: "download", limit: number | null) => {
      if (limit === null) return { allowed: true, used: 0, limit: null };
      if (limit <= 0) return { allowed: false, used: 0, limit };
      if (used >= limit) return { allowed: false, used: limit, limit };
      return { allowed: true, used: used + 1, limit };
    }),
  };
  return deps;
}

describe("checkLicences", () => {
  it("allows a table whose every source allows redistribution", () => {
    expect(checkLicences([open, open])).toEqual({ ok: true });
  });

  it("refuses with 403 and names the licence when a source forbids redistribution", () => {
    const r = checkLicences([open, restricted]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(403);
    expect(r.code).toBe("licence");
    expect(r.message).toContain("The DHS Program");
    expect(r.message).toContain('"DHS Program terms of use"');
    expect(r.message).not.toContain("World Bank");
  });

  it("names every blocking source once", () => {
    const r = checkLicences([restricted, restricted2, restricted]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message.match(/The DHS Program/g)).toHaveLength(1);
    expect(r.message).toContain("CC BY-NC-SA 3.0 IGO");
  });

  it("an empty source list has nothing to block (empty tables are refused elsewhere)", () => {
    expect(checkLicences([]).ok).toBe(true);
  });
});

describe("evaluateDownloadGate — order: licence → account → plan", () => {
  it("licence refusal comes first: no plan lookup, no quota consumed, even for Pro", async () => {
    const deps = fakeDeps("pro");
    const r = await evaluateDownloadGate({ sources: [restricted], userId: "u1" }, deps);
    expect(r).toMatchObject({ ok: false, status: 403, code: "licence" });
    expect(deps.getUserPlan).not.toHaveBeenCalled();
    expect(deps.consumeDailyQuota).not.toHaveBeenCalled();
  });

  it("licence refusal also wins over a missing account", async () => {
    const deps = fakeDeps("free");
    const r = await evaluateDownloadGate({ sources: [restricted], userId: null }, deps);
    expect(r).toMatchObject({ status: 403, code: "licence" });
  });

  it("anonymous users are asked to sign in (401) once the licence allows it", async () => {
    const deps = fakeDeps("pro");
    const r = await evaluateDownloadGate({ sources: [open], userId: null }, deps);
    expect(r).toMatchObject({ ok: false, status: 401, code: "auth", actionUrl: "/sign-in" });
    expect(deps.consumeDailyQuota).not.toHaveBeenCalled();
  });

  it("free plan (downloadsPerDay = 0) gets the Pro upsell (402)", async () => {
    const deps = fakeDeps("free");
    const r = await evaluateDownloadGate({ sources: [open], userId: "u1" }, deps);
    expect(r).toMatchObject({ ok: false, status: 402, code: "plan", actionUrl: "/pricing" });
    expect(deps.consumeDailyQuota).toHaveBeenCalledWith("u1", "download", 0);
  });

  it("Pro (unlimited) is allowed and passes null as the limit", async () => {
    const deps = fakeDeps("pro");
    const r = await evaluateDownloadGate({ sources: [open, open], userId: "u1" }, deps);
    expect(r).toMatchObject({ ok: true, planCode: "pro" });
    expect(deps.consumeDailyQuota).toHaveBeenCalledWith("u1", "download", null);
  });

  it("a capped plan is allowed under its limit and refused (429) once exhausted", async () => {
    expect(await evaluateDownloadGate({ sources: [open], userId: "u1" }, fakeDeps("capped", 1))).toMatchObject({
      ok: true,
      used: 2,
      limit: 2,
    });
    const r = await evaluateDownloadGate({ sources: [open], userId: "u1" }, fakeDeps("capped", 2));
    expect(r).toMatchObject({ ok: false, status: 429, code: "quota" });
    if (!r.ok) expect(r.message).toContain("2 downloads today");
  });
});

describe("planDecision", () => {
  it("treats a zero limit as an upsell, not a quota error", () => {
    const r = planDecision({ planCode: "free", limits: DEFAULT_PLAN_LIMITS.free! }, { allowed: false, used: 0, limit: 0 });
    expect(r).toMatchObject({ status: 402, code: "plan" });
  });
});
