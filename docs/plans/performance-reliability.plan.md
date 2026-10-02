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

## Verification and limits

All 16 registered visuals were exercised using default settings and a seeded 120 BPM ambient source. Browser CPU samples excluded GPU rendering; a separate 640×360 WebGL check submitted frames and called gl.finish, with no WebGL errors across the views. These checks do not establish end-to-end FPS, mobile performance or a percentage speedup.

One long browser profiling request timed out and was discarded. A fresh isolated browser completed shorter profiling batches. Node/jsdom measurements were also completed with canvas and asset loaders stubbed; those measurements are not GPU results.

The scene/composer browser cleanup check returned texture usage from 19 to zero. Microphone/system permission races were tested with controlled promises; no real microphone or screen capture was requested.

Final checks passed: typecheck, lint, 293 tests across 38 suites, app production build, UI-kit production build and video-loop production build. Main and video-loop builds still emit the large-chunk advisory tracked by SA-PERF-02. Browser console contained no warnings or errors after the final checks.

Ripple follow-up: typecheck, lint and 296 tests across 38 suites passed. Compared the baseline and instanced rendering in the same browser with the same audio and camera state; opaque, transparent, wireframe, single-column and 50-column cases reported no WebGL errors. The temporary baseline module was removed after comparison.

Timing/lifecycle follow-up: typecheck, lint and 308 tests across 39 suites passed. An isolated browser confirmed zero Asset-Flow model downloads before activation. Shared sprite images can still be requested by the composer overlay pack; the deferred scene request does not remove assets required by active post-FX.

Browser activation then loaded all 12 Asset-Flow models successfully without console warnings/errors. App, UI-kit and video-loop production builds passed after the timing/lifecycle changes.
