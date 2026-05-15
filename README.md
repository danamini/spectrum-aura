# Spectrum Aura

Spectrum Aura is a dynamic, real-time visual analyser that turns live sound into motion, light, depth, and rhythm directly in your browser.

No installs for viewers. No backend. No upload flow. Open the page, feed it audio, and the scene responds instantly.

Spectrum Aura is designed for use on desktop browsers, and can visualise audio from any Chromium based browser or your device microphone. It is not designed for mobile browsers but may work, but only using your phone microphone.

It is not designed to be used for any formal audio analysis, it's intended purely for fun and to create an exciting visual treat, working best with music, like Spotify or YouTube in your browser.

## Live Demo

- GitHub Pages: [https://danamini.github.io/spectrum-aura/](https://danamini.github.io/spectrum-aura/)

Depending on your hardware you may need to tune performance via the options in settings.

## A Quick Summary

- Browser-native real-time rendering with animated 3D scenes and post-processing.
- Designed for live sessions: quick mode switching, keyboard-first controls, and preset slots.
- Multiple visual personalities in one app: Combo, Classic, Ripple, Cyberpunk Data-Stream, Ethereal Nebula, Brutalist Monolith, Symmetric Mandala, Audio-Reactive Terrain, Obsidian Shard, Hyper-Torus Accelerator, Brutalist Sound-Wall, and Floating Geometry Nebula.
- Beat-aware motion and camera behavior that reacts to energy, not just raw levels.
- Works with microphone input or shared tab/system audio.

## Screenshots

<table>
	<tr>
		<td><img src="docs/screenshots/spectrum-aura-hero.png" alt="Spectrum Aura landing and input picker" width="100%" /></td>
		<td><img src="docs/screenshots/spectrum-aura-stats-fullpage.png" alt="Spectrum Aura full-page nerd stats overlay" width="100%" /></td>
	</tr>
	<tr>
		<td><img src="docs/screenshots/spectrum-aura-classic.png" alt="Spectrum Aura classic view" width="100%" /></td>
		<td><img src="docs/screenshots/spectrum-auro-ripples.png" alt="Spectrum Aura ripple view" width="100%" /></td>
	</tr>
</table>

## Experience Highlights

### Input modes

- Use microphone for ambient or live room capture.
- Use tab/system audio for direct playback-reactive visuals.

For shared tab/system audio in Chrome:

- Select a browser tab when prompted.
- Enable **Share tab audio**.

### Visual engines

- Combo: radial bars, reactive sphere, particles, BPM-driven energy.
- Classic: horizontal LED/bar analyzer with peak hold behavior.
- Ripple: ring-wave field with configurable band columns.
- Data-Stream: neon point-cloud terrain reacting to bass/high bins.
- Nebula: pulsing volumetric shader sphere with fresnel aura.
- Monolith: 32x32 instanced cube grid with peak-following spotlight.
- Mandala: 12 audio-reactive radial ribbons with bloom/glitch surges.
- Terrain: wireframe waterfall displacement grid over spectrum history.

### Live controls

- `R` randomize look
- `V` toggle visual mode
- `C` toggle preset cycling
- `F` toggle fullscreen
- `G` show/hide hint bar
- `1-5` load preset slot
- `Shift + 1-5` save slot
- `N` toggle stats panel
- `Shift + N` fullscreen stats panel

Control panel additions:

- Global `Wireframe` toggle in the View section that maps to the active view's wireframe setting (where supported).
- `Post FX pipeline` master toggle in Post FX that bypasses all post-processing without changing individual effect settings.
- `Randomize view settings` toggle in Post FX that keeps randomize constrained to post FX unless you explicitly enable view geometry changes.
- `Monolith Brightness` slider in Monolith view settings for direct lighting/visibility control.

### Tunable signal + render pipeline

- FFT size, smoothing, gain, beat sensitivity
- Camera drift and beat response controls
- Post FX controls: bloom, chroma, grain, vignette, DOF, glitch, god rays, grading
- Post FX master pipeline bypass toggle
- View-specific wireframe controls, plus a global wireframe toggle bound to the current view
- Dedicated monolith brightness control

## Presets

- Built-in presets for fast scene changes.
- First-time users are seeded with five curated starter slots by default.
- Five user slots saved in local storage.
- Slot cycle mode for automated live rotation.

## Tech Stack (Lower-Level Details)

- React 19 + TypeScript
- Three.js + custom shader materials
- Vite 7
- Static SPA output (no backend services)

## Local Development

### Prerequisites

- Node.js 20+
- npm 10+

### Install + run

```bash
npm install
npm run dev
```

Default local URL:

- http://localhost:5173

The dev server supports hot module reloading for rapid iteration.

### Build + preview

```bash
npm run build
npm run preview
```

### Quality checks

```bash
npm run lint        # ESLint validation
npm run format      # Prettier formatting
npm run test:run    # Vitest (single run)
npm run test        # Vitest (watch mode)
npm run check       # All checks (lint + format + test + build)
```

### Testing conventions

- Keep tests beside the code they validate (for example `store.*.test.ts` near `store.ts`, engine unit tests in `engine/`).
- Prefer focused suites over one large test file: split by concern such as normalization, slots, and randomization.
- Use deterministic tests for stateful logic (`vi.resetModules()`, stable `localStorage` mocks, controlled random values).
- Test behavior through public APIs instead of implementation details.
- For every new settings field, add both default-state coverage and at least one behavior test.

### Project Layout

- `src/App.tsx`: Single-page shell
- `src/main.tsx`: Browser entry point
- `src/components/analyser/`: UI and interaction layer
  - `store.ts`: Settings state management
	- `store.normalization.test.ts`: Settings guardrails and normalization rules
	- `store.randomize.test.ts`: Randomize scope and tuning behavior
	- `store.slots.test.ts`: Slot persistence and compatibility
	- `test-helpers.ts`: Shared test fixtures
  - `Analyser.tsx`: Canvas orchestration
  - `ControlPanel.tsx`: Settings UI
	- `engine/`: Audio analysis, 3D scene, post-processing, engine unit tests
- `docs/`: Technical documentation
- `docs/DEVELOPMENT.md`: Architecture and contribution guide

## Deploy

Build static assets and publish `dist/` to any static host:

```bash
npm run build
```

## Signal Processing Deep Dive

Detailed notes on FFT, bass energy extraction, beat detection, and BPM estimation:

- [FFT and beat detection doc](docs/fft-and-beat-detection.md)
