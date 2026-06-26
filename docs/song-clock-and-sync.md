# Song Clock and Musical Sync

**Authoritative timing for bar grid, view cycling, and visual beat phase.**

**Source:** `engine/song-clock.ts`  
**Consumers:** `hooks/useAnalyserEngine.ts`, `BarTimingHud.tsx`, `view-cycle-controller.ts`, `scene.ts` (via injected `beatPhase`)

---

## Design principle

> One clock owns bar/beat position. Manual taps anchor the grid; aligned audio may nudge phase and resume auto correction.

```
BPMDetector  ──estimated BPM/confidence──┐
                                       ├──► SongClock.tick() ──► BarTiming
Manual taps (T / ⇧T) ──epoch/BPM──────┘
```

---

## Clock modes (`ClockSource`)

| Mode     | Entry                                                       | Behavior                                                                                       |
| -------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `idle`   | Initial / lost auto confidence                              | No grid (`EMPTY_BAR_TIMING`)                                                                   |
| `auto`   | 4 consecutive confident frames OR `bpmLocked` from detector | Epoch at lock; BPM drifts 3%/frame toward estimate                                             |
| `manual` | Any `hintBeat` / `hintDownbeat`                             | Tap-owned epoch; misaligned audio onsets ignored; aligned onsets may nudge and release to auto |

---

## Continuous beat index

Given epoch \((t_0, b_0)\) where \(b_0\) is the 1-based beat number at \(t_0\), and clock BPM \(\text{BPM}\_c\):

\[
T\_{\text{beat}} = \frac{60000}{\text{BPM}\_c}
\]

\[
B(t) = (b*0 - 1) + \frac{\max(0,\; t - t_0)}{T*{\text{beat}}}
\]

Phrase position (16 beats in 4/4):

\[
p = B(t) \bmod 16
\]

\[
\text{beatInPhrase} = \lfloor p \rfloor + 1
\]

\[
\phi\_{\text{beat}} = p - \lfloor p \rfloor
\]

\[
\text{beatInBar} = ((\text{beatInPhrase} - 1) \bmod 4) + 1
\]

\[
\phi\_{\text{phrase}} = \frac{p}{16}
\]

### Boundary flags

- `beatJustTicked`: \(\lfloor B(t) \rfloor > \lfloor B(t\_{\text{prev}}) \rfloor\)
- `barJustStarted`: beat ticked AND `beatInBar === 1`
- `phraseJustStarted`: beat ticked AND `beatInPhrase === 1` AND (`totalBeats > 1` OR downbeat latch from `⇧T`)

---

## Manual taps

### `T` — beat tap (`hintBeat`)

1. Record tap time; reset tap list if gap \(> 2000\,\text{ms}\) (`TAP_TIMEOUT_MS`)
2. If ≥2 taps in window: \(\text{BPM}\_c = 60000 / \text{median}(\Delta t_i)\), clamped \([60,200]\)
3. Set `source = manual`
4. If consecutive tap within \(1.6 \cdot T\_{\text{beat}}\): increment epoch beat; else resync phase

### `⇧T` — downbeat (`hintDownbeat`)

Sets \(b_0 = 1\), \(t_0 = \text{now}\) — phrase resets to **1/16** immediately.

- Fires `phraseJustStarted` on the downbeat frame (even on first sync)
- Uses tap-learned BPM when available; otherwise accepts estimated BPM from the audio analyser
- Does not advance the beat counter — the tap instant **is** beat 1

### Manual tap complete → audio override

After manual sync has a BPM (`manualTapComplete`), confident audio onsets may:

1. **Nudge phase** when within 22% of an expected beat boundary
2. **Blend BPM** slowly toward the audio estimate
3. **Release to auto** after 8 consecutive aligned audio beats (confidence > 0.68)

Manual mode is not a permanent lock — it is the user's anchor until audio agrees.

### 4-bar phrase change detection (auto / post-tap)

Each completed bar stores a signature \((\bar{b}, \bar{m}, \bar{c})\).

At each bar line, compare the bar that just ended to the mean of recent bars. When:

- At least 4 bar signatures exist
- Spectral distance \(\geq 0.14\)
- Strong onset on the new bar (`audioBeat` + `onsetStrength ≥ 0.08`)

…the clock realigns to phrase downbeat (same as `⇧T`) and sets `phraseChangeDetected`.

---

## Auto mode entry

Requires:

\[
\text{BPM} \in [65, 195] \land (\text{bpmLocked} \lor \text{confidence} > 0.62)
\]

After 4 consecutive qualifying frames (or immediate if `bpmLocked`):

\[
t*0 = \text{now},\quad b_0 = 1,\quad \text{BPM}\_c = \text{BPM}*{\text{est}}
\]

While auto and not detector-locked:

\[
\text{BPM}_c \leftarrow 0.97\,\text{BPM}\_c + 0.03\,\text{BPM}_{\text{est}}
\]

No beat index jumps — only tempo slowly corrects.

---

## View cycle coupling

**File:** `view-cycle-controller.ts`

Switches visual on **phrase boundary** (start of beat 1 after first full 16-beat phrase):

```typescript
phraseJustStarted && totalBeats > 16;
```

Cooldown:

\[
t*{\min} = \max(3200,\; 0.72 \cdot 16 \cdot T*{\text{beat}})
\]

---

## Live tempo bus

**File:** `engine/live-tempo.ts`

| API                   | Rate               | Use                       |
| --------------------- | ------------------ | ------------------------- |
| `setLiveTempoFrame()` | Every engine frame | `BarTimingHud` rAF reader |
| `dispatchLiveTempo()` | ~8 Hz              | Control panel BPM label   |

`BarTiming` in frame bus is the same struct `SongClock.tick()` returns.

---

## Invariants (enforced by tests)

`engine/__tests__/sync-invariants.test.ts`

1. Misaligned audio onsets do not skip `beatInPhrase` during manual sync
2. Aligned audio onsets may release manual mode to auto after 8 consecutive matches
3. Scene `bpmPhase` uses `audio.beatPhase` from SongClock injection, not session wall clock
4. View cycle only on `phraseJustStarted` after 16 beats
5. `⇧T` downbeat sets `beatInPhrase === 1` immediately

---

## Shortcuts

| Key  | Action                                               |
| ---- | ---------------------------------------------------- |
| `T`  | Beat tap                                             |
| `⇧T` | Downbeat (1/16)                                      |
| `M`  | Toggle BPM & bar grid HUD                            |
| `L`  | Toggle latency HUD                                   |
| `G`  | Hide/show shortcut bar                               |
| `C`  | Toggle music-reactive view cycle (phrase boundaries) |

All sync/HUD shortcuts appear in the bottom utility cluster (`Shortcuts.tsx`).
