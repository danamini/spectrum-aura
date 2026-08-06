# Retro Systems & the Post-FX Pipeline

How the retro-hardware emulation pass works, and how the user-facing post-FX
pipeline (ordering, locks, panel) is put together. Engine code lives in
`packages/engine/src/{shaders,retro-font,composer,settings}.ts`; the panel UI
in `src/components/analyser/ControlPanel.tsx` and
`control-panel/primitives.tsx`.

## Retro system pass

`RetroSystemShader` re-renders the fully composited frame under a classic
machine's video constraints. It runs near the end of the chain (before ASCII
by default) so every other effect feeds its virtual framebuffer.

| Mode | System       | Native grid | Colour rules                                                        |
| ---- | ------------ | ----------- | ------------------------------------------------------------------- |
| 0    | ZX Spectrum  | 256×192     | 15 colours; 8×8 attribute cells → 1 ink + 1 paper sharing BRIGHT    |
| 1    | Commodore 64 | 160×200¹    | Pepto 16-colour palette; 4×8 cells limited to 4 colours (multicolor)|
| 2    | Game Boy     | 160×144     | 4 DMG greens by luminance                                           |
| 3    | NES          | 256×240     | 12 hues × 4 value tiers + greys (PPU-structure approximation)       |
| 4    | CGA PC       | 320×200     | Palette 1 high intensity: black/cyan/magenta/white                  |
| 5    | Amstrad CPC  | 160×200¹    | 27-colour master palette (3 levels per channel)                     |
| 6    | Amiga 500    | 320×256     | Fixed 32-entry Deluxe-Paint-style palette (OCS "32 from 4096")      |
| 7    | MS-DOS EGA   | 320×200     | Standard EGA 16 (0xAA primaries, brown exception, brights)          |
| 8    | VGA 256      | 320×200     | Default mode-13h structure: 16 greys + 24 hues × 3 sat × 3 value    |
| 9    | Hercules     | 720×348     | 1-bit green phosphor, ordered-dither halftone                       |
| 10   | Apple II     | 280×192     | Black, white + 4 NTSC artifact colours                              |

¹ fat multicolor pixels — authentic for those machines.

Mode indices are positional: `RETRO_SYSTEMS` order in `settings.ts` **is** the
shader's `mode` uniform. Append new systems; never reorder
(`settings.test.ts` pins the head of the list).

### Display modes

- **Hi-res (`pixels`)** — native framebuffer + palette + attribute limits.
- **Text (`text`)** — each character cell renders a glyph from a 10-step
  brightness ramp using the system's font (see below), ink-on-paper per cell.
- **Low-res blocks (`blocks`)** — 2×2 quarter-block mosaic per cell (ZX block
  graphics / PETSCII quarter blocks), still bound by the cell's ink/paper.

### Fonts (`retro-font.ts`)

Three 8×8 font rows packed into one `DataTexture` atlas, each sorted by
lit-pixel count so glyph index doubles as a brightness ramp:

- **ZX Spectrum** — the actual Sinclair ROM charset bitmaps for
  `space . : + = * #` (Amstrad permits redistribution of Spectrum ROM data),
  topped with the 50%/75% dither rasters Spectrum artists used (the ROM has
  no shade characters) and the full-block graphics character.
- **C64 PETSCII** and **IBM CP437** — styled after their ROMs (2px strokes /
  the CGA 8×8); those bitmaps are still under Commodore/IBM copyright, so
  they are recreations, byte-swappable for real dumps if licensing allows.

`retro-font.test.ts` locks the ramp monotonicity and atlas orientation.

### Attribute clash, dithering, gain

The clash decision (`inkChoice` in the shader) compares the **clean** source
pixel against the cell's ink and paper; ordered (Bayer) dither only engages
near the decision boundary, scaled by the user's dither setting. Solid areas
must stay solid — full-field dithering reads as noise, not clash. Near-black
paper snaps to true black (dark scenes are ink-on-black on real hardware).
The composer drives a *gentle* beat gain (±0.12) — larger swings re-flip
quantization thresholds every kick and look like sparkle noise.

## Post-FX pipeline order

`Settings.fxPipelineOrder` holds the user's pass order for every movable pass
(`FX_PIPELINE` in `settings.ts`). The scene render, SSAO, and motion trails
are pinned at the head — they need scene/depth access. The Composer rebuilds
its pass array only when the order string changes, and both the app store and
the Composer canonicalize through `normalizeFxPipelineOrder` (unknown ids
dropped, duplicates removed, missing passes appended in default order) so
stale saves never break the chain.

Order is a creative control: CRT after Retro system draws scanlines over the
emulated screen; Bloom after Pixelate glows per fat pixel. Randomize never
touches the order.

## Randomize locks & statement effects

Each effect row has a pin (`fxLocks`, groups in `FX_RANDOMIZE_GROUPS`); a
pinned group's keys are stripped from the randomize patch. The whole-frame
"statement" effects (kaleidoscope, mirror, pixelate, sobel, glitch, ASCII,
retro — `FX_STATEMENT_FLAGS`) stay mutually exclusive: if a pinned statement
effect is active, randomize suppresses rolling any other statement effect.

## Panel & overlay UX

- Post FX tab: six collapsible `FxSection` groups with active-count and
  pinned-count badges; presets in a Disclosure with palette swatches; the
  flyout is wide with container-query columns.
- Shortcut bar groups (Visuals / Saves / Tools) have clickable titles that
  open the matching settings flyout; the Settings button opens Post FX.
- The bar, BPM HUD, and latency HUD are drag-movable (`useDraggablePanel`):
  positions persist per panel, a sliver always stays on-screen, double-click
  resets. The bar hides entirely while the settings drawer is open, and the
  HUDs read `--bottom-hud-clearance` to sit above the bar when it's visible.
