# Agent Guide — Spectrum Aura

Instructions for Cursor, Claude Code, and other coding agents working in this repository.

## What this project is

Browser-only React + Three.js audio visualizer. No backend. Real-time FFT → features → **SongClock** (authoritative bar/beat grid) → scene + post-FX.

## Read first

| Priority | Document |
|----------|----------|
| 1 | [docs/song-clock-and-sync.md](docs/song-clock-and-sync.md) — timing invariants |
| 2 | [docs/audio-analysis-pipeline.md](docs/audio-analysis-pipeline.md) — BeatMatcher, BPMDetector |
| 3 | [docs/rendering-and-latency.md](docs/rendering-and-latency.md) — rAF loop, latency HUD |
| 4 | [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — structure, tests, conventions |

## Architecture (do not break)

```
MediaStream → audio.ts (FFT, BeatMatcher, BPMDetector)
                    ↓ estimated BPM/confidence
              song-clock.ts (idle | auto | manual)
                    ↓ BarTiming
    Analyser.tsx → scene.ts, composer.ts, BarTimingHud, view-cycle-controller
```

### Hard invariants

1. **One authoritative clock** — `SongClock` owns bar/beat index and `beatPhase` for visuals after sync.
2. **Manual taps anchor initially** — After `hintBeat` / `⇧T`, misaligned audio must not skip beats; aligned audio may nudge phase and release to auto after 8 matches.
3. **No wall-clock BPM phase in scene** — `scene.ts` uses `audio.beatPhase` from SongClock injection, not `time * (bpm/60)`.
4. **View cycle on phrase** — Switch views on `phraseJustStarted && totalBeats > 16` (4 bars), not every bar.
5. **Render loop TDZ** — In `Analyser.tsx`, declare `displayedView` and related state before any derived keys that reference them.

### Common pitfalls

| Mistake | Symptom | Fix |
|---------|---------|-----|
| Calling removed `setBarTiming` in render loop | Runtime crash | Use `setLiveTempoFrame()` only |
| Driving grid from `bands.beat` | Double/skipped beats after tap | Route through `SongClock.tick()` |
| BPM phase only in 250ms analysis | Choppy HUD dots | Phase in `BPMDetector.tick()` every frame |
| `epochMs === 0` as “unset” | Manual sync fails at t=0 | Use `epochSet` flag in SongClock |
| Measuring signal latency every frame | HUD shows tens of seconds | Only on `signalSwing` frames; see `latency-metrics.ts` |
| Tests beside modules | Vitest won't find them | Put under `__tests__/` |

## Key files

| Area | Path |
|------|------|
| Orchestrator | `src/components/analyser/Analyser.tsx` |
| Song clock | `src/components/analyser/engine/song-clock.ts` |
| Bar types alias | `src/components/analyser/engine/bar-clock.ts` |
| BPM estimate | `src/components/analyser/engine/bpm-detector.ts` |
| Onsets | `src/components/analyser/engine/beat-matcher.ts` |
| Audio read | `src/components/analyser/engine/audio.ts` |
| View cycle | `src/components/analyser/engine/view-cycle-controller.ts` |
| HUD | `src/components/analyser/BarTimingHud.tsx` |
| Live tempo bus | `src/components/analyser/engine/live-tempo.ts` |
| Latency metrics | `src/components/analyser/engine/latency-metrics.ts` |
| Shortcuts | `src/components/analyser/Shortcuts.tsx` |
| Settings | `src/components/analyser/store.ts` |

## Tests

```bash
npm run test:run    # must pass before PR
npm run build
npm run check       # lint + test
```

**Layout:** all tests live in `__tests__/` folders:

- `src/components/analyser/__tests__/` — UI, store, shortcuts, regression
- `src/components/analyser/engine/__tests__/` — engine units + sync invariants

**Critical suites:**

- `sync-invariants.test.ts` — manual lock, phrase cycle, phase routing
- `Analyser.regression.test.ts` — render-loop initialization order
- `song-clock.test.ts` — tap/auto modes, beat math
- `latency-metrics.test.ts` — signal latency must not grow from stale timestamps

Shared harness: `engine/__tests__/helpers/song-clock.harness.ts`

Vitest config: `include: ["src/**/__tests__/**/*.{test,spec}.{ts,tsx}"]`

## Shortcuts (user-facing)

| Key | Action |
|-----|--------|
| `T` | Beat tap (manual sync) |
| `⇧T` | Downbeat / phrase reset |
| `M` | Toggle BPM & bar grid HUD |
| `L` | Latency HUD |
| `G` | Hide/show shortcut bar |
| `C` | Toggle music-reactive view cycle |
| `N` | Stats panel |
| `R` `B` `V` | Randomize / prev / next visual |
| `S` | Settings panel |

Keyboard handlers and the bottom shortcut bar must stay in sync — see `Shortcuts.tsx` utility cluster.

## Making changes safely

### Sync / timing

1. Change `song-clock.ts` logic
2. Update `sync-invariants.test.ts` and `song-clock.test.ts`
3. Verify `Analyser.tsx` still injects `beatPhase` / `clockBpm` into `bandsForScene`
4. Do not reintroduce parallel `BarClock` advancement from raw beats

### New settings

1. `Settings` + `DEFAULT_SETTINGS` in `store.ts`
2. Pass through `Analyser.tsx` → `Scene.update()` opts
3. `ControlPanel.tsx` if user-facing
4. Test in `__tests__/store.*.test.ts`

### New shortcut

1. Keyboard handler in `Shortcuts.tsx` `onKey` (via `actionsRef`)
2. Button in the appropriate rail cluster (utility row for HUD/sync tools)
3. `Shortcuts.test.tsx` — key binding + bar button if user-facing

### New visual

1. Manifest in `visuals.ts` or `visuals/*.visual.ts`
2. `build*` / `update*` in `scene.ts`
3. Registry drives shortcuts — update `Shortcuts.test.tsx` if rail changes

## Code style

- Minimal diff; match existing patterns
- TypeScript strict; no `any` without reason
- Comments only for non-obvious timing/math
- Do not commit unless user asks
- Do not edit `.cursor/plans/` plan files

## Equations quick reference

Beat period: \(T_{\text{beat}} = 60000/\text{BPM}\)

Continuous beat index from epoch \((t_0, b_0)\):

\[
B(t) = (b_0 - 1) + \frac{t - t_0}{T_{\text{beat}}}
\]

Beat phase: \(\phi = B(t) \bmod 1\)

Phrase (16 beats): \(\text{beatInPhrase} = (\lfloor B \rfloor \bmod 16) + 1\)

See [docs/song-clock-and-sync.md](docs/song-clock-and-sync.md) for full derivations.
