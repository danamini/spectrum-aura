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
│       ├── store.test.ts           # Settings & slot tests
│       └── engine/
│           ├── scene.ts            # Three.js scene, 8 visualization modes
│           ├── composer.ts         # Post-processing effects pipeline
│           ├── audio.ts            # Web Audio API wrapper, FFT, beat detection
│           ├── bpm-detector.ts     # BPM estimation from bass energy
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
- **8 visualization modes**: combo, classic, ripple, datastream, nebula, monolith, mandala, terrain
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

**Key Settings Limits**:
- Amplitude floor: 0.5 (MIN_VIEW_AMPLITUDE)
- Vignette amount: [0.5, 1.25]
- Bloom strength: ≤ 0.25 (unless bloomExtreme)

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

## Testing

### Run Tests

```bash
npm run test -- --run          # Single run
npm run test                   # Watch mode
```

### Test Coverage

- **Store tests** (`store.test.ts`):
  - Slot bootstrap and localStorage persistence
  - Settings normalization (amplitude floor, vignette clamp, bloom cap)
  - Randomization produces valid colors
  - Preset application and loading

- **Key functions tested**:
  - `normalizeSettings()` - validates all amplitude/vignette ranges
  - `randomize()` - produces contrast-safe background colors
  - `applyPreset()` - presets respect all constraints
  - `saveSlot()` / `loadSlot()` - persistence round-trips

### Adding Tests

1. Add to appropriate `describe()` block in `store.test.ts`
2. Use `settingsStore.get()` to read current state
3. Test side effects via settings validation
4. Keep tests isolated and deterministic

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

## Contributing

- Keep changes scoped (one feature per PR)
- Update relevant tests when adding features
- Verify build passes: `npm run build`
- All tests must pass: `npm run test -- --run`
