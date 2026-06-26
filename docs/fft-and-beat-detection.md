# FFT and Beat Detection — Overview

> **Detailed references:** [audio-analysis-pipeline.md](./audio-analysis-pipeline.md) · [song-clock-and-sync.md](./song-clock-and-sync.md) · [rendering-and-latency.md](./rendering-and-latency.md)

Spectrum Aura converts live PCM into visual motion through a layered pipeline. This page is a short map; the linked docs contain equations, constants, and file references.

## Pipeline

```
Capture → AnalyserNode (FFT) → bands (bass/mid/high/centroid)
              ↓
        BeatMatcher → onset `beat` (accents only)
              ↓
        BPMDetector → BPM estimate + confidence + detector phase
              ↓
        SongClock → authoritative bar grid + beatPhase for visuals
              ↓
        scene.ts / composer / HUD / view cycle
```

## FFT (summary)

Web Audio returns byte magnitudes per bin. Window duration:

\[
T\_{\text{window}} = N / f_s
\]

Bands are proportional bin slices (bass 0–8%, mid to 35%, high remainder). See [audio-analysis-pipeline.md §2](./audio-analysis-pipeline.md#2-band-aggregation).

## Beat detection (two layers)

| Layer  | Module        | Role                                                   |
| ------ | ------------- | ------------------------------------------------------ |
| Onsets | `BeatMatcher` | Transient spikes; camera kick, signal-change timing    |
| Tempo  | `BPMDetector` | Median peak intervals + autocorrelation tempogram      |
| Grid   | `SongClock`   | **Owns** bar/beat position; manual taps override audio |

**Important:** After manual tap sync (`T`), the bar grid follows `SongClock` only — not raw `bands.beat`.

## Visual beat phase

**Legacy (removed):** wall-clock \(\phi = (t \cdot \text{BPM}/60) \bmod 1\)

**Current:** SongClock \(\phi\_{\text{beat}} = B(t) \bmod 1\) injected as `audio.beatPhase` in `hooks/useAnalyserEngine.ts` (`bandsForScene`).

Post-FX pulse: \(\max(0, \sin(\pi \cdot \phi\_{\text{beat}}))\).

## User tuning

| Goal                     | Action                                |
| ------------------------ | ------------------------------------- |
| Lock grid to music       | Tap `T` on beats; `⇧T` on downbeat    |
| Show grid                | `M`                                   |
| Cycle views every 4 bars | `C`                                   |
| Fewer false beats        | Increase beat sensitivity / smoothing |

## Tests

`engine/__tests__/sync-invariants.test.ts` — manual lock, phrase boundaries, phase routing.
