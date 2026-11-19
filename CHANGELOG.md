# Changelog

All notable changes to Spectrum Aura are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
While the project is pre-1.0, the public surface (shortcuts, settings keys, saved
presets) may change between minor versions.

## [Unreleased]

_Nothing yet._

## [0.5.0] - 2026-11-19

### Added

- MIDI input and mapping: learn pads, knobs and sliders per device and
  channel, combine several controllers, monitor incoming values, and save
  mappings separately from visual looks. Settings → MIDI, plus a **Use MIDI
  controller** option on the input source prompt. See [docs/midi.md](docs/midi.md).
- External MIDI sync: follow tempo, start/stop, continue and song position
  from one selected MIDI port (Ableton Live, drum machines).
- Subtle "Open source on GitHub" link on the input source prompt.
- Text overlay: five per-character styles — **Wave** (each letter is a band
  of an equaliser), **Typewriter** (typed in time with the tempo),
  **Assemble** (letters fly together and breathe on the beat), **Ring** (the
  phrase on a turning cylinder) and **Rain** (the phrase's letters falling in
  streams).
- Text overlay sources: **Your text** (type your own lines), **Live readout**
  (tempo and band levels as they are measured), **Scrollers** (bundled
  demo-scene one-liners), **Poetry** (PoetryDB) and **Wikipedia** (random
  article titles), alongside the renamed **Literature** and **IT excuses**.
  Each source now carries a one-line description and says whether it needs
  the network.
- Five new visuals, taking the total to 21:
  - **Black Hole** — light is bent around the hole per pixel, so the far side
    of the accretion disk arches over and under the shadow and the stars smear
    around it. The disk is a live spectrogram: bass at the hot inner edge,
    treble at the rim, each slice spiralling round as it ages.
  - **Outrun** — synthwave drive: a tempo-locked neon grid, wireframe mountains
    built from spectrum history, striped sun and starfield.
  - **Globe** — a vector Earth whose countries bounce: each rides its own
    slice of the spectrum on a spring, lifting off the surface and settling
    back, and the whole map jumps on the beat. A **Country map** toggle turns
    the outline download off.
  - **Spectro-Tunnel** — the demoscene tunnel with a live spectrogram for
    walls, so a fill is visible travelling down the tube.
  - **Fractal** — a raymarched Mandelbulb whose shape bends with the bass,
    with a **Detail** setting for the per-pixel march budget.

### Changed

- **Low-latency audio** now changes what you see, not only the audio
  context's latency hint. Visuals follow a fast-attack copy of the spectrum
  that rises on the frame a sound arrives and releases at the Smoothing
  slider's rate; beat and tempo detection keep their existing source. The
  toggle also applies live instead of at the next capture start, and in this
  mode the microphone is requested without echo cancellation or noise
  suppression. See [docs/rendering-and-latency.md](docs/rendering-and-latency.md).
- Asset-Flow fetches only the model it displays instead of all twelve
  (12 requests / 71 MB down to 1 request / at most 13.5 MB).
- **Tempo and beat sync** reworked. Measured on simulated tracks with known
  beats (`sync-benchmark.test.ts`): tempo error 0.15–3.35% → under 0.05%;
  beat alignment 0.11–0.43 of a beat (no better than chance) → 0.03–0.08;
  drops that put bar 1 on the drop 0 of 20 → 40 of 40.
  - Tempo comes from the periodicity of the onset envelope, so a
    kick-on-1-and-3 groove no longer reads as a nearby wrong tempo.
  - In auto mode the beat grid locks onto the beats you hear and holds its
    tempo through breakdowns.
  - A drop is detected one beat after it lands and becomes bar 1, beat 1.
    Previously it was noticed a bar late and the phrase anchored there.
  - Section starts and breakdowns are judged on a new kick band
    (30–180 Hz) with decibel-aware thresholds, calibrated on recorded tracks.
    The wide "bass" band (0–1.9 kHz) barely moves when a kick drops out under
    vocals or synths, so on real music the first version found nothing.
  - A slightly wrong tempo lock (within 8 BPM) now corrects itself instead of
    holding for the whole track.
- **Dynamic mode** now follows the music's structure instead of drifting on a
  fixed timer. It detects drops, breakdowns and section changes and answers
  each with a new camera shot (orbit speed and direction, drift, beat kick), a
  post-FX hit on drops (radial blur, chroma, a brief glitch), an immediate
  shift in the view's drifting settings, and exposure/saturation and view size
  that follow the track's energy. At amount 0.5 and above the palette steps on
  each change. Camera moves now apply in every view.
- Monolith no longer washes out to a flat colour. Its per-column colours were
  being multiplied by zero (the material asked for vertex colours the box
  geometry does not have), leaving only an even glow that bloom smeared across
  the screen. Columns are now coloured individually, with lit caps and edges
  that brighten with height.
- Sound-Wall pillars are shaded: the mirror-metal material had no environment
  to reflect and rendered black. They are now brushed steel with the same
  cap-and-edge glow.
- Terrain is rebuilt as a lit landscape: a clean quad grid instead of
  triangle wireframe, log-spaced frequency across the width, glowing ridges,
  a beat band that rolls across it, and a shaded solid mode when Wireframe is
  off. It now scrolls at a fixed rate that follows the tempo; before, the
  scroll speed doubled on a 120 Hz display.
- Torus particles brighten with their own frequency band, so the ring lights
  up where the spectrum is.
- New visuals are built on first use and released after 90 seconds
  off-screen, so they cost no memory or startup time until shown.
- The live site now serves from <https://spectrumaura.org/>; the old
  GitHub Pages URL redirects there.

## [0.4.0] - 2026-10-02

### Added

- Toolbar Response slider with Calm/Punchy labels, minus/plus shortcuts and
  neutral reset. Visual gain leaves beat detection and audio volume unchanged.
- Auto balance, enabled by default, gradually corrects sustained brightness
  problems and low activity. Hover or focus its button for behavior and live
  correction details. Explicit opt-outs persist; Performance Mode and VR pause
  balancing, and expensive sampling backs off or stops.

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
  (green/amber/red). This is a readout; the Stats button opens the panel.
- **Audio source indicator**: the bar's Audio Source button shows what feeds
  the visuals (mic / system / ambient / off) with a matching icon and live
  glow.
- Escape closes panels progressively: pop-out or flyout first, then the
  controls drawer.
- **2D drawing pack switch** on the Asset overlay: the bundled drawn assets
  (grids, circuit, halftone…) can sit out of the rotation — independent of
  the bias and Commons controls — leaving subtle generated line-art (and any
  Commons imagery) when the bold 2D art would overwhelm a scene. Randomize
  preserves the choice.

### Changed

- Toolbar action states follow the displayed saved look. Duplicate saves disable,
  Delete requires a matching save, and Play Saves requires at least two saves.
- Stats supports persistent position/size, viewport clamping, scrolling,
  full-page mode and keyboard resizing. Graphs use light smoothing and adaptive
  ranges. Stats, button groups and mini panels share a translucent blur fill.
- BPM and its experimental label share one mini panel aligned with Latency.
  Latency also shows signal timing, FFT window and audio-read CPU cost.

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

- Live FPS and balance updates no longer remount toolbar buttons or flash away
  their tooltips. Slider and resize interactions no longer trigger visual cycling
  or camera dragging.
- Stale audio capture requests release late streams without overriding a newer
  source or Stop action. Permission errors explain external-browser capture.
- Resource cleanup for audio, scene geometry/materials and composer passes;
  composer targets resize when renderer pixel ratio changes.
- Mandala reuses line buffers; opaque Ripple rings use instanced meshes.
  Asset-Flow model loading starts on first activation.
- Composer effect timing follows elapsed time, FPS uses uncapped frame intervals,
  and examples clean up animation chains and replaced local-video URLs.

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
  rather than a fixed per-index lookup, so extra fixtures land _between_
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

[Unreleased]: https://github.com/danamini/spectrum-aura/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/danamini/spectrum-aura/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/danamini/spectrum-aura/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/danamini/spectrum-aura/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/danamini/spectrum-aura/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/danamini/spectrum-aura/compare/v0.0.1...v0.1.0
[0.0.1]: https://github.com/danamini/spectrum-aura/releases/tag/v0.0.1
