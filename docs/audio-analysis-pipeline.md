# Audio Analysis Pipeline

Technical reference for how Spectrum Aura turns PCM → features → tempo estimates.

**Source files:** `engine/audio.ts`, `engine/beat-matcher.ts`, `engine/bpm-detector.ts`

---

## 1. Capture and analyser graph

```
MediaStream → MediaStreamSource → GainNode → AnalyserNode → (FFT read each frame)
```

| Parameter               | Default                    | Notes                               |
| ----------------------- | -------------------------- | ----------------------------------- |
| `fftSize`               | 2048                       | UI: 512 / 1024 / 2048 / 4096        |
| `smoothingTimeConstant` | 0.45 (latency mode) / 0.82 | Exponential smoothing across frames |
| `latencyHint`           | `interactive`              | Reduces output buffer when enabled  |

### FFT window duration

For sample rate \(f_s\) and FFT size \(N\):

\[
T\_{\text{window}} = \frac{N}{f_s}
\]

Example: \(N=2048\), \(f*s=48000\) → \(T*{\text{window}} \approx 42.7\,\text{ms}\).

The analyser returns unsigned byte magnitudes \(M[k] \in [0,255]\) per bin \(k\). We normalize:

\[
v_k = \frac{M[k]}{255}
\]

---

## 2. Band aggregation

Bins are split by proportional index (not Hz) for speed and stability:

| Band | Bin range                          | Normalizer |
| ---- | ---------------------------------- | ---------- |
| Bass | \([0, \lfloor 0.08N \rfloor)\)     | `bassDiv`  |
| Mid  | \([0.08N, \lfloor 0.35N \rfloor)\) | `midDiv`   |
| High | remainder                          | `highDiv`  |

\[
\text{bass} = \frac{1}{|\mathcal{B}|}\sum\_{k \in \mathcal{B}} v_k
\]

### Spectral centroid (normalized)

\[
\text{centroid} = \frac{\sum_k k \cdot v_k}{\sum_k v_k} \cdot \frac{1}{N} \in [0,1]
\]

Higher centroid → brighter / more treble energy.

---

## 3. BeatMatcher — transient detection

**File:** `engine/beat-matcher.ts`

Purpose: boolean **onset** `beat` for accents (camera kick, flashes). Not used to advance the bar grid after `SongClock` manual lock.

### Onset fusion

\[
\Delta*b = b_t - b*{t-1},\quad \text{etc.}
\]

\[
O_t = \max(0,\Delta_b) + 0.55\max(0,\Delta_m) + 0.3\max(0,\Delta_h) + 0.15\max(0,\Delta_c)
\]

### Adaptive threshold

Rolling mean over 43 frames:

\[
\bar{b} = \frac{1}{W}\sum*{i=0}^{W-1} b*{t-i}
\]

\[
\tau = \max\bigl(0.12,\; 0.78 \cdot (0.72\bar{b} + 0.28\bar{m})\bigr) \cdot \texttt{beatThreshold}
\]

Beat fires if bass spike **or** fusion onset passes threshold, with refractory period:

\[
\Delta t\_{\min} = \begin{cases} 160\,\text{ms} & \bar{b} > 0.35 \\ 180\,\text{ms} & \text{otherwise} \end{cases}
\]

---

## 4. BPMDetector — tempo estimation

**File:** `engine/bpm-detector.ts`

Purpose: estimate BPM + confidence + a **detector** beat phase. After `SongClock` is active, visuals use **SongClock** phase, not detector phase.

### Onset envelope feed (50 ms throttle)

\[
E_t = 0.68 b + 0.24 m + 0.08 h + 0.35 O_t
\]

Stored in an 8 s sliding window for peak picking.

### Peak interval BPM

Median inter-peak interval \(\tilde{\Delta t}\):

\[
\text{BPM}\_{\text{peak}} = \frac{60000}{\tilde{\Delta t}}
\]

Octave correction: double if \(<80\), halve if \(>180\), clamp \([60,200]\).

### Autocorrelation tempogram

Resample envelope to 25 ms bins over 8 s. For each lag \(\ell\):

\[
R(\ell) = \frac{1}{C}\sum_i e[i]\,e[i-\ell]
\]

Pick \(\ell^\*\) with parabolic refinement. Convert lag → BPM.

### Blend and smooth

\[
\text{BPM} \leftarrow (1-\alpha)\,\text{BPM}_{\text{prev}} + \alpha\,\text{BPM}_{\text{blend}}
\]

with \(\alpha \approx 0.08\) (adaptive).

### Confidence from interval CV

\[
CV = \frac{\sigma*{\Delta t}}{\mu*{\Delta t}},\qquad
\text{confidence} \approx \max(0, 1 - 3\cdot CV) + \text{bonuses}
\]

### Tap lock (`hintBeat`)

When user taps `T` ≥2 times:

- `tapLocked = true` — BPM frozen to median tap interval
- `phaseAnchorTime` set on each tap
- Audio drift/unlock logic **disabled** until reset

### Beat phase (detector-only)

\[
\phi*{\text{det}}(t) = \frac{(t - t*{\text{anchor}}) \bmod T*{\text{beat}}}{T*{\text{beat}}},\quad
T\_{\text{beat}} = \frac{60000}{\text{BPM}}
\]

Updated every `tick()` call (not only on 250 ms analysis frames).

---

## 5. Audio.read() output (`AudioBands`)

| Field                               | Role                                                             |
| ----------------------------------- | ---------------------------------------------------------------- |
| `bass`, `mid`, `high`, `centroid`   | Scene motion                                                     |
| `beat`                              | BeatMatcher onset                                                |
| `bpm`, `bpmConfidence`, `bpmLocked` | Fed to SongClock as **estimates**                                |
| `beatPhase`                         | Detector phase (overridden by SongClock in Analyser when synced) |
| `onsetStrength`, `signalSwing`      | View cycle / diagnostics                                         |
| `timing.*`                          | Latency HUD                                                      |

---

## 6. Tuning guide

| Symptom              | Knob                                              |
| -------------------- | ------------------------------------------------- |
| Too many false beats | ↑ `beatSensitivity`, ↑ smoothing                  |
| Sluggish transients  | ↓ FFT size, ↓ smoothing                           |
| BPM hunts            | Tap `T` twice+ to manual lock; use cleaner source |
| Grid wrong phrase    | `⇧T` on downbeat                                  |

See [song-clock-and-sync.md](./song-clock-and-sync.md) for grid ownership.
