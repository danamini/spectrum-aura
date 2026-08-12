# Changelog

All notable changes to Spectrum Aura are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
While the project is pre-1.0, the public surface (shortcuts, settings keys, saved
presets) may change between minor versions.

## [Unreleased]

### Added

- **Retro system post-FX pass**: emulates eleven classic machines — ZX
  Spectrum (256×192 with genuine per-cell attribute clash and the real
  Sinclair ROM font), Commodore 64 (multicolor cells, Pepto palette,
  PETSCII-style font), Game Boy, NES, CGA, Amstrad CPC, Amiga 500 (32-colour
  DPaint-style palette), MS-DOS EGA, VGA 256, Hercules (1-bit green-phosphor
  dither), and Apple II. Three display modes per system (hi-res pixels /
  system-font text / low-res quarter-block graphics), optional letterboxed
  hardware borders, boundary-only ordered dithering, and a gentle beat-driven
  gain. New presets: **Spectrum Clash** and **PETSCII Terminal** (also added
  to the video-loop example's rotation), plus ZX Spectrum / C64 / Game Boy /
  NES / CGA scene palettes.
- **Reorderable post-FX pipeline**: a "Pipeline order" editor lists every
  movable pass with up/down controls; the engine Composer rebuilds its chain
  live. Scene render, SSAO, and motion trails stay pinned first; orders are
  canonicalized so stale saves can never break the chain.
- **Randomize pins**: every effect row has a pin that excludes its whole
  settings group from Randomize; pinned whole-frame "statement" effects also
  suppress rolling a second statement effect on top. Section headers show
  active and pinned counts.
- **Movable overlay panels**: the shortcut bar, BPM grid, and latency HUD are
  drag-movable with persisted positions and double-click reset.
- Direct panel access: shortcut-bar group titles open their matching settings
  slide-out (Saves, Audio, controls drawer); the Settings button opens the
  Post FX panel.
- **Ambient mode (no music)**: a synthetic, musically-structured signal —
  beat grid, backbeats, hats, 32-beat sections with builds and breakdowns,
  shaped spectrum — drives all visuals with no audio source, so the app works
  as a standalone background. Selectable from the audio-source dialog,
  persisted across sessions, and real audio always takes priority. The
  SongClock locks to the synthetic tempo, so phrase-based view cycling works
  exactly as with real music.
- **Richer save slots**: each save now captures a canvas thumbnail at save
  time plus a derived summary line (view, palette, standout FX) shown in the
  Saves list; existing saves without images keep working.
- **Standalone panel pop-outs**: Post FX, Scene, Saves, and Audio open
  directly from the shortcut bar as edge-docked pop-outs without the full
  controls drawer (a new Scene button joins the Tools cluster); the drawer
  now focuses on view picking and per-view settings. View cycle, "Randomize
  FX on view switch", and Dynamic Mode moved into the Scene panel's new
  Motion & Auto-Pilot section.
- **Live FPS chip** in the Tools cluster — a 500ms render-health beacon
  (green/amber/red) that opens Stats for nerds on click.
- **Audio source indicator**: the bar's Audio Source button shows what feeds
  the visuals (mic / system / ambient / off) with a matching icon and live
  glow.
- Escape closes panels progressively: pop-out or flyout first, then the
  controls drawer.

### Changed

- Post FX tab redesigned into six collapsible themed sections with live
  active-effect badges; presets moved into a disclosure with palette-swatch
  chips; the settings flyout is wider with container-query column layouts.
- Shortcut bar rebuilt as grouped card clusters (Visuals / Saves / Tools)
  with two-line kbd+icon buttons; it hides while the settings drawer is open
  and publishes its height so corner HUDs never overlap it.
- Audio-source dialog leads with "Share system audio — Best results"
  (entire-screen + system-audio guidance), can now be dismissed without
  choosing a source, and the capture request steers Chromium's picker toward
  whole-screen system audio with processing (echo cancellation, noise
  suppression, auto gain) disabled for a clean analysis signal. Start screen
  renamed to Spectrum Aura.

### Fixed

- Wikimedia Commons overlay textures were starved out of the rotation
  whenever the local-pack bias didn't happen to include their family; opted-in
  Commons entries now bypass the bias filter.
- ZX Spectrum text-mode glyphs corrected to the exact Sinclair ROM charset
  bitmaps; attribute-clash rendering keeps solid areas solid (dither only at
  decision boundaries) instead of dissolving into full-field checkerboard.
- The BPM HUD no longer shows the camera-drag grab cursor it couldn't honour
  (and is now actually draggable).
- Effect pins now hold through every look-changing flow — presets, loading
  saves (incl. Play Saves rotation), and view cycling could previously
  overwrite a pinned effect; only Randomize respected the pin. The pin list
  itself is session state that saves never overwrite.
- The Latency HUD renders without a live capture again: it measures the
  synthetic-signal path in ambient mode and explains itself when no signal
  exists (it previously stayed invisible).
- Wikimedia Commons topics renamed to what they actually search for
  (Patterns / Diagrams / Botanical) so they no longer read as duplicates of
  the local-pack bias buttons.

## [0.3.0] - 2026-07-17

### Added

- **Wiki-Chroma visual**: animated skeletal glTF actors (soldier / robot / fox
  packs, multi-selectable) running in formation across three motion modes
  (orbit / cogs / runner), with animation loops phase-locked to the SongClock
  beat grid (1, 2, or 4 beats per loop) plus cog-ring, runner-rail, and
  spark-cloud motifs. Actor models are fetched from their upstream sources on
  first activation of the view — never at app startup — with a bundled local
  fallback for the Fox and capsule stand-ins while models load.
- **Public-domain text source**: the demo-scene text overlay now defaults to a
  bundled, fully offline library of attributed public-domain snippets
  (author, work, year, rights, credit line); the BOFH API source remains
  selectable. Attribution for the current snippet appears in Stats for nerds.
- **Asset overlay pack, families, and bias**: the Retro asset overlay now
  draws from a larger local SVG pack described by a manifest with per-entry
  family and attribution metadata, and picks distinct families per trio. A new
  bias control (mixed / technical / organic / chaotic) steers the picker, and
  each visual applies its own default bias on view switch (an explicitly
  chosen bias in the same change is preserved).
- **Optional Wikimedia Commons overlays**: opt-in, topic-based Commons imagery
  (abstract / technical / organic) mixed into the asset overlay pool, with
  per-image credit lines surfaced in Stats for nerds. Loads are gated behind
  the toggle, back off on failure, and tolerate partially failed searches.
- Stats for nerds: new Overlay FX, Text Overlay, and Wiki-Chroma sections with
  live family/attribution readouts.
- The render loop now survives a per-frame exception (logs and skips the
  frame) instead of freezing the visualizer.
- The shortcuts restore pill dims when the pointer leaves the window.

## [0.2.0] - 2026-07-03

### Added

- **Stage Lights visual**: a row of overhead sweeping spotlight beams,
  color/tuning-aligned to LOW/MID/HIGH by position along the rig. Fixture
  count is configurable to 3, 5, or 7 via a continuous band-position blend
  rather than a fixed per-index lookup, so extra fixtures land *between*
  bands instead of just repeating one. Beats trigger a brief brighten/tighten
  and, on strong bass hits, a momentary fan-out. An optional laser-fan
  accent (`stagelightsLasers`) adds a fixed fan of thin, bright, upward beams
  from a downstage projector.
- **Demo-scene text overlay** (`textOverlayEnabled`, Post FX tab):
  moving/bouncing/scrolling/stacking/orbiting phrases layered on top of the
  active visual. Phrases come from bofh.bombeck.io in small batches
  (`engine/text-sources/`) and work fully offline via an embedded fallback
  phrase list.
- Dynamic Mode now drifts Stage Lights' orbit speed and beam sweep speed, so
  the camera moves noticeably more while Dynamic Mode is on for this view.

## [0.1.0] - 2026-07-02

Large UI/UX, sync, and rendering overhaul. Pre-1.0 policy note: some default
key bindings changed (arrows are now the primary prev/next binding; the old
letters still work).

### Added

- **Dynamic Mode** (`evolveEnabled` / `evolveAmount`): a curated 1-3 impactful
  settings per view slowly drift over musical phrases (wall-clock fallback when
  unsynced), as a bounded offset around your own values.
- **Saves tab** in the settings panel: every saved look listed with focus badge
  and inline load/overwrite/delete, sharing one cursor with the shortcut bar.
- **BPM lock indicator**: a ring that visibly searches while the detector
  converges and settles into a beat-synced pulse once locked.
- **Arrow-key shortcuts**: `←`/`→` prev/next visual, `⇧←`/`⇧→` (or `[`/`]`)
  prev/next save. Letter aliases (`B`/`V`) kept.
- **Phone-first layout**: full-width settings sheet, bottom tab bar with touch
  targets, full-screen flyout, scroll affordances, safe-area padding.
- **Glitch intensity** (`glitchIntensity`): duty-cycle control for the Glitch
  pass, which previously was only ever full-on.
- **Automatic post-FX quality tiers**: sustained low FPS gracefully sheds the
  priciest passes first (SSAO/DoF, then more), with hysteresis; recovers
  stepwise. Manual Performance Mode still forces the full cut.
- **Realistic-music BPM regression suite** (`bpm-detector.realistic.test.ts`):
  five jittered kick/snare/hat scenarios must lock within 8 s and hold.

### Changed

- **Unified amplitude curve** (`engine/loudness.ts`): all 14 views route their
  primary amplitude response through one shared gamma curve, so the same
  slider value feels comparable everywhere.
- **BPM detection reworked for real music**: subdivision/octave interval
  folding, autocorrelation every pass + cross-estimator agreement bonus,
  cluster-weighted confidence, a stability-based lock path, mid-range 2x/0.5x
  octave-lock correction, silence-proportional confidence decay with an
  adaptive threshold, and BPM-adaptive beat refractory.
- **View cycling** biases toward a different energy tier than the current view
  and always presents the destination in 3D.
- **Post-FX reactivity**: bloom breathes with bass; chroma shimmers on high
  transients; asset-overlay switch timing centralized into named constants.
- **Bespoke control skin**: sliders and switches restyled to the app's emerald
  identity; retro/novelty FX grouped under a collapsed disclosure.
- **Stale tap-locks re-acquire**: a manual tap tempo unconfirmed for 6 s
  releases back to auto detection with a "Re-syncing…" flash.
- Render-loop hygiene: pooled per-frame `AudioBands`/`bandsForScene` objects,
  composer-reset tracking without per-frame string allocation.

### Fixed

- **Loading a save can no longer switch Performance Mode on** — 18 of the 19
  bundled default saves carried `performance: true`, silently bypassing all
  post-FX and persisting it. Saves now never touch it, the bundled saves are
  clean, and the Post FX tab shows a warning banner with an inline "Turn off"
  when Performance Mode is bypassing the pipeline.
- **BPM lock on real audio**: the confidence silence-decay used a fixed
  absolute threshold miscalibrated for real capture levels, preventing locking
  entirely on quiet-but-present music.
- All 16 sprite/overlay SVGs lacked width/height attributes, failing WebGL
  texture upload (asset-flow sprites and composer overlays were silently
  broken).
- SMAA antialiasing stayed permanently off after one quality-tier downgrade.
- Auto view-cycle appeared to only show 2D views once stale per-view 2D flags
  accumulated in localStorage.
- Tempo HUD no longer changes size as sync state changes; settings sheet has a
  proper screen-reader description.
- Asset-flow uses one shared model per build (random each build) instead of a
  pile of unrelated models.
- Dev-server hot updates that reach the settings store force a clean reload
  instead of silently splitting panel and render-loop state.

## [0.0.1] - 2026-06-26

First tagged release. Browser-only, real-time audio visualiser built on React 19,
Three.js, and Vite — no backend, no upload flow.

### Added

- **Visual engines (14):** Combo, Classic, Ripple, Cyberpunk Data-Stream, Ethereal
  Nebula, Brutalist Monolith, Symmetric Mandala, Audio-Reactive Terrain, Obsidian
  Shard, Hyper-Torus Accelerator, Brutalist Sound-Wall, Floating Geometry Nebula,
  On-rails Tube, and Asset-Flow.
- **Musical sync (`SongClock`):** authoritative 4/4 bar grid (4 beats per bar, 16
  beats per phrase) with continuous beat index and injected beat phase for visuals.
- **Manual tap sync:** `T` beat tap (learns tempo and locks the grid), `⇧T`
  downbeat tap (resets the phrase to beat 1/16). Misaligned audio never skips beats
  after a manual lock; aligned audio can nudge phase and release back to auto.
- **Tempo detection:** experimental BPM estimation with confidence/locked state and
  4-bar phrase-change realignment on strong onsets.
- **BPM & bar grid HUD** (`M`) and **latency HUD** (`L`) overlays, plus a
  "stats for nerds" panel (`N`).
- **Phrase-aware view cycling** (`C`): switches views on 4-bar phrase boundaries.
- **Audio input:** microphone or shared tab/system audio capture.
- **Post-FX pipeline:** bloom, chroma, grain, vignette, DOF, glitch, god rays,
  lens flare, colour grading, kaleidoscope, mirror, plus retro CRT and projector-film
  passes, with a master bypass toggle.
- **Presets & saves:** built-in presets, a growing local save list, save/load/step/
  random/delete from both the shortcut rail and settings panel, and Play Saves
  auto-rotation (`A`).
- **WebXR (alpha):** Meta Quest support path; desktop remains the primary experience.
- **Keyboard-first controls** with a bottom shortcut rail and in-app tooltips.
- **Documentation** for the audio pipeline, SongClock math, rendering/latency, plus
  `AGENTS.md` guidance for coding agents.

### Project setup

- GitHub Pages deployment workflow.
- Modular architecture: `Analyser.tsx` orchestrator with `hooks/`, `control-panel/`,
  and `overlays/` modules; shared `theme.ts` tokens and `TempoReadout`.
- `npm run check` runs typecheck + lint + tests; strict TypeScript
  (`noUnusedLocals` / `noUnusedParameters`) enabled.

[Unreleased]: https://github.com/danamini/spectrum-aura/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/danamini/spectrum-aura/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/danamini/spectrum-aura/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/danamini/spectrum-aura/compare/v0.0.1...v0.1.0
[0.0.1]: https://github.com/danamini/spectrum-aura/releases/tag/v0.0.1
