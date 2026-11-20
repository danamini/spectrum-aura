# Song Clock and Musical Sync

**Authoritative timing for bar grid, view cycling, and visual beat phase.**

**Source:** `packages/engine/src/song-clock.ts`

**Consumers:** `hooks/useAnalyserEngine.ts`, `BarTimingHud.tsx`, `view-cycle-controller.ts`, `scene.ts` (via injected `beatPhase`)

---

## Design principle

> One clock owns bar/beat position. Manual taps anchor the grid; aligned audio may nudge phase and resume auto correction.

```
BPMDetector ──estimated BPM/confidence──┐
Manual taps ──epoch/BPM─────────────────┼→ SongClock.tick() → BarTiming
MIDI input ───clock/transport───────────┘
```

---

## Clock modes (`ClockSource`)

| Mode       | Entry                                                       | Behavior                                                                                                |
| ---------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `idle`     | Initial / lost auto confidence                              | No grid (`EMPTY_BAR_TIMING`)                                                                            |
| `auto`     | 4 consecutive confident frames OR `bpmLocked` from detector | Epoch at lock; BPM blends toward estimate with adaptive α (0.25 → 0.03 over ~30 frames)                 |
| `manual`   | Any `hintBeat` / `hintDownbeat`                             | Tap-owned epoch; misaligned audio onsets ignored; aligned onsets may nudge and release to auto          |
| `external` | Selected MIDI clock input                                   | External tempo/position owns the grid; audio cannot override it; Stop or clock loss freezes advancement |

---

## External MIDI sync

Selecting a clock input in the MIDI panel gives `SongClock` an `external` source.
`midi-clock.ts` decodes 24 pulses per quarter note and Start/Continue/Stop/song
position. The source carries pulse position and timestamps, not an independent
bar grid. SongClock derives all beat/bar/phrase indices and interpolates between
pulses, capped below the next pulse to avoid inventing beats on a stalled input.
Audio estimates cannot override external timing. A clock gap freezes the grid;
restart transport to recover position. T/Shift+T clears the external input choice
and returns control to manual taps. The grid remains 4/4; MIDI clock does not
supply time signature. See [MIDI setup](midi.md).

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

### Stale re-acquisition

If nothing confirms the tapped tempo for `MANUAL_REACQUIRE_AFTER_MS` (6 s) —
silence and sustained misalignment look the same from here — manual mode drops
back to idle and raises a one-shot signal (`consumeManualReleaseSignal()`).
The render loop consumes it to also call `BPMDetector.releaseManualLock()`
(SongClock has no reference to the detector) and flashes "Re-syncing…".
Re-tapping mid-gap resets the grace period, as does any confirmed alignment.

### Section-start ("drop") detection (auto / post-tap)

The clock averages the **kick band** (`AudioBands.kick`, 30–180 Hz; `bass`
when a source has none) over each beat. At each beat line it closes the beat
that just ended and compares it with the previous 8 beats. That beat starts a
new section when, with at least 6 beats of history and 8 beats since the last
detection, its kick level is at least **0.04 above the loudest** of those
beats.

Levels are on the analyser's decibel scale (0–1 spans 70 dB), so the test is a
difference, not a ratio; 0.04 is about 3 dB. On recorded tracks the kick band
steps by 0.1–0.25 at a section start, while the wide `bass` band (0–1.9 kHz)
moves by 0.03 or less under vocals and synths.

The comparison is against the loudest recent beat, not the mean: in a steady
groove the kick beats already sit above the average of kick and snare beats.

On detection the phrase is re-anchored so that beat is bar 1, beat 1, and
`phraseChangeDetected` is set. The anchor is the time of the first
section-sized onset inside that beat (or late in the beat before it, if the
grid had drifted), so beat 1 sits on the kick itself. Detection necessarily
comes one beat after the hit, so the clock usually resumes at beat 2 and
`phraseJustStarted` does not fire for that phrase.

This replaced a per-bar comparison that noticed a change a full bar after it
happened and anchored the phrase there — one bar late — and that required an
onset on the exact frame of the bar line.

---

## Auto mode entry

Requires:

\[
\text{BPM} \in [65, 195] \land (\text{bpmLocked} \lor \text{confidence} > 0.62)
\]

After 4 consecutive qualifying frames (or immediate if `bpmLocked`) the clock
enters auto. Beat 1 is placed on the **last confident onset** if one arrived
within the past beat period, otherwise at `now`.

Until the grid is confirmed (below), tempo follows the detector: while not
detector-locked the clock blends toward the estimate with `autoBpmBlendAlpha`
(\(\alpha\) from **0.25** on entry easing to **0.03** over 30 frames), and
once locked it takes the estimate directly. Every tempo change goes through
`setClockBpm`, which re-anchors the epoch so the beat position is unchanged —
a tempo correction no longer slides the grid.

### Auto phase lock

In auto mode each confident onset (`audioBeat`, `onsetStrength ≥ 0.06`) is
compared with the nearest grid beat; \(e\) is the error in beats, positive
when the onset is late.

| Case                                  | Action                                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------- |
| \(\lvert e\rvert \le 0.25\)           | Epoch moves by \(0.22\,e\) beats. Once confirmed, tempo is scaled by \(1 - 0.03\,e\). |
| \(\lvert e\rvert\) within 0.12 of 0.5 | Counts toward an off-beat lock; 6 in a row shift the grid half a beat.                |
| otherwise                             | Counts toward a lost lock.                                                            |

After **6 aligned onsets** the grid is _confirmed_ and the clock owns its
tempo as a flywheel: it no longer follows the detector, so it holds tempo
through a breakdown with no beats, where the detector's estimate wanders. It
coasts up to 12 s after the detector loses the tempo before returning to idle.

A confirmed clock still accepts two things from the detector:

- **Octave correction:** an estimate at double or half the clock's tempo for
  1.5 s switches the clock, leaving the epoch in place so phrase starts stay at
  the same moments.
- **Lost lock:** 8 onsets in a row that fit neither the beat nor the off-beat
  unconfirm the grid, take the detector's tempo and put that onset on a beat.

The phase lock does not run in manual mode, where taps are the anchor.

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
6. A stale manual lock (>6 s with no confirmed alignment) reverts to idle and
   signals the detector tap-lock release (`song-clock.test.ts`)
7. Phase nudges cannot make a beat tick twice: the beat count is held
   monotonic except at an explicit re-anchor
8. End-to-end accuracy against simulated tracks with known beats —
   `sync-benchmark.test.ts`: tempo within 0.2–0.3%, beats within 0.1 of a beat,
   bar 1 on the drop, no section calls on a steady track

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
