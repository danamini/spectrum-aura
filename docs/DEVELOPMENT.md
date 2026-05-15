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
│       ├── Shortcuts.tsx           # Keyboard handler + view switching
│       ├── store.ts                # Settings state, presets, slots
│       ├── store.normalization.test.ts
│       ├── store.randomize.test.ts
│       ├── store.slots.test.ts
│       ├── test-helpers.ts         # Shared test fixtures
│       └── engine/
│           ├── scene.ts            # Three.js scene, 12 visualization modes
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
- **12 visualization modes**: combo, classic, ripple, datastream, nebula, monolith, mandala, terrain, obsidian, torus, soundwall, geometrynebula
- **InstancedMesh**: Used for efficient bar/block rendering (bars, classic, monolith)
- **ShaderMaterial**: Custom shaders for effects (datastream, nebula, terrain)
- **Post-processing**: Bloom, chromatic aberration, glitch, god rays, etc. via Composer

**Each View Has**:
- `buildXXX(size)`: Initialize geometry/materials
- `updateXXX(dt, audio, opts)`: Per-frame animation driven by audio + settings

### Settings & State (`store.ts`)

- **Settings**: 40+ properties controlling every aspect
- **Presets**: 5 curated look + 5 user slots (localStorage)
- **Normalization**: Enforces limits on amplitude, vignette, bloom
- **Randomization**: Smart background picker using WCAG contrast scoring

Recent controls:
- `postFxEnabled`: Master switch that bypasses the post-processing pipeline at render time.
- Global Wireframe control in the View panel: writes to the active view-specific wireframe setting.
- `randomizeViewSettings`: Keeps randomize constrained to post FX by default; when enabled it also touches view-specific geometry and palette controls.
- `monolithBrightness`: Dedicated lighting/visibility control for Monolith independent of amplitude.

**Key Settings Limits**:
- Amplitude floor: 0.5 (MIN_VIEW_AMPLITUDE)
- Vignette amount: [0.5, 1.25]
- Bloom strength: ≤ 0.25 (unless bloomExtreme)

## Shortcut Map

Current keyboard shortcuts are defined in `Shortcuts.tsx` and mirrored by the bottom shortcut bar:

- `R`: Randomize
- `V`: Cycle Visual
- `X`: Source (stops current audio engine)
- `F`: Toggle fullscreen
- `N`: Toggle Stats panel
- `G`: Show/Hide shortcut hints
- `A`: Auto Cycle Saves (slot auto-cycle mode)
- `S`: Toggle settings panel
- `1` to `5`: Load save slot
- `Shift+1` to `Shift+5`: Save to slot

Settings panel and flyout behavior:
- The `S` shortcut toggles the panel even when focus is inside a text input/slider control.
- Clicking the `S` shortcut button toggles open/close (no immediate re-open).
- Flyout tabs (`Audio`, `Scene`, `Post FX`) delay slightly on open and slide from the sheet edge.

## Common Tasks

### Adding a New Visualization Mode

1. Add to `ViewMode` type in `store.ts`
2. Create `buildXXX()` and `updateXXX()` in `scene.ts`
3. Add settings in `store.ts` for customization
4. Add UI controls in `ControlPanel.tsx`
5. Update shortcut view cycle in `Shortcuts.tsx`

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
  - `store.randomize.test.ts`: randomize scope toggle behavior and new torus/geometry-nebula defaults
- **Shortcut tests**:
  - `Shortcuts.test.tsx`: updated labels, `S` settings toggle event, `S` while input focused, `A` auto-cycle toggle
- **Engine tests**:
  - `engine/bpm-detector.test.ts`: tempo stability, bounded BPM output, reset behavior

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
