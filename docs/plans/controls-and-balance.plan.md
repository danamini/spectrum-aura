# Controls and automatic balance completion plan

Release target: v0.4.0, 2 October 2026.

## Completed scope

- [x] Expose Response outside Settings, with neutral reset and Calm/Punchy labels.
- [x] Add minus/plus shortcuts and keep hints, limits and focus exclusions tested.
- [x] Add automatic brightness/activity feedback, on by default, preserving opt-out.
- [x] Keep beat detection and SongClock input unchanged; bound temporary correction.
- [x] Explain Auto balance with a stable hover/focus tooltip and live correction.
- [x] Fix flashing tooltips by keeping toolbar component identities stable.
- [x] Disable duplicate saves and invalid deletes; share saved-look state across controls.
- [x] Make FPS a readout and clarify button labels/active and unavailable states.
- [x] Give Stats persisted drag/resize geometry, viewport clamping and scrolling.
- [x] Smooth graph samples lightly and adapt ranges so small changes stay visible.
- [x] Match Stats, toolbar and mini-panel glass fills.
- [x] Move BPM into its mini panel, keep Experimental and align with Latency.
- [x] Fill Latency with existing signal, FFT and audio-read measurements.
- [x] Run locally and open an external browser; clarify capture denial/cancellation.
- [x] Update README, technical docs, changelog and regression tests.

## Verification

Before the default-on change, 345 tests passed with type checking and lint.
Browser checks confirmed Response keyboard adjustment, neutral reset, stable
Auto balance sampling and matching Stats/Response blur. Prior checks covered
saved-state controls, graph ranges, persistent Stats layout and mini-panel sizing.

Release checks passed: typecheck, lint, 346 tests across 44 suites, app production
build, UI-kit build and video-loop build. The app and video-loop retain the
large-chunk advisory tracked by SA-PERF-02.

Publication uses the v0.4.0 tag and the repository Release and Pages workflows.
See the [release](https://github.com/danamini/spectrum-aura/releases/tag/v0.4.0)
and [workflow runs](https://github.com/danamini/spectrum-aura/actions) for publication status.

## Limits and retained follow-ups

Auto balance is bounded and pauses in Performance Mode/VR or when sampling is
costly. Capture requires the user's browser and macOS permission; no permission
bypass is implemented. Real microphone/screen capture was not part of automated
verification.

The existing [performance and reliability plan](performance-reliability.plan.md)
retains SA-REL-07 for overlapping Ripple depth ties and SA-PERF-02 for lazy view
geometry construction and measured startup cost. Neither is claimed complete.
