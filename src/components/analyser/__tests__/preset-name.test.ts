import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@spectrum-aura/engine/settings";
import { EFFECT_TOGGLES } from "../command-items";
import { presetName } from "../preset-name";

describe("presetName", () => {
  const outrun = { ...DEFAULT_SETTINGS, view: "outrun" as const };

  it("names a preset after its view", () => {
    expect(presetName(outrun, [])).toBe("Outrun");
  });

  it("adds a number only when the name is taken", () => {
    expect(presetName(outrun, ["Outrun"])).toBe("Outrun 2");
    expect(presetName(outrun, ["Outrun", "Outrun 2"])).toBe("Outrun 3");
  });

  it("mentions the first effect switched on beyond the defaults", () => {
    const extra = EFFECT_TOGGLES.find((e) => DEFAULT_SETTINGS[e.key] !== true)!;
    const settings = { ...outrun, postFxEnabled: true, [extra.key]: true };
    expect(presetName(settings, [])).toBe(`Outrun · ${extra.label}`);
    expect(presetName({ ...settings, postFxEnabled: false }, [])).toBe("Outrun");
  });
});
