import { describe, expect, it } from "vitest";
import {
  facilitiesGeoUrl,
  facilitiesHref,
  formatDistance,
  pageCount,
  parseFacilityQuery,
  parseNearestParams,
} from "@/app/(public)/facilities/_lib/filters";

describe("parseFacilityQuery", () => {
  it("defaults when empty", () => {
    expect(parseFacilityQuery({})).toEqual({
      state: null,
      lga: null,
      care: [],
      own: [],
      type: null,
      page: 1,
      view: "map",
    });
  });

  it("parses the profile deep link and lists in canonical order", () => {
    const q = parseFacilityQuery(
      new URLSearchParams("lga=NG-KN-GWALE&care=tertiary,primary,bogus&own=ngo,public&page=3&view=ppf"),
    );
    expect(q.lga).toBe("NG-KN-GWALE");
    expect(q.care).toEqual(["primary", "tertiary"]);
    expect(q.own).toEqual(["public", "ngo"]);
    expect(q.page).toBe(3);
    expect(q.view).toBe("ppf");
  });

  it("drops invalid codes, pages and over-long types", () => {
    const q = parseFacilityQuery({ state: "NG KN; drop", page: "-2", type: "x".repeat(200) });
    expect(q.state).toBeNull();
    expect(q.page).toBe(1);
    expect(q.type).toBeNull();
  });

  it("takes the first value of repeated params", () => {
    expect(parseFacilityQuery({ type: ["Clinic", "Health Post"] }).type).toBe("Clinic");
  });
});

describe("facility hrefs", () => {
  it("round-trips through the query string and omits defaults", () => {
    const q = parseFacilityQuery(new URLSearchParams("state=NG-KN&care=secondary&type=General Hospital&page=2"));
    const href = facilitiesHref(q);
    expect(href).toBe("/facilities?state=NG-KN&care=secondary&type=General+Hospital&page=2");
    expect(parseFacilityQuery(new URLSearchParams(href.split("?")[1]))).toEqual(q);
    expect(facilitiesHref({ page: 1, view: "map" })).toBe("/facilities");
  });

  it("geo URL carries filters only (no page/view)", () => {
    expect(facilitiesGeoUrl({ lga: "NG-KN-GWALE", page: 4, view: "ppf", own: ["private"] })).toBe(
      "/api/facilities?lga=NG-KN-GWALE&own=private",
    );
  });

  it("pageCount is at least 1", () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(50)).toBe(1);
    expect(pageCount(51)).toBe(2);
  });
});

describe("formatDistance", () => {
  it("uses metres under 1 km and km above", () => {
    expect(formatDistance(412.8)).toBe("413 m");
    expect(formatDistance(2357.3)).toBe("2.4 km");
    expect(formatDistance(123_456)).toBe("123 km");
    expect(formatDistance(Number.NaN)).toBe("—");
  });
});

describe("parseNearestParams", () => {
  const p = (s: string) => parseNearestParams(new URLSearchParams(s));
  it("accepts a point in Nigeria with default n", () => {
    expect(p("lng=8.52&lat=12")).toEqual({ ok: true, lng: 8.52, lat: 12, n: 10 });
    expect(p("lng=8.52&lat=12&n=25")).toMatchObject({ ok: true, n: 25 });
  });
  it("rejects missing, non-numeric, out-of-country and bad n", () => {
    expect(p("lng=8.52").ok).toBe(false);
    expect(p("lng=abc&lat=12").ok).toBe(false);
    expect(p("lng=-0.1&lat=51.5").ok).toBe(false);
    expect(p("lng=8.5&lat=12&n=0").ok).toBe(false);
    expect(p("lng=8.5&lat=12&n=26").ok).toBe(false);
    expect(p("lng=8.5&lat=12&n=2.5").ok).toBe(false);
  });
});
