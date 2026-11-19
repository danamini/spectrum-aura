import { describe, expect, it } from "vitest";
import { GREETS_SNIPPETS } from "../greets-source";
import { customSnippets, telemetrySnippet } from "../live-sources";
import { pickPoemLines } from "../poetry-source";
import {
  TEXT_SOURCES,
  TEXT_SOURCE_IDS,
  TEXT_STYLES,
  TEXT_STYLE_IDS,
  isTextSourceId,
  isTextStyleId,
} from "../registry";
import { parseRandomTitles } from "../wikipedia-source";

describe("text source registry", () => {
  it("lists each source and style once, with a description for the panel", () => {
    expect(new Set(TEXT_SOURCE_IDS).size).toBe(TEXT_SOURCES.length);
    expect(new Set(TEXT_STYLE_IDS).size).toBe(TEXT_STYLES.length);
    for (const source of TEXT_SOURCES) {
      expect(source.label.length, source.id).toBeGreaterThan(0);
      expect(source.description.length, source.id).toBeGreaterThan(20);
    }
    expect(TEXT_STYLES.some((style) => style.perCharacter)).toBe(true);
    expect(TEXT_STYLES.some((style) => !style.perCharacter)).toBe(true);
  });

  it("rejects ids that are not registered", () => {
    expect(isTextSourceId("poetry")).toBe(true);
    expect(isTextSourceId("nope")).toBe(false);
    expect(isTextSourceId(undefined)).toBe(false);
    expect(isTextStyleId("rain")).toBe(true);
    expect(isTextStyleId("comic-sans")).toBe(false);
  });
});

describe("custom text", () => {
  it("makes one phrase per non-empty line, trimmed", () => {
    const lines = customSnippets("  HELLO \n\n\r\nWORLD  \n   \n");
    expect(lines.map((line) => line.text)).toEqual(["HELLO", "WORLD"]);
    expect(new Set(lines.map((line) => line.id)).size).toBe(2);
  });

  it("caps line length and line count", () => {
    const text = Array.from({ length: 200 }, (_, i) => `${i}-${"x".repeat(300)}`).join("\n");
    const lines = customSnippets(text);
    expect(lines).toHaveLength(60);
    expect(Math.max(...lines.map((line) => line.text.length))).toBeLessThanOrEqual(90);
    expect(customSnippets("")).toEqual([]);
  });
});

describe("live readout", () => {
  const input = { bpm: 128, bpmConfidence: 0.9, bass: 0.8, mid: 0.4, high: 0.2, centroid: 0.35 };

  it("reports the tempo and levels actually passed in", () => {
    const lines = Array.from({ length: 6 }, (_, i) => telemetrySnippet(input, i).text);
    expect(lines).toContain("128 BPM locked");
    expect(lines).toContain("Bass 80% · Mid 40% · High 20%");
    expect(lines).toContain("Driven by the bass");
    expect(lines).toContain("One beat every 469 ms");
    expect(new Set(lines).size).toBe(6);
  });

  it("does not invent a tempo before the beat is found", () => {
    const quiet = { ...input, bpm: 0, bpmConfidence: 0 };
    const lines = Array.from({ length: 6 }, (_, i) => telemetrySnippet(quiet, i).text);
    expect(lines.join(" ")).not.toMatch(/\d+ BPM|Infinity|NaN/);
    expect(lines).toContain("Listening for the beat");
  });

  it("wraps any index, including negatives", () => {
    expect(telemetrySnippet(input, 6).text).toBe(telemetrySnippet(input, 0).text);
    expect(telemetrySnippet(input, -1).text).toBe(telemetrySnippet(input, 5).text);
  });
});

describe("poetry lines", () => {
  it("keeps lines that stand alone and strips a trailing break mark", () => {
    const lines = pickPoemLines({
      title: "Ode",
      author: "A. Poet",
      lines: ["Short", "The moon was a ghostly galleon,", "", 42, "And the highwayman came riding"],
    });
    expect(lines.map((line) => line.text)).toEqual([
      "The moon was a ghostly galleon",
      "And the highwayman came riding",
    ]);
    expect(lines[0]).toMatchObject({ author: "A. Poet", work: "Ode", creditLine: "A. Poet, Ode" });
  });

  it("returns nothing for a malformed poem", () => {
    expect(pickPoemLines({ lines: "not a list" })).toEqual([]);
    expect(pickPoemLines({})).toEqual([]);
    expect(pickPoemLines({ lines: ["x".repeat(200)] })).toEqual([]);
  });
});

describe("wikipedia titles", () => {
  it("drops disambiguation suffixes and over-long titles, and links the real article", () => {
    const titles = parseRandomTitles({
      query: {
        random: [
          { title: "Mercury (planet)" },
          { title: "A" },
          { title: "x".repeat(80) },
          { title: 7 },
          null,
          { title: "Treaty of Tordesillas" },
        ],
      },
    });
    expect(titles.map((entry) => entry.text)).toEqual(["Mercury", "Treaty of Tordesillas"]);
    expect(titles[0]!.sourceUrl).toBe("https://en.wikipedia.org/wiki/Mercury_(planet)");
  });

  it("tolerates a response that is not a random list", () => {
    expect(parseRandomTitles(null)).toEqual([]);
    expect(parseRandomTitles({ query: {} })).toEqual([]);
    expect(parseRandomTitles("<html>")).toEqual([]);
  });
});

describe("bundled scrollers", () => {
  it("are unique, non-empty and short enough to read", () => {
    expect(GREETS_SNIPPETS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(GREETS_SNIPPETS.map((entry) => entry.text)).size).toBe(GREETS_SNIPPETS.length);
    expect(Math.max(...GREETS_SNIPPETS.map((entry) => entry.text.length))).toBeLessThanOrEqual(60);
  });
});
