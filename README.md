# Spectrum Aura

Spectrum Aura is a real-time audio visualizer built with React, Three.js, and Vite.

It turns live audio into animated 3D scenes with post-processing effects, palette systems, beat-reactive camera behavior, and a rolling preset workflow for live sessions.

## Why It Feels Different

- Three visual engines in one app: Combo, Classic, and Ripple.
- Live mic or system/tab audio capture.
- BPM-aware motion in the Combo scene.
- Fast shader/post-FX iteration from a local control panel.
- Keyboard-first live control with load/save preset slots.

## Stack

- React 19 + TypeScript
- Three.js renderer and custom shader materials
- Vite 7
- Static SPA output, no backend required

## Quick Start

### Prerequisites

- Node.js 20+
- npm 10+
- A modern Chromium browser for system/tab audio sharing

### Install and run

```bash
npm install
npm run dev
```

Dev server runs on a single browser page at:

- http://localhost:6789

## Build and Preview

```bash
npm run build
npm run preview
```

## Lint and Format

```bash
npm run lint
npm run format
```

## Audio Input Modes

Inside the app, use the floating controls to start one of these input modes:

- Mic input: accesses your microphone.
- System/tab audio: uses screen-share audio capture.

Important for system/tab audio:

- In Chrome, choose a browser tab and enable Share tab audio.
- If no audio track is shared, the app will show an explicit error.

## Live Controls

### Keyboard shortcuts

- R: randomize current look
- V: cycle visual mode
- C: toggle preset slot cycle mode
- F: toggle fullscreen
- G: show/hide shortcut hint bar
- 1-5: load slot
- Shift + 1-5: save slot
- N: toggle nerd stats panel
- Shift + N: fullscreen nerd stats panel

### Visual modes

- Combo: radial bars + reactive sphere + particles with BPM-synced motion.
- Classic: horizontal LED/bar style analyzer with peak hold and optional full-frame fit.
- Ripple: ring wave field with configurable band columns.

### Core tuning controls

- FFT size
- Smoothing
- Gain
- Beat sensitivity
- Camera drift/beat response
- Bloom, chroma, grain, vignette, DOF, glitch, god rays, grading, and more

## Presets and Slots

- Built-in presets are available from the control panel.
- Five user slots persist in local storage.
- Slot cycle mode rotates through occupied slots with configurable dwell time.

## Project Layout

- src/App.tsx: single-page app shell
- src/main.tsx: browser entry point
- src/components/analyser: UI and interaction layer
- src/components/analyser/engine: audio analysis, scene update logic, shaders, post-FX

## Deploy Notes

This app builds as a static site, so you can deploy the `dist/` output to any static host.

It is configured for GitHub Pages at `https://danamini.github.io/spectrum-aura/`.

Typical flow:

```bash
npm run build
```

Then publish the generated `dist/` directory with your static hosting provider.

## Signal Processing Deep Dive

For a detailed walkthrough of FFT usage, bass energy extraction, peak detection, and BPM estimation, see:

- docs/fft-and-beat-detection.md
