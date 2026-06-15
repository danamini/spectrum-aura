# Spectrum Aura Development Guide

This guide covers the architecture, key concepts, and development workflows for Spectrum Aura.

## Project Structure

```
src/
├── App.tsx                          # Root component
├── main.tsx                         # Entry point
├── components/
│   └── analyser/
│       ├── Analyser.tsx            # Main 3D canvas + controls orchestrator
│       ├── ControlPanel.tsx        # Settings UI (sliders, toggles, dropdowns)
│       ├── Shortcuts.tsx           # Keyboard handler + grouped shortcut rail
│       ├── store.ts                # Settings state, presets, save list
│       ├── visuals.ts              # Canonical visual registry
│       ├── visuals/                # Optional runtime visual manifests (*.visual.ts)
│       ├── store.normalization.test.ts
│       ├── store.randomize.test.ts
│       ├── store.slots.test.ts
│       ├── test-helpers.ts         # Shared test fixtures
│       └── engine/
│           ├── scene.ts            # Three.js scene, 14 visualization modes
│           ├── composer.ts         # Post-processing effects pipeline
│           ├── audio.ts            # Web Audio API wrapper, FFT, beat detection
│           ├── bpm-detector.ts     # BPM estimation from bass energy
│           ├── bpm-detector.test.ts
│           └── shaders.ts          # Reusable shader code snippets
│   └── ui/                         # Shadcn/ui component library
docs/
├── fft-and-beat-detection.md       # Audio analysis algorithm docs
└── screenshots/                    # Demo screenshots
```

## Architecture Overview

### Audio Pipeline

1. **Audio Capture** (`engine/audio.ts`)
   - Captures from microphone or browser tab
   - Feeds to Web Audio `AnalyserNode`
   - Default FFT size: 2048

2. **Feature Extraction**
   - Reads frequency bins each frame
   - Extracts bass, mid, high energy bands
   - Computes spectral centroid

3. **Beat/BPM Detection** (`engine/bpm-detector.ts`)
   - Analyzes bass energy history
   - Estimates BPM and confidence score
   - Signals to camera for beat-responsive motion

### Visualization Architecture

**Three.js Scene** (`engine/scene.ts`):
- **14 visualization modes**: combo, classic, ripple, datastream, nebula, monolith, mandala, terrain, obsidian, torus, soundwall, geometrynebula, reztube (On-rails Tube), assetflow
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
- `kaleidoscope` / `kaleidoscopeSides` / `kaleidoscopeAngle`: mirrored radial wedge post-FX pass.
- `mirrorFx` / `mirrorMode` / `mirrorOffset`: directional mirror post-FX pass.
- `crtFx` / `crtScanlineIntensity` / `crtCurvature` / `crtVignette`: retro CRT post-FX pass.
- `projectorFilmFx` / `projectorFilmAmount` / `projectorFilmJitter` / `projectorFilmFlicker`: random film projector artifact pass.

**Key Settings Limits**:
- Amplitude floor: 0.5 (MIN_VIEW_AMPLITUDE)
- Vignette amount: [0.5, 1.25]
- Bloom strength: ≤ 0.25 (unless bloomExtreme)
- Asset-Flow movement intensity: [0.35, 1.8]

## Shortcut Map

Current keyboard shortcuts are defined in `Shortcuts.tsx` and mirrored by the bottom shortcut bar:

- `R`: Randomize
- `B`: Prev Visual
- `V`: Next Visual
- `X`: Audio Source (stops the current audio engine so a new source can be selected)
- `F`: Toggle fullscreen
- `N`: Toggle Stats panel
- `G`: Show/Hide shortcut hints
- `A`: Play Saves (save-list auto-cycle mode)
- `S`: Toggle settings panel
- `1` to `5`: Load save slot
- `Shift+1` to `Shift+5`: Save to slot

Shortcut reliability note:
- Keyboard shortcut handlers in `Shortcuts.tsx` dispatch through a live `actionsRef` so keys like `R`/`B` always execute the latest callbacks and don't drift when React state changes.

Shortcut rail clusters:
- Visual cluster: view count, Prev Visual (B), Randomize, `inc`, `fx`, Next Visual (V)
- Save cluster: save count, Prev, Play Saves, Next, Random, Save, Delete
- Utility cluster: Audio Source, Fullscreen, Stats, Hide hints, Settings

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
4. Add UI controls in `ControlPanel.tsx` only for view-specific settings. View labels, cycle order, and fullscreen wiring now come from the visual registry automatically.
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

1. Create slider in `ControlPanel.tsx` using `<S>` component
2. Bind to store setting: `set({ settingName: value })`
3. Ensure setting has entry in `DEFAULT_SETTINGS` in `store.ts`
4. Test in dev mode with `npm run dev`

Notes for mapped/global controls:
- For global controls that map to view-specific settings (for example wireframe), keep UI mapping logic in `ControlPanel.tsx` and preserve underlying per-view keys in `Settings`.
- For master bypass toggles (for example post FX), apply the bypass in `Analyser.tsx` render flow so individual effect settings remain unchanged.

## Testing

### Run Tests

```bash
npm run test:run               # Single run
npm run test                   # Watch mode
```

### Test Coverage

- **Analyser regression tests**:
  - `Analyser.regression.test.ts`: guards render-loop variable initialization order to prevent TDZ crashes during component startup.
- **Store tests**:
  - `store.slots.test.ts`: slot bootstrap, localStorage hydration, legacy ripple migration, slot-cycle preservation
  - `store.normalization.test.ts`: amplitude floor, vignette bounds, bloom cap, preset clearing, reset baseline
  - `store.randomize.test.ts`: randomize scope toggle behavior, new defaults (torus, geometry-nebula, reztubeLineWidth), and lensFlare postFx coverage
- **Shortcut tests**:
  - `Shortcuts.test.tsx`: grouped rail labels, visual cluster status, randomize/post-FX toggles, save transport behavior, settings toggle behavior
- **Engine tests**:
  - `engine/bpm-detector.test.ts`: tempo stability, bounded BPM output, reset behavior

  Asset documentation:
  - Keep `docs/THIRD_PARTY_ASSETS.md` in sync whenever adding/removing runtime files under `public/assets/`.
  - Validate third-party model URLs and licenses before wiring new `model-xx.glb` paths in `scene.ts`.

### Adding Tests

1. Add tests beside the module under test (for example `store.*.test.ts` or `engine/*.test.ts`)
2. Use `vi.resetModules()` and a localStorage mock for deterministic store tests
3. Test behavior through public APIs (`settingsStore`, `BPMDetector`) instead of implementation details
4. Keep test files focused by concern (normalization, randomize, slots, engine units)

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
npm run dev                    # Start Vite dev server (localhost:5173)
```

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

- Keep documentation inside `docs/` unless it is a top-level product artifact (`README.md`, license, tooling config).
- Keep tests adjacent to implementation files with `*.test.ts` naming.
- Prefer concern-specific test files (`store.normalization.test.ts`, `store.slots.test.ts`) over catch-all files.
- When adding a new setting, update all required layers in one change set:
  1. `Settings` type + `DEFAULT_SETTINGS` in `store.ts`
  2. pass-through in `Analyser.tsx` and `Scene.update()` options
  3. controls in `ControlPanel.tsx` (if user-facing)
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
- In `Analyser.tsx`, initialize render-loop state variables before deriving values from them. A prior TDZ bug (`Cannot access 'displayedView' before initialization`) occurred when a composer reset key was built before `displayedView` was declared.

## Contributing

- Keep changes scoped (one feature per PR)
- Update relevant tests when adding features
- Verify build passes: `npm run build`
- All tests must pass: `npm run test:run`
