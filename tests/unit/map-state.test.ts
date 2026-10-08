import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAP_STATE,
  MAP_PARAM,
  exploreHref,
  parseCamera,
  parseMapState,
  serializeMapState,
  type MapState,
} from "@/lib/map-state";

describe("map-state URL (de)serialisation", () => {
  it("round-trips a full state", () => {
    const s: MapState = {
      indicator: "u5mr",
      year: 2018,
      level: "lga",
      parent: "NG-KN",
      method: "jenks",
      classes: 7,
      facilities: true,
      view: "table",
      camera: { lng: 8.5167, lat: 12.0022, zoom: 7.25 },
    };
    const q = serializeMapState(s);
    expect(parseMapState(q)).toEqual(s);
    expect(parseMapState(new URLSearchParams(q.toString()))).toEqual(s);
  });

  it("omits defaults so URLs stay short", () => {
    expect(serializeMapState(DEFAULT_MAP_STATE).toString()).toBe("");
    expect(serializeMapState({ indicator: "tfr" }).toString()).toBe("i=tfr");
    expect(exploreHref()).toBe("/explore");
    expect(exploreHref({ indicator: "u5mr", year: 2018, level: "state" })).toBe(
      "/explore?i=u5mr&y=2018",
    );
  });

  it("uses the documented short keys", () => {
    expect(MAP_PARAM).toEqual({
      indicator: "i",
      year: "y",
      level: "l",
      parent: "p",
      method: "m",
      classes: "k",
      facilities: "f",
      view: "v",
      camera: "c",
    });
    const q = serializeMapState({
      indicator: "anc4",
      year: 2013,
      level: "ward",
      method: "equal",
      classes: 4,
      facilities: true,
      view: "table",
    });
    expect(q.toString()).toBe("i=anc4&y=2013&l=ward&m=equal&k=4&f=1&v=table");
  });

  it("falls back to defaults for invalid values", () => {
    const s = parseMapState(
      new URLSearchParams("i=<script>&y=99&l=country&m=kmeans&k=12&f=yes&v=chart&c=abc"),
    );
    expect(s).toEqual(DEFAULT_MAP_STATE);
  });

  it("only keeps parent at LGA level", () => {
    expect(parseMapState(new URLSearchParams("l=state&p=NG-KN")).parent).toBeNull();
    expect(parseMapState(new URLSearchParams("l=lga&p=NG-KN")).parent).toBe("NG-KN");
    expect(serializeMapState({ level: "ward", parent: "NG-KN" }).has("p")).toBe(false);
  });

  it("accepts a Next searchParams record (string | string[])", () => {
    const s = parseMapState({ i: ["hiv_prev", "x"], y: "2018", l: undefined, f: "1" });
    expect(s.indicator).toBe("hiv_prev");
    expect(s.year).toBe(2018);
    expect(s.level).toBe("state");
    expect(s.facilities).toBe(true);
  });

  it("parses and bounds the camera", () => {
    expect(parseCamera("8.68,9.08,5.2")).toEqual({ lng: 8.68, lat: 9.08, zoom: 5.2 });
    expect(parseCamera("8.68,9.08")).toBeNull();
    expect(parseCamera("200,9,5")).toBeNull();
    expect(parseCamera("8,9,40")).toBeNull();
    // Rounded when serialised.
    expect(
      serializeMapState({ camera: { lng: 8.123456789, lat: 9.987654321, zoom: 5.55555 } }).get("c"),
    ).toBe("8.1235,9.9877,5.56");
  });
});
