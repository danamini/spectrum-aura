import { describe, expect, it } from "vitest";
import { EFFECT_TOGGLES, PANEL_TABS, buildCommands, searchCommands } from "../command-items";
import { DEFAULT_SETTINGS } from "@spectrum-aura/engine/settings";
import { VISUALS } from "@spectrum-aura/engine/visuals";

const looks = [{ name: "Outrun Sunset" }, { name: "Mandala Bloom" }];
const commands = buildCommands(looks);

describe("command palette index", () => {
  it("lists every view, look, effect and settings section", () => {
    for (const visual of VISUALS) {
      expect(commands.some((c) => c.kind === "View" && c.label === visual.label)).toBe(true);
    }
    expect(commands.filter((c) => c.kind === "Preset").map((c) => c.label)).toEqual([
      "Outrun Sunset",
      "Mandala Bloom",
    ]);
    expect(commands.filter((c) => c.kind === "Panel")).toHaveLength(PANEL_TABS.length);
    expect(new Set(commands.map((c) => c.id)).size).toBe(commands.length);
  });

  it("only offers on/off commands for settings that are booleans", () => {
    expect(EFFECT_TOGGLES.length).toBeGreaterThan(12);
    for (const command of commands) {
      if (command.toggle) expect(typeof DEFAULT_SETTINGS[command.toggle]).toBe("boolean");
    }
  });

  it("puts a label that starts with the query first", () => {
    const results = searchCommands(commands, "blo");
    expect(results[0]?.label).toBe("Bloom");
    expect(results.map((c) => c.label)).toContain("Mandala Bloom");
  });

  it("matches every word, in any order, across label, kind and keywords", () => {
    expect(searchCommands(commands, "preset outrun").map((c) => c.label)).toEqual([
      "Outrun Sunset",
    ]);
    expect(searchCommands(commands, "view hi-fi")[0]?.label).toBe("Hi-Fi");
    expect(searchCommands(commands, "zzzz")).toEqual([]);
  });

  it("shows shortcuts beside actions and the first nine looks", () => {
    expect(commands.find((c) => c.id === "action:fullscreen")?.cap).toBe("F");
    expect(commands.find((c) => c.id === "look:0")?.cap).toBe("1");
  });
});
