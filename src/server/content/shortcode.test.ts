import { describe, expect, it } from "vitest";
import { STORY_SEEDS } from "@/server/seed/content";
import { chartSpecFromRecord, parseAttributes, parseShortcode } from "./shortcode";
import { inlineText, parseInline, parseStory, safeHref } from "./markdown";

describe("parseShortcode", () => {
  it("parses the documented contract", () => {
    const r = parseShortcode('{{chart type="trend" indicator="u5mr" places="NG-KN,NG" year="2018"}}');
    expect(r).toEqual({
      ok: true,
      value: { type: "trend", indicator: "u5mr", places: ["NG-KN", "NG"], year: 2018, level: "state", title: null },
    });
  });

  it("tolerates a trailing space before the closing braces and upper-cases places", () => {
    const r = parseShortcode('{{chart type="bar" indicator="anc4" places="ng-kn, ng-la" }}');
    expect(r.ok && r.value.places).toEqual(["NG-KN", "NG-LA"]);
  });

  it("accepts single and typographic quotes", () => {
    expect(parseShortcode("{{chart type='top5' indicator='u5mr'}}").ok).toBe(true);
    expect(parseShortcode("{{chart type=“top5” indicator=“u5mr”}}").ok).toBe(true);
  });

  it("supports top5 with level and an optional title", () => {
    const r = parseShortcode('{{chart type="top5" indicator="zero_dose" year="2023" level="lga" title="Worst LGAs"}}');
    expect(r.ok && r.value).toMatchObject({ type: "top5", level: "lga", year: 2023, title: "Worst LGAs", places: [] });
  });

  it.each([
    ['{{map indicator="u5mr"}}', /Unknown shortcode "map"/],
    ['{{chart type="pie" indicator="u5mr" places="NG"}}', /Unknown chart type "pie"/],
    ['{{chart indicator="u5mr" places="NG"}}', /Missing type/],
    ['{{chart type="trend" places="NG"}}', /Missing indicator/],
    ['{{chart type="trend" indicator="u5mr"}}', /needs places/],
    ['{{chart type="top5" indicator="u5mr" places="NG"}}', /remove places/],
    ['{{chart type="bar" indicator="u5mr" places="NG" year="20x8"}}', /Invalid year/],
    ['{{chart type="bar" indicator="u5mr" places="NG" level="state"}}', /only applies to top5/],
    ['{{chart type="bar" indicator="u5mr" places="NG" colour="red"}}', /Unknown attribute "colour"/],
    ['{{chart type="bar" indicator="u5mr" places="NG,<script>"}}', /Invalid place code/],
    ['{{chart type="bar indicator="u5mr"}}', /Malformed attributes/],
    ['{{chart type="trend" indicator="u5mr" places="A1,A2,A3,A4,A5,A6,A7"}}', /At most 6 places/],
    ["{{}}", /Empty shortcode/],
  ])("rejects %s with a readable message (never throws)", (raw, msg) => {
    const r = parseShortcode(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(msg);
  });

  it("deduplicates places", () => {
    const r = chartSpecFromRecord({ type: "bar", indicator: "u5mr", places: "NG,NG,NG-KN" });
    expect(r.ok && r.value.places).toEqual(["NG", "NG-KN"]);
  });

  it("parseAttributes rejects duplicates and unterminated quotes", () => {
    expect(parseAttributes('a="1" a="2"')).toBeNull();
    expect(parseAttributes('a="1')).toBeNull();
    expect(parseAttributes("a=1 b=two")).toEqual({ a: "1", b: "two" });
  });
});

describe("parseStory (restricted markdown)", () => {
  it("renders every seeded story shortcode as a valid chart block", () => {
    for (const s of STORY_SEEDS) {
      const blocks = parseStory(s.body);
      expect(blocks.filter((b) => b.t === "chart_error")).toEqual([]);
      expect(blocks.filter((b) => b.t === "chart").length).toBeGreaterThanOrEqual(3);
    }
  });

  it("parses the seeded disclaimer quote, headings and lists", () => {
    const blocks = parseStory(STORY_SEEDS[0].body);
    expect(blocks[0]!.t).toBe("quote");
    const headings = blocks.filter((b) => b.t === "heading");
    expect(headings.length).toBe(4);
    const list = blocks.find((b) => b.t === "list");
    expect(list && list.t === "list" && list.items.length).toBe(3);
  });

  it("turns an unknown shortcode into a visible error block", () => {
    const blocks = parseStory("Intro\n\n{{map indicator=\"u5mr\"}}\n\nOutro");
    expect(blocks.map((b) => b.t)).toEqual(["paragraph", "chart_error", "paragraph"]);
  });

  it("never passes raw HTML through — it stays text", () => {
    const blocks = parseStory('<script>alert("x")</script>\n\n<img src=x onerror=alert(1)>');
    expect(blocks).toEqual([
      { t: "paragraph", c: [{ t: "text", v: '<script>alert("x")</script>' }] },
      { t: "paragraph", c: [{ t: "text", v: "<img src=x onerror=alert(1)>" }] },
    ]);
  });

  it("joins soft-wrapped paragraph lines and splits on blank lines", () => {
    const blocks = parseStory("one\ntwo\n\nthree");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({ t: "paragraph", c: [{ t: "text", v: "one two" }] });
  });

  it("demotes # to h2, supports ordered lists and rules, normalises CRLF", () => {
    const blocks = parseStory("# Title\r\n\r\n1. a\r\n2. b\r\n\r\n---\r\n");
    expect(blocks.map((b) => b.t)).toEqual(["heading", "list", "hr"]);
    expect(blocks[0]!.t === "heading" && blocks[0]!.level).toBe(2);
    expect(blocks[1]!.t === "list" && blocks[1]!.ordered).toBe(true);
  });
});

describe("parseInline", () => {
  it("handles strong, em, code and safe links", () => {
    expect(parseInline("**bold** and *it* and `x` [PopLens](/explore)")).toEqual([
      { t: "strong", c: [{ t: "text", v: "bold" }] },
      { t: "text", v: " and " },
      { t: "em", c: [{ t: "text", v: "it" }] },
      { t: "text", v: " and " },
      { t: "code", v: "x" },
      { t: "text", v: " " },
      { t: "link", href: "/explore", c: [{ t: "text", v: "PopLens" }] },
    ]);
  });

  it("drops unsafe link targets to plain text", () => {
    expect(parseInline("[click](javascript:alert(1))")).toEqual([{ t: "text", v: "click" }]);
    expect(safeHref("//evil.example")).toBeNull();
    expect(safeHref("https://dhsprogram.com")).toBe("https://dhsprogram.com");
  });

  it("does not treat snake_case underscores as emphasis", () => {
    expect(inlineText(parseInline("use full_immunisation_rate here"))).toBe("use full_immunisation_rate here");
    expect(parseInline("full_immunisation_rate")).toEqual([{ t: "text", v: "full_immunisation_rate" }]);
  });

  it("leaves unmatched markers as literal text and honours escapes", () => {
    expect(parseInline("2 * 3 = 6")).toEqual([{ t: "text", v: "2 * 3 = 6" }]);
    expect(parseInline("\\*not em\\*")).toEqual([{ t: "text", v: "*not em*" }]);
  });
});
