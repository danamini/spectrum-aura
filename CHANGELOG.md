# Changelog

All notable changes to Spectrum Aura are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
While the project is pre-1.0, the public surface (shortcuts, settings keys, saved
presets) may change between minor versions.

## [Unreleased]

_Nothing yet._

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

[Unreleased]: https://github.com/danamini/spectrum-aura/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/danamini/spectrum-aura/releases/tag/v0.0.1
