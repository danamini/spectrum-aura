/**
 * Public surface of @spectrum-aura/engine.
 *
 * The barrel exports the shared contract (settings schema, palettes, visual
 * registry). Runtime modules are deliberately left to subpath imports so
 * frontends only pull what they use — e.g. a UI-reactive page can import
 * `@spectrum-aura/engine/audio` without dragging in Three.js via `scene`:
 *
 *   @spectrum-aura/engine/audio       FFT + BeatMatcher + BPMDetector
 *   @spectrum-aura/engine/song-clock  authoritative bar/beat grid
 *   @spectrum-aura/engine/loudness    shared amplitude curve
 *   @spectrum-aura/engine/scene       Three.js views (needs `three`)
 *   @spectrum-aura/engine/composer    post-FX pipeline (needs `three`)
 *   @spectrum-aura/engine/midi        Web MIDI parsing + action mapping
 *   @spectrum-aura/engine/overlay-fx  transparent DOM-overlay FX (for iframes)
 */
export * from "./settings";
export * from "./visuals";
