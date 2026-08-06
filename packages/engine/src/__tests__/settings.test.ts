import { describe, expect, it } from "vitest";

import {
  DEFAULT_FX_PIPELINE_ORDER,
  DEFAULT_SETTINGS,
  FX_PIPELINE,
  FX_RANDOMIZE_GROUPS,
  FX_STATEMENT_FLAGS,
  PALETTES,
  PRESETS,
  RETRO_DISPLAY_MODES,
  RETRO_SYSTEMS,
  normalizeFxPipelineOrder,
} from "../settings";

describe("normalizeFxPipelineOrder", () => {
  it("keeps a valid custom prefix and appends missing passes in default order", () => {
    const order = normalizeFxPipelineOrder(["retro", "crt", "bloom"]);
    expect(order.slice(0, 3)).toEqual(["retro", "crt", "bloom"]);
    expect(order).toHaveLength(DEFAULT_FX_PIPELINE_ORDER.length);
    expect([...order].sort()).toEqual([...DEFAULT_FX_PIPELINE_ORDER].sort());
  });

  it("drops unknown ids and duplicates", () => {
    const order = normalizeFxPipelineOrder(["crt", "bogus", "crt", 42, null]);
    expect(order[0]).toBe("crt");
    expect(order.filter((id) => id === "crt")).toHaveLength(1);
    expect(order).toHaveLength(DEFAULT_FX_PIPELINE_ORDER.length);
  });

  it("returns the default order for non-array input", () => {
    expect(normalizeFxPipelineOrder(undefined)).toEqual(DEFAULT_FX_PIPELINE_ORDER);
    expect(normalizeFxPipelineOrder("nope")).toEqual(DEFAULT_FX_PIPELINE_ORDER);
  });
});

describe("settings schema integrity", () => {
  it("keeps FX pipeline ids unique and matching the default order", () => {
    const ids = FX_PIPELINE.map((pass) => pass.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(DEFAULT_FX_PIPELINE_ORDER).toEqual(ids);
  });

  it("only references real settings keys from FX randomize groups", () => {
    const ids = FX_RANDOMIZE_GROUPS.map((group) => group.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const group of FX_RANDOMIZE_GROUPS) {
      for (const key of group.keys) {
        expect(key in DEFAULT_SETTINGS, `unknown settings key in group ${group.id}: ${key}`).toBe(
          true,
        );
      }
    }
  });

  it("maps every statement flag to a boolean setting on a lockable group", () => {
    const groupIds = new Set(FX_RANDOMIZE_GROUPS.map((group) => group.id));
    for (const [groupId, flag] of Object.entries(FX_STATEMENT_FLAGS)) {
      expect(groupIds.has(groupId as (typeof FX_RANDOMIZE_GROUPS)[number]["id"])).toBe(true);
      expect(typeof DEFAULT_SETTINGS[flag]).toBe("boolean");
    }
  });

  it("keeps retro system ids unique and defaults valid", () => {
    const ids = RETRO_SYSTEMS.map((sys) => sys.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(DEFAULT_SETTINGS.retroSystem);
    expect(RETRO_DISPLAY_MODES).toContain(DEFAULT_SETTINGS.retroMode);
    // Shader mode indices are positional — appending is safe, reordering is
    // not. Pin the head of the list so a reorder fails loudly.
    expect(ids.slice(0, 6)).toEqual(["zx", "c64", "gameboy", "nes", "cga", "cpc"]);
  });

  it("ships three-colour palettes including the retro machines", () => {
    for (const palette of PALETTES) {
      expect(palette.colors).toHaveLength(3);
      for (const color of palette.colors) {
        expect(color).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
    const names = PALETTES.map((palette) => palette.name);
    for (const expected of ["ZX Spectrum", "Commodore 64", "Game Boy", "NES", "CGA"]) {
      expect(names).toContain(expected);
    }
  });

  it("keeps every preset key and palette index valid", () => {
    for (const [name, preset] of Object.entries(PRESETS)) {
      for (const key of Object.keys(preset)) {
        expect(key in DEFAULT_SETTINGS, `preset "${name}" sets unknown key: ${key}`).toBe(true);
      }
      if (preset.paletteIndex !== undefined) {
        expect(preset.paletteIndex).toBeGreaterThanOrEqual(0);
        expect(preset.paletteIndex).toBeLessThan(PALETTES.length);
      }
    }
    expect(Object.keys(PRESETS)).toContain("Spectrum Clash");
    expect(Object.keys(PRESETS)).toContain("PETSCII Terminal");
  });
});
