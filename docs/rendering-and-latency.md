# Rendering Pipeline and Latency

How frames flow from audio read to pixels, and where delay accumulates.

**Primary files:** `hooks/useAnalyserEngine.ts`, `engine/latency-metrics.ts`  
**Orchestrator:** `Analyser.tsx`  
**Scene:** `engine/scene.ts`  
**Post-FX:** `engine/composer.ts`

---

## Desktop frame loop

```
requestAnimationFrame(desktopLoop)
  ├─ audio.read(beatSensitivity, now)     // FFT + detectors
  ├─ songClock.tick({ now, estimated… })   // authoritative bar phase
  ├─ bandsForScene = { …bands, beatPhase, bpm: clockBpm }
  ├─ viewCycleController.tick(…)
  ├─ setLiveTempoFrame(…)                  // HUD @ engine rate
  ├─ scene.update(dt, t, bandsForScene)
  ├─ composer.render(dt) OR renderer.render()
  └─ stats / latency HUD commits (throttled)
```

`now` is `performance.now()` from rAF — used consistently for SongClock phase.

---

## Timing budget (typical 60 FPS)

| Stage              | Target    | Notes                           |
| ------------------ | --------- | ------------------------------- |
| `audio.read()` CPU | < 2 ms    | FFT + BeatMatcher + BPMDetector |
| `scene.update()`   | < 8 ms    | View-dependent                  |
| Post-FX chain      | 2–15 ms   | Bloom/glitch costly             |
| **Total frame**    | < 16.7 ms | 60 FPS                          |

Performance mode reduces pixel ratio and skips post-FX in XR.

---

## Latency components

### 1. FFT analysis window

\[
L\_{\text{FFT}} \approx \frac{N}{f_s}
\]

Reported in `bands.timing.fftWindowMs`.

### 2. Analyser smoothing

Exponential across frames — effective attack slowed by `smoothingTimeConstant`.

### 3. Audio output buffer

Web Audio reports:

\[
L\_{\text{out}} = \texttt{baseLatency} + \texttt{outputLatency}
\]

Exposed in `bands.timing` (seconds → ms in HUD).

### 4. Render pipeline

Measured each frame in `hooks/useAnalyserEngine.ts`:

\[
L*{\text{audio→scene}} = t*{\text{afterScene}} - t*{\text{fftRead}}
\]
\[
L*{\text{scene→render}} = t*{\text{afterRender}} - t*{\text{afterScene}}
\]
\[
L*{\text{audio→render}} = t*{\text{afterRender}} - t\_{\text{fftRead}}
\]

Smoothed with EMA in `latency-metrics.ts` (\(\alpha = 0.15\); signal line decays when idle).

### 5. Signal-to-render (musical)

When `BeatMatcher` fires `signalSwing` **on that frame only**:

\[
L*{\text{signal→render}} = t*{\text{afterRender}} - t\_{\text{signalChange}}
\]

`signalChangeAt` is a timestamp of the last transient, not a per-frame anchor — measuring every frame against it would grow linearly since the last swing (bogus tens-of-seconds readings). The HUD primary metric is always **audio→UI**; **signal→ui** appears as a secondary line when a fresh transient measurement exists.

---

## Beat phase for visuals

**Before SongClock:** scene used wall-clock \(t\) (session seconds):

\[
\phi\_{\text{wall}} = \left(t \cdot \frac{\text{BPM}}{60}\right) \bmod 1
\]

**Current (correct):** injected SongClock phase:

\[
\phi*{\text{visual}} = \phi*{\text{beat}} \quad \text{from SongClock}
\]

Post-FX pulse in `hooks/useAnalyserEngine.ts`:

\[
\text{pulse} = \max\left(0,\; \sin(\pi \cdot \phi\_{\text{beat}})\right)
\]

Scene kick uses phase wrap detection on \(\phi\_{\text{beat}}\) when BPM confident.

---

## HUD update path

```
Engine loop ──setLiveTempoFrame──► module singleton
                                        │
BarTimingHud ──rAF + useState──────► read getLiveTempoFrame()
```

Dots use `beatInPhrase` + `beatPhase` for pulse opacity/scale — no CSS transition on beat boundaries (avoids smear).

Control panel BPM uses `LIVE_TEMPO_EVENT` (~8 Hz) — numeric label only; grid uses frame bus.

---

## XR loop

WebXR uses `renderer.setAnimationLoop(loop)` — same `loop()` body, `xrRuntime.active` toggles quality/post-FX.

---

## HUD layout

| Display                    | Meaning                                                              |
| -------------------------- | -------------------------------------------------------------------- |
| **Large value**            | Smoothed audio→UI (per-frame pipeline)                               |
| audio→scene / scene→render | Instantaneous segment timings                                        |
| signal→ui (when visible)   | Last transient→pixel latency (only measured on `signalSwing` frames) |

Toggle with `L`. Stats panel (`N`) shows the same metrics under **Timing**.

---

## Profiling checklist

1. Press `N` — stats panel (FPS, draw calls, audio timings)
2. Enable latency HUD (`L`) — primary is audio→UI; signal→ui when transients fire
3. Compare tap grid (`M`) vs heard downbeat — if grid leads audio, output latency dominates
4. If FPS < 60, SongClock phase updates coarser (engine-bound) — HUD rAF may repeat stale frames

See [latency-metrics.test.ts](../src/components/analyser/engine/__tests__/latency-metrics.test.ts) and [latency-benchmark.test.ts](../src/components/analyser/engine/__tests__/latency-benchmark.test.ts).
