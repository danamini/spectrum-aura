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

Beat fires if bass spike **or** fusion onset passes threshold, with a refractory
period. Once a confident tempo is known (`detect()` receives last frame's
`estimatedBpm`/`bpmConfident` from `audio.ts`), the gap scales with the beat:

\[
\Delta t\_{\min} = \operatorname{clamp}\!\left(\frac{60000}{\text{BPM}} \cdot 0.35,\; 100,\; 220\right)\,\text{ms}
\]

falling back to the fixed pre-lock rule while tempo is unknown:

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

### Peak interval BPM (with subdivision folding)

Real music's peak stream mixes beat onsets with hi-hat subdivisions and
syncopation, so the raw interval list has huge spread even at a rock-steady
tempo. Before taking the median, every interval is folded into the seed
median's octave (`< 0.72×median` doubles, `> 1.45×median` halves) so
subdivisions count as *evidence for* the beat period instead of polluting it:

\[
\text{BPM}\_{\text{peak}} = \frac{60000}{\tilde{\Delta t}\_{\text{folded}}}
\]

Octave correction: double if \(<80\), halve if \(>180\), clamp \([60,200]\).

### Autocorrelation tempogram

Resample envelope to 25 ms bins over 8 s. For each lag \(\ell\):

\[
R(\ell) = \frac{1}{C}\sum_i e[i]\,e[i-\ell]
\]

Pick \(\ell^\*\) with parabolic refinement. Convert lag → BPM. Runs **every
analysis pass** (it sees through subdivision noise by operating on the whole
envelope) — both as an estimate and as a cross-check: when the peak and
autocorrelation estimates agree within 5%, confidence is floored at
\(\min(0.85,\; 0.55 + 0.5\cdot\text{autoStrength})\).

### Blend and smooth

\[
\text{BPM} \leftarrow (1-\alpha)\,\text{BPM}_{\text{prev}} + \alpha\,\text{BPM}_{\text{blend}}
\]

with \(\alpha \approx 0.08\) (adaptive).

### Confidence

CV is computed over **median-filtered** intervals (only those within
\([0.72, 1.38]\times\) the median), scaled by how much of the raw evidence fits
that dominant cluster:

\[
\text{confidence} = \operatorname{clamp}\bigl((1 - 3\cdot CV)(0.55 + 0.45\cdot f\_{\text{cluster}})\bigr) + \text{peak/auto bonuses}
\]

**Silence decay:** once combined band energy stays below an adaptive floor
(\(\max(0.01,\; 0.2\cdot\bar{E}\_{\text{long}})\), relative to a slow-moving
long-term average so it tracks the actual input level) for >1.2 s, confidence
decays by \(0.85^{\,\text{silentMs}/250}\) — so a stale estimate doesn't read
as "still locked" through silence or the gap between songs.

### Lock / unlock criteria (`applyBpmLock`)

- **Lock** when either fires with a valid candidate:
  - `highConfidenceStreak >= 4` (confidence > 0.62 on 4 consecutive passes), or
  - **stability lock**: 4 of the last 5 candidates within ±3.5% of each other
    with confidence ≥ 0.3 — real music rarely sustains the streak, but the
    estimate itself settles fast.
- **While locked**: candidates within **4 BPM** blend into the lock
  (97/3 EMA) and pin reported confidence ≥ 0.72; a clean 2x/0.5x octave match
  (`isOctaveMismatch`, ±4%) corrects the lock in place after 6 consecutive
  passes; anything else counts toward drift-reject.
- **Unlock** only after 12 consecutive divergent passes with diff > **8 BPM**.

### Tap lock (`hintBeat`)

When user taps `T` ≥2 times:

- `tapLocked = true` — BPM frozen to median tap interval
- `phaseAnchorTime` set on each tap
- Audio drift/unlock logic **disabled** while tap-locked. Two exits: `reset()`,
  or `releaseManualLock()` — invoked when SongClock's stale re-acquisition
  fires (no confirmed alignment for 6 s; see song-clock-and-sync.md).

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
