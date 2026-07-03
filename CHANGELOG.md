# Changelog

All notable changes to Spectrum Aura are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
While the project is pre-1.0, the public surface (shortcuts, settings keys, saved
presets) may change between minor versions.

## [Unreleased]

_Nothing yet._

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

[Unreleased]: https://github.com/danamini/spectrum-aura/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/danamini/spectrum-aura/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/danamini/spectrum-aura/compare/v0.0.1...v0.1.0
[0.0.1]: https://github.com/danamini/spectrum-aura/releases/tag/v0.0.1
