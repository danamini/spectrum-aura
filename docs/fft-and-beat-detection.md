# FFT and Beat Detection in Spectrum Aura

This document explains how Spectrum Aura derives visual motion from live audio and how BPM estimation works in the current implementation.

## Pipeline Overview

1. Capture audio stream (mic or tab/system).
2. Feed stream into Web Audio AnalyserNode.
3. Pull frequency bins each frame with getByteFrequencyData.
4. Aggregate bins into low-level features:
   - bass
   - mid
   - high
   - centroid
5. Run beat and BPM detection primarily from bass energy history.
6. Drive scene transforms, color energy, and camera response.

## FFT in This Project

### What the analyzer gives us

The analyzer computes a spectrum each frame. Conceptually, the FFT converts a time-domain signal into frequency-domain components:

$$
X[k] = \sum_{n=0}^{N-1} x[n] e^{-j 2\pi kn / N}
$$

Where:

- $x[n]$ is the input audio window
- $N$ is the FFT size
- $X[k]$ is the complex frequency bin

In practice here, the app reads magnitude-like byte bins from Web Audio (0-255), not raw complex values.

### FFT settings used

- Default FFT size: 2048
- Supported UI sizes: 512, 1024, 2048, 4096
- Smoothing time constant: tunable, default around 0.82

Tradeoff summary:

- Larger FFT: finer frequency resolution, slightly more latency/compute.
- Smaller FFT: faster response, coarser spectral detail.

### Band extraction strategy

The app splits the frequency-bin array by proportion:

- Bass: first 8% of bins
- Mid: up to 35% of bins
- High: remaining bins

Each band is normalized by its section length. This is simple, stable, and cheap for real-time visuals.

### Spectral centroid approximation

Centroid is estimated as a weighted index mean:

$$
centroid \approx \frac{\sum_i i \cdot v_i}{\sum_i v_i} \cdot \frac{1}{N}
$$

This yields a normalized 0..1 value. Higher centroid usually means brighter/treblier sound.

## Beat Detection (Instant Events)

Beat events are detected from bass energy spikes using:

- Rolling bass history window
- Threshold against rolling average (beatSensitivity multiplier)
- Minimum inter-beat cooldown (~180 ms)
- Additional absolute bass floor check

This produces a boolean beat pulse for camera kick and short visual accents.

## BPM Detection (Temporal Rhythm)

BPM is estimated with a sliding-window peak detector.

### Inputs and buffers

- Detector stores pairs of bass energy and timestamp.
- Default analysis window is about 8 seconds.
- Old entries beyond the window are dropped continuously.

### Peak finding

Primary mode uses slope change:

- Detect rising-to-falling transitions in bass energy.
- Treat local hill-top as a candidate peak.
- Enforce minimum spacing (about 120 ms) to suppress noise peaks.

Fallback mode uses thresholded local maxima if needed.

### Interval to BPM

1. Compute intervals between consecutive detected peaks.
2. Use median interval for outlier robustness.
3. Convert interval to BPM:

$$
BPM = \frac{60000}{\Delta t_{ms}}
$$

4. Correct common octave errors:
   - If BPM is very low, double it.
   - If BPM is very high, halve it.
5. Clamp to a practical range (60-200 BPM).
6. Apply temporal smoothing to reduce jitter.

### Confidence estimate

Confidence is based on interval consistency using coefficient of variation:

$$
CV = \frac{\sigma_{interval}}{\mu_{interval}}
$$

Lower $CV$ means steadier rhythm and higher confidence. Peak count contributes a small bonus.

## How Visuals Consume These Features

- Bass: bar heights, sphere punch, camera kick.
- Mid/high: particle energy, color transitions, detail motion.
- Centroid: palette blending behavior.
- Beat pulse: transient camera and scene accents.
- BPM + confidence: phase-synced rotation/pulsing in Combo mode.

A simple BPM phase term is used:

$$
phase = (t \cdot BPM / 60 \cdot 0.5) \bmod 1
$$

This phase modulates ring rotation, sphere spin boost, and pulse timing.

## Practical Tuning Tips

- If beats are too jumpy: raise smoothing or increase beat sensitivity.
- If BPM lags: lower FFT size and reduce smoothing slightly.
- If BPM is unstable in noisy input: use cleaner source and moderate gain.
- For punchier visuals: increase bass-reactive multipliers in Combo view.

## Known Limits and Next Improvements

Current approach is intentionally lightweight and real-time friendly, but music with weak kick drums, heavy syncopation, or ambient textures can reduce BPM reliability.

Potential upgrades:

- Multi-band onset fusion (not bass-only).
- Autocorrelation or tempogram-based tempo tracking.
- Adaptive thresholds by short/long-term energy statistics.
- Harmonic-percussive separation before peak analysis.
- Confidence-aware fallback behavior in visual sync.
