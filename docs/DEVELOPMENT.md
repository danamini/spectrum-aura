# Spectrum Aura Development Guide

This guide covers the architecture, key concepts, and development workflows for Spectrum Aura.

## Project Structure

```
src/
├── App.tsx
├── main.tsx
├── components/
│   └── analyser/
│       ├── Analyser.tsx              # Thin orchestrator (overlays + hook wiring)
│       ├── BarTimingHud.tsx          # BPM / bar grid overlay (M toggle)
│       ├── TempoReadout.tsx          # Shared BPM + grid (overlay + panel)
│       ├── theme.ts                  # Colors, swatches, bpmGlowStyle, LOCAL_DEV_URL
│       ├── ControlPanel.tsx          # Settings sheet + flyout tabs
│       ├── control-panel/
│       │   ├── primitives.tsx        # Sw, Bn, Row, ToggleRow, S
│       │   └── ViewSettings.tsx      # Per-view slider/toggle blocks (14 views)
│       ├── hooks/
│       │   ├── useAnalyserEngine.ts  # rAF/XR loop, audio, SongClock, scene
│       │   ├── useBeatHintBridge.ts  # T / ⇧T manual sync bridge
│       │   ├── useAnalyserCommandEvents.ts
│       │   └── usePresetActions.ts   # Shared preset load/save/cursor
│       ├── overlays/
│       │   ├── AudioSourcePrompt.tsx
│       │   ├── FreqLabels.tsx
│       │   ├── LatencyHud.tsx
│       │   ├── StatsPanel.tsx
│       │   └── stats-types.ts
│       ├── Shortcuts.tsx
│       ├── store.ts
│       ├── visuals.ts
│       ├── visuals/                  # Optional *.visual.ts manifests
│       ├── __tests__/                # Component + store + UI tests
│       │   ├── helpers/test-helpers.ts
│       │   ├── Analyser.regression.test.ts
│       │   ├── ControlPanel.regression.test.ts
│       │   ├── usePresetActions.test.ts
│       │   ├── theme.test.ts
│       │   ├── Shortcuts.test.tsx
│       │   └── store.*.test.ts
│       └── engine/
│           ├── audio.ts              # FFT read, BeatMatcher, BPMDetector feed
│           ├── beat-matcher.ts         # Multi-band onset detection
│           ├── bpm-detector.ts       # Tempo estimation (not grid owner)
│           ├── song-clock.ts         # Authoritative bar/beat clock
│           ├── bar-clock.ts          # BarTiming types + SongClock re-export
│           ├── live-tempo.ts         # Per-frame HUD bus
│           ├── latency-metrics.ts    # Render latency measurement (tested)
│           ├── view-cycle-controller.ts
│           ├── loudness.ts           # Shared perceptual-loudness gamma curve (all views)
│           ├── evolution.ts          # Dynamic Mode drift engine
│           ├── scene.ts
│           ├── composer.ts           # Post-FX chain + auto quality tiers
│           ├── shaders.ts
│           └── __tests__/            # Engine unit + sync invariant tests
│               ├── helpers/song-clock.harness.ts
│               ├── song-clock.test.ts
│               ├── sync-invariants.test.ts
│               └── …
│   └── ui/                           # label, sheet, slider, switch only
AGENTS.md                             # Agent guide (Cursor / Claude)
docs/
├── README.md                         # Documentation index
├── audio-analysis-pipeline.md
├── song-clock-and-sync.md
├── rendering-and-latency.md
├── fft-and-beat-detection.md         # Short overview (links to above)
└── screenshots/
```

## Architecture Overview

### Audio and Sync Pipeline

1. **Capture** (`engine/audio.ts`) — mic or tab → `AnalyserNode` (default FFT 2048)
2. **Features** — bass / mid / high / centroid each frame
3. **BeatMatcher** — fused onset detection for accents and signal-change timing
4. **BPMDetector** — tempo estimate + confidence (feeds SongClock, does not own grid after manual tap)
5. **SongClock** (`engine/song-clock.ts`) — authoritative bar grid, `beatPhase`, phrase boundaries
6. **Consumers** — `scene.ts`, post-FX, `BarTimingHud`, `view-cycle-controller`

Deep dive: [audio-analysis-pipeline.md](./audio-analysis-pipeline.md), [song-clock-and-sync.md](./song-clock-and-sync.md), [rendering-and-latency.md](./rendering-and-latency.md).

### Visualization Architecture

**Three.js Scene** (`engine/scene.ts`):

- **15 visualization modes**: combo, classic, ripple, datastream, nebula, monolith, mandala, terrain, obsidian, torus, soundwall, geometrynebula, reztube (On-rails Tube), assetflow, stagelights
- **InstancedMesh**: Used for efficient bar/block rendering (bars, classic, monolith)
- **ShaderMaterial**: Custom shaders for effects (datastream, nebula, terrain)
- **Post-processing**: Bloom, chromatic aberration, glitch, god rays, lens flare, etc. via Composer
- **Fat lines**: `Line2`/`LineGeometry`/`LineMaterial` (mandala ribbons) and `LineSegments2`/`LineSegmentsGeometry`/`LineMaterial` (On-rails Tube) from `three/examples/jsm/lines/` for screen-space pixel-width lines that respect `linewidth` in WebGL

**Each View Has**:

- `buildXXX(size)`: Initialize geometry/materials
- `updateXXX(dt, audio, opts)`: Per-frame animation driven by audio + settings

### Settings & State (`store.ts`)

- **Settings**: 40+ properties controlling every aspect
- **Presets**: built-in curated looks plus a dynamic local save list
- **Normalization**: Enforces limits on amplitude, vignette, bloom
- **Randomization**: Smart background picker using WCAG contrast scoring

Recent controls:

- `postFxEnabled`: Master switch that bypasses the post-processing pipeline at render time.
- Global Wireframe control in the View panel: writes to the active view-specific wireframe setting.
- `randomizeViewSettings`: Keeps randomize constrained to post FX by default; when enabled it also touches view-specific geometry and palette controls.
- `lensFlare` / `lensFlareAmount`: Anamorphic horizontal streak + coloured lens-ghost reflections layered after god rays in the composer chain. Enabled 45% of the time by randomize.
- `monolithBrightness`: Dedicated lighting/visibility control for Monolith independent of amplitude.
- `reztubeLineWidth`: Line thickness in screen-space pixels for the On-rails Tube view (0.5–6 px). Rendered via `LineSegments2` + `LineMaterial` (`worldUnits: false`) so the width is invariant to camera distance. The visual's display label was updated to "On-rails Tube"; the internal `id` stays `reztube` to preserve saved settings.
- `assetflowMovement`: Global motion intensity multiplier for Asset-Flow model pathing, bounce, and spin.
- `assetflowBackgroundDrift`: Speed/intensity control for Asset-Flow's layered 2D background drift.
- `assetflowSpriteAmount`: Controls layered 2D background presence/intensity in Asset-Flow.
- Asset-Flow actor motion is intentionally biased toward vertical movement with smoothed horizontal follow to prevent visual left/right flicker.
- **Stage Lights** view: a row of overhead spotlight beams (LOW/MID/HIGH-aligned by position, `stagelightsFixtureCount` 3/5/7) sweeping and fanning out on strong beats, plus an optional `stagelightsLasers` fan of thin upward beams from a downstage projector. Per-fixture tuning (sweep speed/phase/amplitude/width/color) is a continuous blend across the LOW/MID/HIGH anchors by each fixture's position (`stagelightsTent3` in `scene.ts`) rather than a fixed 3-way lookup, so extra fixtures land *between* bands instead of repeating them.
- `kaleidoscope` / `kaleidoscopeSides` / `kaleidoscopeAngle`: mirrored radial wedge post-FX pass.
- `mirrorFx` / `mirrorMode` / `mirrorOffset`: directional mirror post-FX pass.
- `crtFx` / `crtScanlineIntensity` / `crtCurvature` / `crtVignette`: retro CRT post-FX pass.
- `projectorFilmFx` / `projectorFilmAmount` / `projectorFilmJitter` / `projectorFilmFlicker`: random film projector artifact pass.
- `glitchIntensity`: duty-cycle fraction (0-1) of each ~1 s window the Glitch pass actually renders — three.js's GlitchPass has no continuous intensity knob.
- `evolveEnabled` / `evolveAmount`: "Dynamic Mode" — a curated 1-3 settings per view drift slowly over musical phrases (wall-clock fallback when unsynced), bounded around the user's own values (`engine/evolution.ts`).
- ControlPanel additions: dedicated **Saves** tab (list with focus/load/overwrite/delete via `usePresetActions`), Dynamic Mode toggle, an amber warning banner in the Post FX tab when Performance Mode is bypassing the pipeline, retro/novelty FX grouped under a collapsed `Disclosure`, and a phone-first layout via `useIsMobile()` (full-width sheet, bottom tab bar, full-screen flyout).

**Key Settings Limits**:

- Amplitude floor: 0.5 (MIN_VIEW_AMPLITUDE)
- Vignette amount: [0.5, 1.25]
- Bloom strength: ≤ 0.25 (unless bloomExtreme)
- Asset-Flow movement intensity: [0.35, 1.8]
- Stage Lights sweep speed: [0.2, 3]; fixture count snaps to 3/5/7

## Shortcut Map

Current keyboard shortcuts are defined in `Shortcuts.tsx` and mirrored by the bottom shortcut bar:

- `R`: Randomize
- `←` / `→`: Prev / Next Visual (`B` / `V` kept as aliases)
- `[` / `]` or `Shift+←` / `Shift+→`: Prev / Next Save
- `X`: Audio Source (stops the current audio engine so a new source can be selected)
- `F`: Toggle fullscreen
- `N`: Toggle Stats panel
- `G`: Show/Hide shortcut hints
- `A`: Play Saves (save-list auto-cycle mode)
- `S`: Toggle settings panel
- `T`: Beat tap (manual SongClock sync)
- `Shift+T`: Downbeat tap (reset phrase to 1/16)
- `M`: Toggle BPM & bar grid HUD
- `L`: Toggle latency HUD
- `C`: Toggle music-reactive view cycle (every 4-bar phrase)
- `1` to `5`: Load save slot
- `Shift+1` to `Shift+5`: Save to slot

Shortcut reliability note:

- Keyboard shortcut handlers in `Shortcuts.tsx` dispatch through a live `actionsRef` so keys like `R`/`B` always execute the latest callbacks and don't drift when React state changes.

Shortcut rail clusters:

- Visual cluster: view count, Prev Visual (B), Randomize, View Cycle (C), `inc`, `fx`, Next Visual (V)
- Save cluster: save count, Prev, Play Saves, Next, Random, Save, Delete
- Utility cluster: Audio Source (X), Fullscreen (F), Stats (N), Latency (L), BPM Grid (M), Beat Tap (T), Settings (S), Hide All (G)

When hidden (`G`), a **shortcuts · g** pill at the bottom restores the bar (or press `G` again).

Tooltip behavior:

- Shortcut buttons use a shared styled tooltip treatment rather than native browser `title` hovers.
- `inc` explains randomize scope: post FX only vs post FX + view settings.
- `fx` explains the post-processing master pipeline state.

Settings panel and flyout behavior:

- The `S` shortcut toggles the panel even when focus is inside a text input/slider control.
- Clicking the `S` shortcut button toggles open/close (no immediate re-open).
- Flyout tabs (`Audio`, `Scene`, `Post FX`) delay slightly on open and slide from the sheet edge.

## Common Tasks

### Adding a New Visualization Mode

1. Add a visual manifest to `src/components/analyser/visuals.ts` or a new `src/components/analyser/visuals/*.visual.ts` file.
2. Create `buildXXX()` and `updateXXX()` in `scene.ts` and bind the manifest `sceneGroupKey` to the owning `THREE.Group`.
3. Add settings in `store.ts` for customization, including the `...Fullscreen` or `...Wireframe` keys referenced by the manifest when needed.
4. Add per-view controls in `control-panel/ViewSettings.tsx`. Shell layout and flyout tabs stay in `ControlPanel.tsx`. View labels, cycle order, and fullscreen wiring come from the visual registry automatically.
5. Verify the shortcut rail still reads correctly: current label, `3D/2D` state, and visual cycling all depend on the registry metadata.

Runtime registry notes:

- `src/components/analyser/visuals.ts` is the canonical visual registry used by the control panel, shortcuts, and XR view cycle.
- Any `src/components/analyser/visuals/*.visual.ts` module exporting `visual` or a default object with an `id` is loaded at startup via `import.meta.glob(..., { eager: true })`.
- Runtime manifests can override labels, settings labels, fullscreen keys, wireframe keys, scene group keys, and order without re-editing the UI lists.
- Rendering logic still lives in `scene.ts`, so new runtime-picked visuals need a matching scene group and update branch before they can draw.
- Review rule: if a visual manifest changes label/order/fullscreen metadata, check `Shortcuts.tsx`, XR cycle behavior, and the View section in `ControlPanel.tsx` together.

### Modifying Audio Features

1. Edit feature extraction in `engine/audio.ts`
2. Update `AudioBands` type if adding new properties
3. Connect to visualization in `scene.ts` update methods
4. Expose via settings in `store.ts` if user-tunable

### Adding UI Controls

1. Create slider in `control-panel/ViewSettings.tsx` or a flyout tab in `ControlPanel.tsx` using `<S>` from `control-panel/primitives`
2. Bind to store setting: `set({ settingName: value })`
3. Ensure setting has entry in `DEFAULT_SETTINGS` in `store.ts`
4. Test in dev mode with `npm run dev`

Notes for mapped/global controls:

- For global controls that map to view-specific settings (for example wireframe), keep UI mapping logic in `ControlPanel.tsx` and preserve underlying per-view keys in `Settings`.
- For master bypass toggles (for example post FX), apply the bypass in `hooks/useAnalyserEngine.ts` render flow so individual effect settings remain unchanged.

## Testing

### Run Tests

```bash
npm run test:run               # Single run
npm run test                   # Watch mode
```

### Test layout

All tests live under `__tests__/` (see `vitest.config.ts`):

| Location                     | Suites                                                                                                                                 |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `analyser/__tests__/`        | `Analyser.regression`, `ControlPanel.regression`, `usePresetActions`, `theme`, `Shortcuts`, `store.*`, `visuals`, `BarTimingHud`      |
| `analyser/engine/__tests__/` | `song-clock`, `sync-invariants`, `bpm-detector`, `bpm-detector.realistic`, `beat-matcher`, `latency-metrics`, `view-cycle-controller`, `latency-benchmark`, `loudness`, `evolution`, `composer`, `xr` |

Shared fixtures: `__tests__/helpers/test-helpers.ts`, `engine/__tests__/helpers/song-clock.harness.ts`.

### Test coverage highlights

- **sync-invariants.test.ts** — manual anchor, misaligned audio drift guard, manual→auto release, phrase view cycle
- **Analyser.regression.test.ts** — render-loop TDZ guard (`useAnalyserEngine`)
- **ControlPanel.regression.test.ts** — ViewSettings delegation, per-view keys, theme swatches
- **usePresetActions.test.ts** — wrap/random helpers, slot cursor rules
- **song-clock.test.ts** — tap/auto modes, beat index math
- **store.\*** — normalization, slots, randomize
- **Shortcuts.test.tsx** — rail UI and keyboard behavior
- **latency-metrics.test.ts** — signal latency only on transient frames; no stale timestamp growth

Asset documentation:

- Keep `docs/THIRD_PARTY_ASSETS.md` in sync whenever adding/removing runtime files under `public/assets/`.
- Validate third-party model URLs and licenses before wiring new `model-xx.glb` paths in `scene.ts`.

### Adding Tests

1. Place new files under `src/**/__tests__/` (not beside source modules)
2. Import implementation with relative paths (`../store`, `../song-clock`, etc.)
3. Use `vi.resetModules()` and a localStorage mock for deterministic store tests
4. Test behavior through public APIs (`settingsStore`, `SongClock`, `BPMDetector`)
5. For sync changes, extend `sync-invariants.test.ts` and `song-clock.test.ts`

Example:

```typescript
it("enforces constraint X", async () => {
  const { settingsStore } = await import("./store");
  settingsStore.set({ myValue: 999 });
  const state = settingsStore.get();
  expect(state.myValue).toBeLessThanOrEqual(LIMIT);
});
```

## Build & Deploy

### Development

```bash
npm install                    # Install deps
npm run dev                    # Start Vite dev server (localhost:6789)
```

### Debug in Cursor / VS Code

Use **Run and Debug → Launch Chrome (Spectrum Aura)** (`.vscode/launch.json`). This starts Vite and opens Chrome at `http://localhost:6789` with source maps.

Do not use Cursor's Simple Browser or a LAN IP URL for audio work — `getUserMedia` / `getDisplayMedia` need a secure context (`localhost` or HTTPS).

### Production Build

```bash
npm run build                  # Builds to dist/
npm run preview               # Preview production build locally
```

### Performance Notes

- Large FFT size (4096) = better frequency resolution but higher latency
- Instanced meshes (bars/monolith) render efficiently with 1000+ objects
- Post-FX (bloom) can be expensive; tune `bloomStrength` and `bloomRadius`
- Point clouds (datastream) limited to ~30k points for 60fps on typical hardware

## Code Style

- **TypeScript**: Strict mode, full type coverage
- **React**: Functional components, hooks (useSyncExternalStore for store)
- **Three.js**: Use `THREE.` namespace prefix consistently
- **Shaders**: Documented with `/* glsl */` comment, uniform names prefixed `u`
- **Settings**: Always add to `DEFAULT_SETTINGS` and set sane limits

## Repository conventions

- Keep documentation inside `docs/` unless it is a top-level product artifact (`README.md`, `AGENTS.md`, license, tooling config).
- Keep tests in `__tests__/` folders; Vitest only includes `src/**/__tests__/**/*.{test,spec}.{ts,tsx}`.
- Agents: read [AGENTS.md](../AGENTS.md) before changing sync or render-loop code.
- Prefer concern-specific test files (`store.normalization.test.ts`, `store.slots.test.ts`) over catch-all files.
- When adding a new setting, update all required layers in one change set:
  1. `Settings` type + `DEFAULT_SETTINGS` in `store.ts`
  2. pass-through in `hooks/useAnalyserEngine.ts` and `Scene.update()` options
  3. controls in `control-panel/ViewSettings.tsx` or `ControlPanel.tsx` flyouts (if user-facing)
  4. at least one targeted test
- When changing shortcut-bar behavior, update all three together:
  1. keyboard handling + rail UI in `Shortcuts.tsx`
  2. tooltip copy / active-state affordances in the same file
  3. `Shortcuts.test.tsx` expectations

## Known Limitations

- **Mobile**: Not optimized for touch, works best on desktop
- **Audio**: Requires user gesture (click) to start, due to browser autoplay policy
- **Cross-origin**: Tab audio capture only works on same-origin (security)
- **Browsers**: WebGL 2 required (most modern browsers)

## Debugging Tips

1. **Enable stats panel**: Press `N` for live FPS/draw calls/memory
2. **Visual debug**: Add `console.log()` in `scene.update()` to inspect audio values
3. **Settings debug**: Store uses localStorage; inspect via DevTools `Application > Storage > Local Storage`
4. **Shader errors**: Check browser console for THREE.WebGLProgram validation errors
5. **Performance**: Use DevTools Performance tab, look for GPU bottleneck vs CPU

Render-loop safety note:

- In `hooks/useAnalyserEngine.ts`, initialize render-loop state variables before deriving values from them. A prior TDZ bug (`Cannot access 'displayedView' before initialization`) occurred when a composer reset key was built before `displayedView` was declared.

## Contributing

- Keep changes scoped (one feature per PR)
- Update relevant tests when adding features
- Verify build passes: `npm run build`
- All tests must pass: `npm run test:run`
