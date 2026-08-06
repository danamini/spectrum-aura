# Agent Guide — Spectrum Aura

Instructions for Cursor, Claude Code, and other coding agents working in this repository.

## What this project is

Browser-only React + Three.js audio visualizer. No backend. Real-time FFT → features → **SongClock** (authoritative bar/beat grid) → scene + post-FX.

**Workspace layout** (npm workspaces): the engine is a separate package so multiple frontends can share it.

- `packages/engine` — `@spectrum-aura/engine`: audio analysis, SongClock, scene views, composer post-FX, MIDI, visual registry, settings schema. No React, no app-store, no theme imports — keep it that way.
- `src/` — the visualizer app (React UI, settings store/persistence, control panel, shortcuts).
- `examples/ui-kit` — minimal second frontend: engine bands drive plain UI via CSS variables (`npm run example:ui-kit`).
- `examples/video-loop` — third frontend: local video through the engine Composer's post-FX presets; YouTube embeds via CSS FX + share-tab audio (`npm run example:video-loop`).

App code imports the engine as `@spectrum-aura/engine/<module>`; the app-side `store.ts` re-exports the settings schema for legacy imports.

## Read first

| Priority | Document                                                                                      |
| -------- | --------------------------------------------------------------------------------------------- |
| 1        | [docs/song-clock-and-sync.md](docs/song-clock-and-sync.md) — timing invariants                |
| 2        | [docs/audio-analysis-pipeline.md](docs/audio-analysis-pipeline.md) — BeatMatcher, BPMDetector |
| 3        | [docs/rendering-and-latency.md](docs/rendering-and-latency.md) — rAF loop, latency HUD        |
| 4        | [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — structure, tests, conventions                    |
| 5        | [docs/retro-systems-and-postfx.md](docs/retro-systems-and-postfx.md) — retro pass, FX pipeline |

## Architecture (do not break)

```
MediaStream → audio.ts (FFT, BeatMatcher, BPMDetector)
                    ↓ estimated BPM/confidence
              song-clock.ts (idle | auto | manual)
                    ↓ BarTiming
Analyser.tsx (orchestrator)
  ├─ hooks/useAnalyserEngine   — rAF/XR loop, SongClock tick, scene/composer
  ├─ hooks/useBeatHintBridge   — manual T / ⇧T → SongClock
  ├─ hooks/useAnalyserCommandEvents — N, stats/fullscreen/stop-audio events
  └─ overlays/*                — latency HUD, stats, freq labels, audio prompt
        ↓
  scene.ts, composer.ts, BarTimingHud, view-cycle-controller
```

### Hard invariants

1. **One authoritative clock** — `SongClock` owns bar/beat index and `beatPhase` for visuals after sync.
2. **Manual taps anchor initially** — After `hintBeat` / `⇧T`, misaligned audio must not skip beats; aligned audio may nudge phase and release to auto after 8 matches.
3. **No wall-clock BPM phase in scene** — `scene.ts` uses `audio.beatPhase` from SongClock injection, not `time * (bpm/60)`.
4. **View cycle on phrase** — Switch views on `phraseJustStarted && totalBeats > 16` (4 bars), not every bar.
5. **Render loop TDZ** — In `hooks/useAnalyserEngine.ts`, declare `displayedView` and related state before any derived keys that reference them.

### Common pitfalls

| Mistake                                       | Symptom                        | Fix                                                    |
| --------------------------------------------- | ------------------------------ | ------------------------------------------------------ |
| Calling removed `setBarTiming` in render loop | Runtime crash                  | Use `setLiveTempoFrame()` only                         |
| Driving grid from `bands.beat`                | Double/skipped beats after tap | Route through `SongClock.tick()`                       |
| BPM phase only in 250ms analysis              | Choppy HUD dots                | Phase in `BPMDetector.tick()` every frame              |
| `epochMs === 0` as “unset”                    | Manual sync fails at t=0       | Use `epochSet` flag in SongClock                       |
| Measuring signal latency every frame          | HUD shows tens of seconds      | Only on `signalSwing` frames; see `latency-metrics.ts` |
| Tests beside modules                          | Vitest won't find them         | Put under `__tests__/`                                 |
| Duplicating preset cursor logic               | Shortcuts/panel drift          | Use `hooks/usePresetActions`                           |
| Duplicating BPM HUD markup                    | Overlay/panel mismatch         | Use `TempoReadout` + `theme.bpmGlowStyle`              |
| Reordering `RETRO_SYSTEMS`                    | Wrong machine emulated         | Order = shader mode index; append only                 |
| Raw writes to `fxPipelineOrder`               | Broken pass chain from saves   | Route through `normalizeFxPipelineOrder`               |
| New FX row without lock/pipeline entries      | Randomize pin / order gaps     | Extend `FX_RANDOMIZE_GROUPS` + `FX_PIPELINE`           |

## Key files

| Area                   | Path                                                             |
| ---------------------- | ---------------------------------------------------------------- |
| Orchestrator           | `src/components/analyser/Analyser.tsx`                           |
| Render loop            | `src/components/analyser/hooks/useAnalyserEngine.ts`             |
| Beat taps              | `src/components/analyser/hooks/useBeatHintBridge.ts`             |
| Overlay commands       | `src/components/analyser/hooks/useAnalyserCommandEvents.ts`      |
| Preset workflow        | `src/components/analyser/hooks/usePresetActions.ts`              |
| Settings UI shell      | `src/components/analyser/ControlPanel.tsx`                       |
| Per-view settings      | `src/components/analyser/control-panel/ViewSettings.tsx`         |
| Panel primitives       | `src/components/analyser/control-panel/primitives.tsx`           |
| BPM readout            | `src/components/analyser/TempoReadout.tsx`                       |
| Design tokens          | `src/components/analyser/theme.ts`                               |
| Song clock             | `packages/engine/src/song-clock.ts`                   |
| Bar types alias        | `packages/engine/src/bar-clock.ts`                    |
| BPM estimate           | `packages/engine/src/bpm-detector.ts`                 |
| Onsets                 | `packages/engine/src/beat-matcher.ts`                 |
| Audio read             | `packages/engine/src/audio.ts`                        |
| Scene / views          | `packages/engine/src/scene.ts`                        |
| Post-FX / quality tiers| `packages/engine/src/composer.ts`                     |
| Post-FX shaders        | `packages/engine/src/shaders.ts`                      |
| Retro font atlas       | `packages/engine/src/retro-font.ts`                   |
| Draggable overlays     | `src/components/analyser/hooks/useDraggablePanel.ts`             |
| Loudness curve         | `packages/engine/src/loudness.ts`                     |
| Dynamic Mode drift     | `packages/engine/src/evolution.ts`                    |
| View cycle             | `packages/engine/src/view-cycle-controller.ts`        |
| Visual registry        | `packages/engine/src/visuals.ts`                             |
| HUD                    | `src/components/analyser/BarTimingHud.tsx`                       |
| Live tempo bus         | `packages/engine/src/live-tempo.ts`                   |
| Latency metrics        | `packages/engine/src/latency-metrics.ts`              |
| Shortcuts              | `src/components/analyser/Shortcuts.tsx`                          |
| MIDI control           | `packages/engine/src/midi.ts` + `src/components/analyser/hooks/useMidiControl.ts` |
| Settings schema        | `packages/engine/src/settings.ts`                                |
| Settings store         | `src/components/analyser/store.ts`                               |
| UI primitives (shadcn) | `src/components/ui/` — `label`, `sheet`, `slider`, `switch` only |

## Tests

```bash
npm run test:run    # must pass before PR
npm run build
npm run check       # typecheck + lint + test
```

**Layout:** all tests live in `__tests__/` folders:

- `src/components/analyser/__tests__/` — UI, store, shortcuts, regression
- `packages/engine/src/__tests__/` — engine units + sync invariants

**Critical suites:**

- `sync-invariants.test.ts` — manual lock, phrase cycle, phase routing
- `Analyser.regression.test.ts` — render-loop initialization order (`useAnalyserEngine`)
- `ControlPanel.regression.test.ts` — ViewSettings delegation + per-view keys
- `usePresetActions.test.ts` — preset cursor helpers + store integration
- `song-clock.test.ts` — tap/auto modes, beat math, stale-tap re-acquisition
- `latency-metrics.test.ts` — signal latency must not grow from stale timestamps
- `bpm-detector.realistic.test.ts` — must lock on realistic (jittered, layered) music, not just pulse trains
- `bpm-detector.test.ts` — lock/unlock/octave-correction, silence confidence decay
- `loudness.test.ts` — shared amplitude curve all views route through
- `evolution.test.ts` — Dynamic Mode drift stays bounded, phrase/wall-clock waypoints, wobble
- `composer.test.ts` — auto quality-tier thresholds and hysteresis
- `settings.test.ts` — schema integrity: FX groups/pipeline reference real keys, retro system order pinned, presets valid
- `retro-font.test.ts` — glyph ramp monotonicity + atlas orientation (ZX ROM bitmaps)
- `BarTimingHud.test.tsx` — BPM lock indicator states

Shared harness: `packages/engine/src/__tests__/helpers/song-clock.harness.ts`

Vitest config includes both `src/**/__tests__/**` and `packages/*/src/**/__tests__/**`.

## Shortcuts (user-facing)

| Key                | Action                                        |
| ------------------ | --------------------------------------------- |
| `T`                | Beat tap (manual sync)                        |
| `⇧T`               | Downbeat / phrase reset                       |
| `M`                | Toggle BPM & bar grid HUD                     |
| `L`                | Latency HUD                                   |
| `G`                | Hide/show shortcut bar                        |
| `C`                | Toggle music-reactive view cycle               |
| `N`                | Stats panel                                   |
| `R` `←/B` `→/V`    | Randomize / prev / next visual (arrows primary, letters kept as aliases) |
| `[` `⇧←` / `]` `⇧→` | Prev / next save (bracket primary, shift-arrow alias) |
| `S`                | Settings panel                                |

Keyboard handlers and the bottom shortcut bar must stay in sync — see `Shortcuts.tsx` utility cluster.

## Making changes safely

### Sync / timing

1. Change `song-clock.ts` logic
2. Update `sync-invariants.test.ts` and `song-clock.test.ts`
3. Verify `useAnalyserEngine.ts` still injects `beatPhase` / `clockBpm` into `bandsForScene`
4. Do not reintroduce parallel `BarClock` advancement from raw beats

### New settings

1. `Settings` + `DEFAULT_SETTINGS` in `store.ts`
2. Pass through `useAnalyserEngine.ts` → `Scene.update()` opts
3. `ControlPanel.tsx` flyout and/or `control-panel/ViewSettings.tsx` if user-facing
4. Test in `__tests__/store.*.test.ts` and extend `ControlPanel.regression.test.ts` when per-view

### New shortcut

1. Keyboard handler in `Shortcuts.tsx` `onKey` (via `actionsRef`)
2. Button in the appropriate rail cluster (utility row for HUD/sync tools)
3. `Shortcuts.test.tsx` — key binding + bar button if user-facing

### New post-FX pass

1. Shader in `shaders.ts`; pass wired in `composer.ts` (constructor, `movablePassById`, `apply`)
2. Settings keys + entries in `FX_PIPELINE` and `FX_RANDOMIZE_GROUPS` (`settings.ts`)
3. Panel: `ToggleRow` with `lockId` inside the right `FxSection`, plus `FX_PASS_ENABLED_FLAGS` in `ControlPanel.tsx`
4. `packages/engine/src/__tests__/settings.test.ts` guards will fail on missing/typo'd keys

### New visual

1. Manifest in `visuals.ts` or `visuals/*.visual.ts`
2. `build*` / `update*` in `scene.ts`
3. Registry drives shortcuts — update `Shortcuts.test.tsx` if rail changes
4. Add view block in `control-panel/ViewSettings.tsx`

### Preset save/load

1. Use `hooks/usePresetActions` from Shortcuts and ControlPanel — do not duplicate cursor logic
2. Extend `usePresetActions.test.ts` for new workflow rules

## Code style

- Minimal diff; match existing patterns
- TypeScript strict; `noUnusedLocals` / `noUnusedParameters` enabled
- Comments only for non-obvious timing/math
- Do not commit unless user asks
- Do not edit `.cursor/plans/` plan files

## Equations quick reference

Beat period: \(T\_{\text{beat}} = 60000/\text{BPM}\)

Continuous beat index from epoch \((t_0, b_0)\):

\[
B(t) = (b*0 - 1) + \frac{t - t_0}{T*{\text{beat}}}
\]

Beat phase: \(\phi = B(t) \bmod 1\)

Phrase (16 beats): \(\text{beatInPhrase} = (\lfloor B \rfloor \bmod 16) + 1\)

See [docs/song-clock-and-sync.md](docs/song-clock-and-sync.md) for full derivations.
