import { describe, expect, it } from "vitest";

import {
  ACCENT_RGB,
  APP_BACKGROUND,
  CLASSIC_PEAK_SWATCHES,
  LOCAL_DEV_URL,
  SCENE_BG_SWATCHES,
  bpmGlowStyle,
} from "../theme";

describe("theme tokens", () => {
  it("exports stable design tokens", () => {
    expect(APP_BACKGROUND).toBe("#05060a");
    expect(LOCAL_DEV_URL).toBe("http://localhost:6789");
    expect(SCENE_BG_SWATCHES).toContain(APP_BACKGROUND);
    expect(CLASSIC_PEAK_SWATCHES).toHaveLength(6);
    expect(ACCENT_RGB).toMatch(/^\d+, \d+, \d+$/);
  });

  it("bpmGlowStyle omits glow below confidence threshold", () => {
    const style = bpmGlowStyle(128, 0.3);
    expect(style.textShadow).toBeUndefined();
    expect(style.opacity).toBeCloseTo(0.3 + 0.3 * 0.4);
  });

  it("bpmGlowStyle adds emerald glow when confident", () => {
    const style = bpmGlowStyle(120, 0.8);
    expect(style.textShadow).toContain(`rgba(${ACCENT_RGB},`);
    expect(style.opacity).toBeCloseTo(0.3 + 0.8 * 0.4);
  });

  it("bpmGlowStyle dims when BPM is zero", () => {
    const style = bpmGlowStyle(0, 0.9);
    expect(style.textShadow).toBeUndefined();
    expect(style.opacity).toBe(0.35);
  });
});
