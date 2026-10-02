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
  ├─ Object.assign(bandsForScene, bands)   // pooled — mutated, not re-allocated
  ├─ viewCycleController.tick(…)
  ├─ setLiveTempoFrame(…)                  // HUD @ engine rate
  ├─ viewEvolutionEngine.tick(…)           // Dynamic Mode drift (when enabled)
  ├─ scene.update(dt, t, bandsForScene)
  ├─ composer.render(dt) OR renderer.render()
  └─ stats / latency HUD commits (throttled)
```

`now` is `performance.now()` from rAF — used consistently for SongClock phase.

**Allocation discipline:** the hot path is allocation-free — `bandsForScene`
and `audio.read()`'s `AudioBands` output are pooled objects mutated in place
every frame, not fresh literals. (`tempoFrame` is deliberately _not_ pooled:
it flows into a React `useState` that detects changes by reference identity.)

---

## Timing budget (typical 60 FPS)

| Stage              | Target    | Notes                           |
| ------------------ | --------- | ------------------------------- |
| `audio.read()` CPU | < 2 ms    | FFT + BeatMatcher + BPMDetector |
| `scene.update()`   | < 8 ms    | View-dependent                  |
| Post-FX chain      | 2–15 ms   | Bloom/glitch costly             |
| **Total frame**    | < 16.7 ms | 60 FPS                          |

Performance mode reduces pixel ratio and skips the post-FX pipeline entirely
(`usePostFx = postFxEnabled && !xr && !performance`) — the Post FX tab shows a
warning banner while it's on. Loading a saved preset can never toggle it.

### Automatic quality tiers

`computeQualityTier(smoothedFps, currentTier)` in `engine/composer.ts`
auto-degrades post-FX under **sustained** low FPS, with hysteresis so it never
flaps and recovers one tier at a time:

| Tier | Enters below | Recovers at | Effect                                                          |
| ---- | ------------ | ----------- | --------------------------------------------------------------- |
| 1    | 40 fps       | ≥ 54 fps    | Disables SSAO + DoF only                                        |
| 2    | 24 fps       | ≥ 48 fps    | Also SMAA, motion trails, film grain, asset overlay; caps bloom |

Margins are deliberately generous so a 60Hz display's normal dips and
transient jank (GC, shader warm-up) never silently switch effects off.
Manual Performance Mode / XR force tier 2 regardless of FPS.

### Audio-reactive post-FX

Beyond the passes that were always reactive (SSAO, motion trails, radial
blur, sobel, asset overlay): bloom strength breathes with bass
(`base × (0.85 + 0.3·bass)`, re-clamped to the non-extreme ceiling), chroma
shimmers on high-band transients (`min(0.03, amount × (0.8 + 1.4·high))`),
and Glitch runs on a duty cycle — `glitchIntensity` (0–1) controls what
fraction of each ~1 s window the pass actually renders.

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

See [latency-metrics.test.ts](../packages/engine/src/__tests__/latency-metrics.test.ts) and [latency-benchmark.test.ts](../packages/engine/src/__tests__/latency-benchmark.test.ts).

## Response and HUD presentation

[Response and automatic balance](response-and-balance.md) describes the optional
feedback work after render and the presentation-only gain before scene update.
Auto balance is enabled by default, but is suspended in Performance Mode and VR.

The latency mini panel shows audio → UI, audio → scene, scene → render, signal → UI,
FFT window and audio-read CPU. A stale signal reading shows idle; ambient mode
labels FFT timing synthetic. These are distinct quantities, not an additive
end-to-end audio-device latency estimate.

Stats histories sample every 100 ms into 52-point buffers. Light exponential
smoothing affects graph samples only. Slowly adapting ranges keep small changes
visible without treating every fluctuation as a full-scale jump. Numerical rows
retain their measured values. The graphs add no independent animation loop.

Stats geometry is stored under `analyser-stats-layout-v1`, clamped to the viewport
and restored after full-page mode. Its scroll area keeps all sections reachable
when the panel is small. Shared `HUD_GLASS` styles keep blur consistent across
Stats, toolbar groups and mini panels.
