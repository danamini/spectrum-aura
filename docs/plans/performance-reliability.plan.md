# Performance and reliability investigation

Investigated 10 September 2026. Completed changes are included in the v0.4.0 release preparation.
See [controls and balance](controls-and-balance.plan.md) for the final release checks.

## Completed

- Audio capture requests now discard and release streams that arrive after Stop or a newer source request. Stale permission errors do not overwrite the newer result. App and example callers honor the cancellation result. Four regression cases reproduced the old behavior.
- Composer resize now follows renderer pixel-ratio changes. Browser verification changed a 640-pixel-wide target from 1280 pixels at ratio 2 to 544 pixels at ratio 0.85 without a WebGL error.
- Scene cleanup now releases Classic geometry/materials, On-rails Tube geometry/material, Torus clone materials and instance buffers. The regression test inventories resources across all attached views instead of maintaining a list of expected resources.
- Mandala now updates existing line buffers and samples into one reusable vector. The regression test checks changing coordinates, buffer identity and exact equality against Three.js's original spline sampling. Previously each update replaced 12 line buffers and created 160 sample vectors per ribbon.
- Earlier audio graph failure cleanup, FFT reuse, composer pass cleanup and SSAO texture/material cleanup remain in place.

## Follow-up tasks

- [x] SA-PERF-01: Batch opaque Ripple rings into one instanced mesh per column. Browser verification reduced default draw calls from 800 to 20. Per-instance colors hold emissive radiance; transforms and colors match the individual-ring path in regression tests. Transparent rings retain individual meshes and sorting, allocated only when opacity falls below 1. Wireframe, 1/20/50 columns, changed ring counts and rebuilding are covered. No end-to-end FPS claim.
- [ ] SA-REL-07: Resolve pre-existing opaque Ripple depth fighting. Rings use the same radius and can overlap at coincident side surfaces. Both the old and instanced renderers show speckling there; instancing changes which surface wins some depth ties. Browser comparisons: one ring was pixel-identical, thin rings differed by a mean 0.00069 on a 0–255 channel scale, and one default frame differed by 0.817. Transparent comparison differed in only two channels by one level. A visual redesign of overlapping geometry or an explicit depth-order policy needs its own comparison across presets. Do not treat exact reproduction of unstable depth ties as a correctness target.

- [ ] SA-PERF-02: Finish lazy construction of inactive view geometry. Asset-Flow model/sprite requests now start on first activation, removing 12 startup model requests; revisiting reuses the loaded assets. Wikichroma model downloads were already lazy. All view geometry is still built in the constructor. Measure cold production startup and first-switch latency before changing geometry construction. Main and video-loop builds still have large-chunk advisories; splitting Three.js alone does not prove a smaller total download.
- [x] SA-REL-03: CRT/projector, overlay animation and glitch duty timing now use elapsed seconds from the app and video-loop frame loops. Composer.apply keeps a 1/60-second default for existing two-argument callers. Tests cover 30/60/120 Hz, zero delta and long-pause clamping. GlitchPass's own random pattern generation is still library-managed.
- [x] SA-REL-04: Measured FPS now uses the original frame interval; animation retains its 50 ms delta cap. Tests cover ordinary frames, 100 ms stalls, multi-second pauses, zero/negative intervals and non-finite inputs.
- [x] SA-REL-05: The UI-kit owns a single animation-frame chain across successful source changes and cancels it on non-cached page exit. The regression test performs two source selections and checks that only one frame is queued.
- [x] SA-REL-06: LocalVideoSource releases replaced file URLs and clears the current URL on non-cached page exit. Pending playback from older selections cannot reactivate the wrong source; playback errors are displayed. The regression test replaces a file before its play promise resolves and checks URL release, cancellation and idempotent teardown.

## Investigation, 19 November 2026

Baseline first (Chromium, Apple M5 Pro, ambient source, default post-FX): all
16 views held the display rate, `Scene.update` cost 0.04–0.66 ms per frame, and
the `Scene` constructor took 7–14 ms. Frame CPU is not a bottleneck, so lazy
construction of the existing views (SA-PERF-02) would save about 10 ms of
startup and was left alone.

- [x] SA-PERF-03: Asset-Flow loads only the model it displays. Every actor
  shares one model per build, but all twelve GLBs were fetched and parsed.
  Measured on activation: 12 requests / 71.3 MB → 1 request / 11.9 MB (at most
  13.5 MB, the largest file); peak JS heap 203 MB → 97 MB (one run each; the
  model is chosen at random). Templates and actor clones are now disposed on
  rebuild and teardown. A missing file falls through to the next path.
- [x] SA-PERF-04: Removed per-frame allocations in Obsidian (two `Vector3`
  clones per shard), Asset-Flow (`Color` clones per actor and sprite) and the
  fog colour (a CSS colour parse every frame). Not separately measured; these
  views were already under 0.1 ms per update.
- [x] SA-LAT-01: Fast-attack display spectrum behind **Low-latency audio**.
  Figures and method are in
  [rendering-and-latency.md](../rendering-and-latency.md#display-ballistics-low-latency-audio).
  The first hypothesis (a 58 ms half-rise from 0.82 smoothing) was wrong: dB
  scaling compresses a loud step into one frame, so the measured gain is
  0–48 ms depending on level.
- [x] SA-PERF-05: New views (Outrun, Globe, Spectro-Tunnel, Fractal) are built
  on first activation and disposed after 90 s off-screen.
- [ ] SA-PERF-06: Fractal cost is per pixel and has only been measured on an
  M5 Pro (display rate at 1280×720, 64 steps). Measure on integrated graphics
  and at device pixel ratio 2; consider rendering it at reduced resolution.
- [ ] SA-LAT-02: The microphone constraint change (no echo cancellation or
  noise suppression in low-latency mode) is covered by a unit test of the
  request only. Check level and latency with a real microphone.
- [ ] SA-PERF-07: Asset-Flow and Wiki-Chroma keep their loaded models and
  textures after the view is left. Moving them onto the lazy-view lifecycle
  would release them after the idle window.

### Existing-view review

All 16 original views were captured at ambient level and at 3.5× visual
response, and the three weakest fixed: Monolith (instance colours zeroed by
`vertexColors: true` on a geometry with no colour attribute), Sound-Wall
(metalness 1 with no environment map renders black) and Torus (brightness did
not follow the spectrum). Judged from screenshots on the ambient source, not
on recorded music.

- [ ] SA-VIS-01: Wiki-Chroma, Stage Lights and Asset-Flow read as dim and
  small in frame at ambient level; Classic shows mostly peak caps when quiet.
  Review with real music before changing — they may be fine at normal levels.
- [ ] SA-VIS-02: The Torus glass shell (`transmission` material) is created
  hidden and its per-cell clones do not show; decide whether to give the ring
  a visible body or remove the shell.

### Tempo and sync, 19 November 2026

Measured with `sync-benchmark.test.ts` (simulated tracks, known beat times).
Before → after: tempo error 0.15–3.35% → ≤0.05%; beat alignment 0.11–0.43 of a
beat → 0.03–0.08; drops anchored 0/20 → 40/40. The old code fails 22 of the
suite's 23 tests. Nothing here was run on recorded music.

Real-audio check (four tracks played into the app as the microphone, auto-gain
off, against an independent offline reference): tempo within 0.3% on all four
(127.1 vs 127.0, 84.1 vs 83.9, 84.0 vs 83.9, 123.0 vs 123.1). Section starts
and breakdowns found nothing until detection moved to the kick band; after
that, on the track it was mostly fitted to: 5 of 7 section starts, 4 of 4
breakdowns, none spurious. On the other three: section starts 2/6, 0/0, 2/4
and breakdowns 4/4, 0/0, 8/10 against the reference, plus events the
reference does not list (several look like returns after short breaks; not
verified by ear).

- [ ] SA-SYNC-01: Thresholds were fitted on four tracks, one of them heavily.
  Validate by ear and on more material: swing, live drummers, sparse or
  beatless intros, jungle (2 of 6 section starts found), and bass-heavy
  tracks where the kick does not dominate.
- [ ] SA-SYNC-04: The microphone path keeps browser auto-gain on, which
  compresses the level changes detection relies on. The first real-audio run
  (auto-gain on, old thresholds) found no events; the two were not separated.
  Test with auto-gain off in low-latency mode.
- [ ] SA-SYNC-02: Tempos under 80 BPM fold to double by design (72 reads as
  144); decide whether the phrase should then be 32 clock beats.
- [ ] SA-SYNC-03: A drop is anchored one beat after it lands, so
  `phraseJustStarted` does not fire on it and view cycling waits a phrase.
  Consider letting the view cycle react to `phraseChangeDetected`.

## Verification and limits

All 16 registered visuals were exercised using default settings and a seeded 120 BPM ambient source. Browser CPU samples excluded GPU rendering; a separate 640×360 WebGL check submitted frames and called gl.finish, with no WebGL errors across the views. These checks do not establish end-to-end FPS, mobile performance or a percentage speedup.

One long browser profiling request timed out and was discarded. A fresh isolated browser completed shorter profiling batches. Node/jsdom measurements were also completed with canvas and asset loaders stubbed; those measurements are not GPU results.

The scene/composer browser cleanup check returned texture usage from 19 to zero. Microphone/system permission races were tested with controlled promises; no real microphone or screen capture was requested.

Final checks passed: typecheck, lint, 293 tests across 38 suites, app production build, UI-kit production build and video-loop production build. Main and video-loop builds still emit the large-chunk advisory tracked by SA-PERF-02. Browser console contained no warnings or errors after the final checks.

Ripple follow-up: typecheck, lint and 296 tests across 38 suites passed. Compared the baseline and instanced rendering in the same browser with the same audio and camera state; opaque, transparent, wireframe, single-column and 50-column cases reported no WebGL errors. The temporary baseline module was removed after comparison.

Timing/lifecycle follow-up: typecheck, lint and 308 tests across 39 suites passed. An isolated browser confirmed zero Asset-Flow model downloads before activation. Shared sprite images can still be requested by the composer overlay pack; the deferred scene request does not remove assets required by active post-FX.

Browser activation then loaded all 12 Asset-Flow models successfully without console warnings/errors. App, UI-kit and video-loop production builds passed after the timing/lifecycle changes.
