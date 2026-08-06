import * as THREE from "three";

/** 8×8 bitmap glyph ramps for the retro-system post-FX text mode.
 *
 * Three font families. The ZX Spectrum glyphs are the actual Sinclair ROM
 * charset bitmaps (0x3D00 character set — Amstrad has granted blanket
 * permission for redistribution of Spectrum ROM data), topped with the
 * checker/row dither patterns Spectrum artists used for mid-tones. C64
 * PETSCII (chunky 2px strokes, 8-point asterisk) and IBM CP437 (the CGA/DOS
 * 8×8) are styled after their ROMs. Every family ends in shade/block
 * characters, which is how real text-mode art reached high brightness.
 *
 * Each glyph is 8 bytes, top row first, bit 7 = leftmost pixel. The builder
 * sorts every family by lit-pixel count so the shader can treat glyph index
 * as a monotonic brightness ramp.
 */

export const RETRO_FONT_GLYPHS_PER_FONT = 10;
export const RETRO_FONT_COUNT = 3;

type GlyphRows = readonly [number, number, number, number, number, number, number, number];

const CHECKER: GlyphRows = [0xaa, 0x55, 0xaa, 0x55, 0xaa, 0x55, 0xaa, 0x55];
const DARK_SHADE: GlyphRows = [0xdd, 0x77, 0xdd, 0x77, 0xdd, 0x77, 0xdd, 0x77];
const FULL_BLOCK: GlyphRows = [0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff];

/** ZX Spectrum: exact Sinclair ROM charset bitmaps (blank top row, single
 * pixel strokes), plus the 50%/75% dither rasters Spectrum artists used —
 * the ROM itself has no shade characters, only the 2×2 block graphics. */
const ZX_ROW_DITHER_75: GlyphRows = [0xff, 0xaa, 0xff, 0x55, 0xff, 0xaa, 0xff, 0x55];
const ZX_GLYPHS: GlyphRows[] = [
  [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00], // space
  [0x00, 0x00, 0x00, 0x00, 0x00, 0x18, 0x18, 0x00], // .
  [0x00, 0x00, 0x00, 0x10, 0x00, 0x00, 0x10, 0x00], // :
  [0x00, 0x00, 0x08, 0x08, 0x3e, 0x08, 0x08, 0x00], // +
  [0x00, 0x00, 0x00, 0x3e, 0x00, 0x3e, 0x00, 0x00], // =
  [0x00, 0x00, 0x14, 0x08, 0x3e, 0x08, 0x14, 0x00], // *
  [0x00, 0x24, 0x7e, 0x24, 0x24, 0x7e, 0x24, 0x00], // #
  CHECKER,
  ZX_ROW_DITHER_75,
  FULL_BLOCK,
];

/** C64 PETSCII style: double-pixel strokes, the classic 8-point asterisk. */
const C64_GLYPHS: GlyphRows[] = [
  [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00], // space
  [0x00, 0x00, 0x00, 0x00, 0x00, 0x18, 0x18, 0x00], // .
  [0x00, 0x18, 0x18, 0x00, 0x00, 0x18, 0x18, 0x00], // :
  [0x00, 0x18, 0x18, 0x7e, 0x7e, 0x18, 0x18, 0x00], // +
  [0x00, 0x00, 0x7e, 0x7e, 0x00, 0x7e, 0x7e, 0x00], // =
  [0x00, 0x66, 0x3c, 0xff, 0x3c, 0x66, 0x00, 0x00], // * (8-point)
  [0x66, 0xff, 0x66, 0x66, 0x66, 0xff, 0x66, 0x00], // #
  CHECKER,
  DARK_SHADE,
  FULL_BLOCK,
];

/** IBM CP437 style: the CGA/EGA 8×8 with medium strokes and true shade chars. */
const CP437_GLYPHS: GlyphRows[] = [
  [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00], // space
  [0x00, 0x00, 0x00, 0x00, 0x00, 0x18, 0x18, 0x00], // .
  [0x00, 0x18, 0x18, 0x00, 0x00, 0x18, 0x18, 0x00], // :
  [0x00, 0x18, 0x18, 0x7e, 0x18, 0x18, 0x00, 0x00], // +
  [0x00, 0x00, 0x7e, 0x00, 0x7e, 0x00, 0x00, 0x00], // =
  [0x00, 0x24, 0x18, 0x7e, 0x18, 0x24, 0x00, 0x00], // *
  [0x24, 0x24, 0x7e, 0x24, 0x7e, 0x24, 0x24, 0x00], // #
  CHECKER,
  DARK_SHADE,
  FULL_BLOCK,
];

function popCount(glyph: GlyphRows) {
  let bits = 0;
  for (const row of glyph) {
    for (let b = 0; b < 8; b += 1) bits += (row >> b) & 1;
  }
  return bits;
}

function sortByDensity(glyphs: GlyphRows[]) {
  return [...glyphs].sort((a, b) => popCount(a) - popCount(b));
}

/** Font row order matches the shader's fontRow(): 0 = ZX, 1 = C64, 2 = CP437. */
export const RETRO_FONTS: readonly GlyphRows[][] = [
  sortByDensity(ZX_GLYPHS),
  sortByDensity(C64_GLYPHS),
  sortByDensity(CP437_GLYPHS),
];

export const RETRO_FONT_ATLAS_WIDTH = RETRO_FONT_GLYPHS_PER_FONT * 8;
export const RETRO_FONT_ATLAS_HEIGHT = RETRO_FONT_COUNT * 8;

/** Packs the glyph ramps into a single-channel atlas. Texture space puts
 * v=0 at the bottom (DataTexture flipY is false), so glyph rows are written
 * bottom-up; the shader indexes rows top-first and flips the same way. */
export function buildRetroFontAtlasData(): Uint8Array {
  const data = new Uint8Array(RETRO_FONT_ATLAS_WIDTH * RETRO_FONT_ATLAS_HEIGHT);
  RETRO_FONTS.forEach((glyphs, fontIndex) => {
    glyphs.forEach((glyph, glyphIndex) => {
      glyph.forEach((row, rowFromTop) => {
        const y = fontIndex * 8 + (7 - rowFromTop);
        for (let x = 0; x < 8; x += 1) {
          const on = (row >> (7 - x)) & 1;
          data[y * RETRO_FONT_ATLAS_WIDTH + glyphIndex * 8 + x] = on ? 255 : 0;
        }
      });
    });
  });
  return data;
}

export function buildRetroFontTexture(): THREE.DataTexture {
  const texture = new THREE.DataTexture(
    buildRetroFontAtlasData(),
    RETRO_FONT_ATLAS_WIDTH,
    RETRO_FONT_ATLAS_HEIGHT,
    THREE.RedFormat,
    THREE.UnsignedByteType,
  );
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
