import { describe, expect, it } from "vitest";

import {
  RETRO_FONTS,
  RETRO_FONT_ATLAS_HEIGHT,
  RETRO_FONT_ATLAS_WIDTH,
  RETRO_FONT_COUNT,
  RETRO_FONT_GLYPHS_PER_FONT,
  buildRetroFontAtlasData,
} from "../retro-font";

function popCount(glyph: readonly number[]) {
  let bits = 0;
  for (const row of glyph) {
    for (let b = 0; b < 8; b += 1) bits += (row >> b) & 1;
  }
  return bits;
}

describe("retro font atlas", () => {
  it("packs every font as a monotonic brightness ramp", () => {
    expect(RETRO_FONTS).toHaveLength(RETRO_FONT_COUNT);
    for (const glyphs of RETRO_FONTS) {
      expect(glyphs).toHaveLength(RETRO_FONT_GLYPHS_PER_FONT);
      // The shader maps cell luminance straight to glyph index, so density
      // must never decrease along the ramp.
      for (let i = 1; i < glyphs.length; i += 1) {
        expect(popCount(glyphs[i]!)).toBeGreaterThanOrEqual(popCount(glyphs[i - 1]!));
      }
      // Ramp endpoints: level 0 is blank, top level is the full block.
      expect(popCount(glyphs[0]!)).toBe(0);
      expect(popCount(glyphs[glyphs.length - 1]!)).toBe(64);
    }
  });

  it("writes glyph pixels into the atlas bottom-up (flipY off)", () => {
    const data = buildRetroFontAtlasData();
    expect(data).toHaveLength(RETRO_FONT_ATLAS_WIDTH * RETRO_FONT_ATLAS_HEIGHT);

    // Glyph 0 of every font is blank; the last glyph is a solid block.
    for (let font = 0; font < RETRO_FONT_COUNT; font += 1) {
      for (let y = font * 8; y < font * 8 + 8; y += 1) {
        for (let x = 0; x < 8; x += 1) {
          expect(data[y * RETRO_FONT_ATLAS_WIDTH + x]).toBe(0);
        }
        const lastGlyphX = (RETRO_FONT_GLYPHS_PER_FONT - 1) * 8;
        for (let x = lastGlyphX; x < lastGlyphX + 8; x += 1) {
          expect(data[y * RETRO_FONT_ATLAS_WIDTH + x]).toBe(255);
        }
      }
    }

    // Row order: a glyph byte written for top row r must land at texture
    // row (7 - r). The '.' style glyphs light pixels near the glyph bottom,
    // which is the LOW texture y range for that font row.
    const zx = RETRO_FONTS[0]!;
    const dotIndex = zx.findIndex((g) => popCount(g) > 0);
    const glyph = zx[dotIndex]!;
    glyph.forEach((row, rowFromTop) => {
      const y = 7 - rowFromTop;
      for (let x = 0; x < 8; x += 1) {
        const expected = (row >> (7 - x)) & 1 ? 255 : 0;
        expect(data[y * RETRO_FONT_ATLAS_WIDTH + dotIndex * 8 + x]).toBe(expected);
      }
    });
  });
});
