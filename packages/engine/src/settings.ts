import type { ViewMode } from "./visuals";
import type { OverlayCommonsTopic } from "./overlay-manifest";

/**
 * The engine's settings schema: every tunable the scene, composer, and
 * audio pipeline understand, plus the palette catalog and clamp constants.
 * Lives in the engine so any frontend (visualizer, video-loop, UI demos)
 * shares one contract; the app-side store owns persistence/normalization.
 */

/** Wiki-Chroma animated actor packs (skeletal glTF sources in scene.ts). */
export const WIKICHROMA_ACTOR_PACKS = ["soldier", "robot", "fox"] as const;
export type WikichromaActorPack = (typeof WIKICHROMA_ACTOR_PACKS)[number];
export const DEFAULT_WIKICHROMA_ACTOR_PACKS: WikichromaActorPack[] = ["soldier"];

export type Settings = {
  // view
  view: ViewMode;

  // audio
  smoothing: number; // 0..0.99
  fftSize: 512 | 1024 | 2048 | 4096;
  gain: number;
  beatSensitivity: number; // 1..3
  latencyOptimized: boolean;

  // scene
  barCount: number;
  paletteIndex: number;
  sphereDisplacement: number;
  particleCount: number;
  orbitSpeed: number;
  cameraDrift: boolean;
  cameraDriftAmount: number; // 0..2
  cameraBeat: boolean;
  cameraBeatAmount: number; // 0..3
  cameraMouse: boolean; // drag to orbit
  classicSpin: boolean;
  classicSpinSpeed: number; // rad/sec

  // classic view
  classicPeakDecay: number; // units/sec
  classicPeakHold: number; // seconds peak stays before falling
  classicColorBands: boolean; // green/yellow/red banding
  classicBlocky: boolean; // segmented LED cells
  classicSegments: number; // number of LED segments per bar
  classicGrid: boolean; // background grid overlay
  classicGridOpacity: number; // 0..1
  classicShowFreqLabels: boolean; // Hz tick labels under bars
  classicPeakColor: string; // hex color for peak bars
  classicPeakStyle: "bar" | "thin" | "glow" | "none";
  classicWireframe: boolean;
  classicFullscreen: boolean;
  rippleFullscreen: boolean;
  datastreamFullscreen: boolean;
  nebulaFullscreen: boolean;
  monolithFullscreen: boolean;
  mandalaFullscreen: boolean;
  terrainFullscreen: boolean;

  // ripple view
  rippleRingCount: number; // number of rings
  /** 1–5 side-by-side ripple stacks; each column uses a different slice of the spectrum (low → high). */
  rippleColumns: number;
  rippleMaxRadius: number; // outer radius
  rippleSpeed: number; // base wave phase speed
  rippleAmplitude: number; // wave height multiplier
  rippleWaveCycles: number; // base wave cycles across rings
  rippleThickness: number; // ring cross-section thickness
  rippleRotationSpeed: number; // group rotation
  rippleOpacity: number; // ring opacity
  rippleWireframe: boolean; // wireframe rings

  // datastream view
  datastreamUsePalette: boolean;
  datastreamAmplitude: number;
  datastreamItemCount: number;

  // nebula view
  nebulaUsePalette: boolean;
  nebulaAmplitude: number;
  nebulaDetail: number;
  nebulaWireframe: boolean;

  // monolith view
  monolithUsePalette: boolean;
  monolithAmplitude: number;
  monolithBrightness: number;
  monolithGridSize: number;
  monolithWireframe: boolean;

  // mandala view
  mandalaUsePalette: boolean;
  mandalaAmplitude: number;
  mandalaLineCount: number;
  mandalaLineWidth: number;

  // terrain view
  terrainUsePalette: boolean;
  terrainAmplitude: number;
  terrainColumns: number;
  terrainWireframe: boolean;

  // obsidian shard view
  obsidianFullscreen: boolean;
  obsidianUsePalette: boolean;
  obsidianAmplitude: number;
  obsidianShardDetail: number; // icosahedron detail level (0–3)

  // torus particle accelerator view
  torusFullscreen: boolean;
  torusUsePalette: boolean;
  torusAmplitude: number;
  torusParticleCount: number;
  torusSpeed: number; // base orbit speed multiplier
  torusCount: number; // number of side-by-side toruses (1..5)
  torusSpacing: number; // distance between torus centers
  torusSize: number; // overall torus scale
  torusParticleSize: number; // base particle size for the torus view
  torusColorMode: "shared" | "individual";
  torusRotationMode: "flat" | "odd-upright" | "alternating-x" | "alternating-z" | "fan";
  torusOddUpright: boolean; // rotate odd-indexed toruses by 90 degrees

  // brutalist sound-wall view
  soundwallFullscreen: boolean;
  soundwallUsePalette: boolean;
  soundwallAmplitude: number;
  soundwallColumns: number; // pillars per side
  soundwallRows: number; // history depth

  // floating geometry nebula view
  geometrynebulaFullscreen: boolean;
  geometrynebulaUsePalette: boolean;
  geometrynebulaAmplitude: number;
  geometrynebulaCount: number;
  geometrynebulaSpread: number;
  geometrynebulaOrbitSpeed: number;
  geometrynebulaSpinSpeed: number;

  // rez tube view
  reztubeFullscreen: boolean;
  reztubeUsePalette: boolean;
  reztubeAmplitude: number;
  reztubeSpeed: number; // fly-through speed
  reztubeTwist: number; // tube twist rate (0 = none)
  reztubeRadius: number; // tube cross-section radius
  reztubeSegments: number; // cross-section polygon sides (3–12)
  reztubeLineWidth: number; // line thickness in screen pixels

  // assetflow view (3D/2D assets)
  assetflowFullscreen: boolean;
  assetflowUsePalette: boolean;
  assetflowIncludeShapes: boolean;
  assetflowAmplitude: number;
  assetflowModelScale: number;
  assetflowSpriteAmount: number;
  assetflowModelCount: number;
  assetflowSpread: number;
  assetflowSpin: number;
  assetflowMovement: number;
  assetflowBackgroundDrift: number;

  // wiki-chroma view (animated runner actors + motion motifs)
  wikichromaFullscreen: boolean;
  wikichromaUsePalette: boolean;
  wikichromaAmplitude: number;
  wikichromaMotionMode: "orbit" | "cogs" | "runner";
  wikichromaMotionSpeed: number;
  wikichromaFlowStrength: number; // how much audio energy modulates actor motion (0–2)
  wikichromaBeatsPerLoop: number; // beat-locked clip loop length: 1, 2, or 4 beats
  wikichromaActorPacks: WikichromaActorPack[]; // one or more animated model packs

  // stage lights view (sweeping spotlight beams)
  stagelightsFullscreen: boolean;
  stagelightsUsePalette: boolean;
  stagelightsAmplitude: number;
  stagelightsSweepSpeed: number;
  stagelightsFixtureCount: number; // 3, 5, or 7 spotlights
  stagelightsLasers: boolean; // add a laser-show fan of thin upward beams

  // 3D combo view
  comboSphereSize: number; // base sphere scale (1 = default)
  comboSphereSpinSpeed: number; // sphere rotation speed
  comboSphereBassPunch: number; // how much bass scales the sphere
  comboBarRadius: number; // ring radius for bars
  comboBarHeightScale: number; // bar height multiplier
  comboParticleSize: number; // base point size
  comboLevelMeter: boolean; // R/Y/G level-meter coloring on bars
  comboWireframe: boolean;
  comboFullscreen: boolean; // top-down 2D camera lock

  // post fx (toggle + params)
  postFxEnabled: boolean;
  bloom: boolean;
  /** When false, bloom strength is capped at `BLOOM_STRENGTH_MAX_NORMAL` (0.25). */
  bloomExtreme: boolean;
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;
  chroma: boolean;
  chromaAmount: number;
  grain: boolean;
  grainAmount: number;
  vignette: boolean;
  vignetteAmount: number;
  dof: boolean;
  dofFocus: number;
  dofAperture: number;
  dofMaxBlur: number;
  glitch: boolean;
  glitchWild: boolean;
  /** Duty-cycle fraction (0-1) of time the glitch pass actually renders while on. */
  glitchIntensity: number;
  lensFlare: boolean;
  lensFlareAmount: number;
  godRays: boolean;
  godRaysAmount: number;
  motionTrails: boolean;
  trailDecay: number;
  trailInject: number;
  trailThreshold: number;
  ssao: boolean;
  ssaoRadius: number;
  ssaoDistance: number;
  ssaoIntensity: number;
  radialBlur: boolean;
  radialBase: number;
  radialKickAmount: number;
  radialZoom: number;
  pixelate: boolean;
  pixelSize: number;
  tiltShift: boolean;
  tiltAmount: number;
  kaleidoscope: boolean;
  kaleidoscopeSides: number;
  kaleidoscopeAngle: number;
  mirrorFx: boolean;
  mirrorMode: "horizontal" | "vertical" | "quad";
  mirrorOffset: number;
  crtFx: boolean;
  crtScanlineIntensity: number;
  crtCurvature: number;
  crtVignette: number;
  projectorFilmFx: boolean;
  projectorFilmAmount: number;
  projectorFilmJitter: number;
  projectorFilmFlicker: number;
  /** ASCII terminal filter — re-renders the composited frame as glyph cells.
   * Always the last post-FX pass so every other effect feeds into it. */
  asciiFx: boolean;
  asciiCellSize: number; // glyph cell size in pixels
  asciiColored: boolean; // true = glyphs keep source colour, false = mono phosphor tint
  grading: boolean;
  exposure: number;
  contrast: number;
  saturation: number;
  hue: number;
  sobelMode: boolean;
  sobelStrength: number;
  sobelThreshold: number;
  sobelFillMix: number;
  assetOverlayFx: boolean;
  assetOverlayAmount: number;
  assetOverlaySpeed: number;
  assetOverlayBias: "mixed" | "technical" | "organic" | "chaotic";
  assetOverlayCommonsEnabled: boolean;
  assetOverlayCommonsTopic: OverlayCommonsTopic;

  /** Demo-scene text overlay — phrases from a pluggable text source, layered
   * over whichever visual is active. Off by default. Network access anywhere
   * in the app requires an explicit user action: this overlay's BOFH source,
   * the Wikimedia Commons overlay toggle, and the Wiki-Chroma visual's actor
   * models (fetched on first activation of that view). */
  textOverlayEnabled: boolean;
  textOverlaySource: "public-domain" | "bofh";
  textOverlayStyle: "bounce" | "scroller" | "stack" | "orbit";
  textOverlayIntensity: number; // 0..2, jitter/reactivity amount
  textOverlayPhraseInterval: number; // seconds between phrase swaps
  textOverlayAllCaps: boolean;
  textOverlayScramble: boolean; // scramble-in/out effect on swap

  performance: boolean; // cap pixel ratio harder

  bgColor: string; // scene background colour

  activePreset: string | null; // last applied built-in preset, cleared on manual edits

  /** Randomize scope toggle: false = post FX only, true = post FX + view settings. */
  randomizeViewSettings: boolean;

  /** When on, saved slots (1–5) are loaded in rotation, skipping empty slots. */
  slotCycleMode: boolean;
  /** Seconds to keep each slot before advancing (only used when `slotCycleMode`). */
  slotCycleSeconds: number;

  /** Music-reactive random view cycling — switches every 4 bars (16 beats in 4/4). */
  viewCycleMode: boolean;
  /** When switching views via cycle, also randomize post FX (and view settings if enabled). */
  viewCycleRandomize: boolean;

  /** "Dynamic Mode" — a curated set of impactful per-view settings slowly drift
   * over musical time (phrases), as a bounded offset around the value below, not
   * a replacement of it. See engine/evolution.ts. */
  evolveEnabled: boolean;
  /** Drift intensity, 0 (none) to 1 (full — up to ~40% of the base value). */
  evolveAmount: number;

  /** Web MIDI control opt-in — requesting access triggers a browser permission
   * prompt, so this only turns on via an explicit user toggle (never randomize
   * or loading a save). */
  midiEnabled: boolean;

  // experimental features
  showBPM: boolean; // show BPM & bar grid in Audio panel
  showLatency: boolean; // show audio→UI latency HUD
};

/** Max bloom strength while "Extreme bloom" is off; higher values need extreme mode. */
export const BLOOM_STRENGTH_MAX_NORMAL = 0.25;
export const VIGNETTE_AMOUNT_MAX = 1.25;
export const VIGNETTE_AMOUNT_MIN = 0.5;

/** Prevent view amplitudes from reaching zero so visuals always stay alive. */
export const MIN_VIEW_AMPLITUDE = 0.5;

export const PALETTES: Array<{ name: string; colors: [string, string, string] }> = [
  { name: "Neon Sunset", colors: ["#ff2d95", "#7a5cff", "#00e5ff"] },
  { name: "Liquid Chrome", colors: ["#e8f1ff", "#9bb8ff", "#3a4a8a"] },
  { name: "Toxic", colors: ["#a6ff00", "#00ffd1", "#ff007a"] },
  { name: "Ember", colors: ["#ffb347", "#ff4d4d", "#ffe27a"] },
  // Canonical vaporwave trio (hot pink / cyan / mint from the classic
  // ff71ce-01cdfe-05ffa1-b967ff-fffb96 palette). Append-only: paletteIndex is
  // persisted in saves, so existing indices must stay stable.
  { name: "Vaporwave", colors: ["#ff71ce", "#01cdfe", "#05ffa1"] },
  { name: "Outrun Sunset", colors: ["#f62e97", "#ffb845", "#712275"] },
];

export const DEFAULT_SETTINGS: Settings = {
  view: "combo",
  classicPeakDecay: 0.6,
  classicPeakHold: 0.8,
  classicColorBands: true,
  classicBlocky: true,
  classicSegments: 18,
  classicGrid: true,
  classicGridOpacity: 0.18,
  classicShowFreqLabels: true,
  classicPeakColor: "#ffffff",
  classicPeakStyle: "bar",
  classicWireframe: false,
  classicFullscreen: false,
  rippleFullscreen: false,
  datastreamFullscreen: false,
  nebulaFullscreen: false,
  monolithFullscreen: false,
  mandalaFullscreen: false,
  terrainFullscreen: false,
  rippleRingCount: 40,
  rippleColumns: 20,
  rippleMaxRadius: 6,
  rippleSpeed: 1,
  rippleAmplitude: 1,
  rippleWaveCycles: 1.5,
  rippleThickness: 1,
  rippleRotationSpeed: 0.08,
  rippleOpacity: 1,
  rippleWireframe: false,
  datastreamUsePalette: true,
  datastreamAmplitude: 1,
  datastreamItemCount: 10000,
  nebulaUsePalette: true,
  nebulaAmplitude: 1,
  nebulaDetail: 144,
  nebulaWireframe: false,
  monolithUsePalette: true,
  monolithAmplitude: 1,
  monolithBrightness: 1,
  monolithGridSize: 32,
  monolithWireframe: false,
  mandalaUsePalette: true,
  mandalaAmplitude: 1,
  mandalaLineCount: 12,
  mandalaLineWidth: 1,
  terrainUsePalette: true,
  terrainAmplitude: 1,
  terrainColumns: 128,
  terrainWireframe: true,
  obsidianFullscreen: false,
  obsidianUsePalette: true,
  obsidianAmplitude: 1,
  obsidianShardDetail: 1,
  torusFullscreen: false,
  torusUsePalette: true,
  torusAmplitude: 1,
  torusParticleCount: 5000,
  torusSpeed: 1,
  torusCount: 1,
  torusSpacing: 11.4,
  torusSize: 1,
  torusParticleSize: 0.06,
  torusColorMode: "individual",
  torusRotationMode: "odd-upright",
  torusOddUpright: false,
  soundwallFullscreen: false,
  soundwallUsePalette: true,
  soundwallAmplitude: 1,
  soundwallColumns: 20,
  soundwallRows: 12,
  geometrynebulaFullscreen: false,
  geometrynebulaUsePalette: true,
  geometrynebulaAmplitude: 1.5,
  geometrynebulaCount: 60,
  geometrynebulaSpread: 1.6,
  geometrynebulaOrbitSpeed: 1,
  geometrynebulaSpinSpeed: 1,
  reztubeFullscreen: false,
  reztubeUsePalette: false,
  reztubeAmplitude: 1,
  reztubeSpeed: 1,
  reztubeTwist: 1,
  reztubeRadius: 5.5,
  reztubeSegments: 4,
  reztubeLineWidth: 1,
  assetflowFullscreen: false,
  assetflowUsePalette: true,
  assetflowIncludeShapes: false,
  assetflowAmplitude: 1,
  assetflowModelScale: 1,
  assetflowSpriteAmount: 1,
  assetflowModelCount: 24,
  assetflowSpread: 4.7,
  assetflowSpin: 1,
  assetflowMovement: 0.7,
  assetflowBackgroundDrift: 1,
  wikichromaFullscreen: false,
  wikichromaUsePalette: true,
  wikichromaAmplitude: 1,
  wikichromaMotionMode: "cogs",
  wikichromaMotionSpeed: 1,
  wikichromaFlowStrength: 1,
  wikichromaBeatsPerLoop: 2,
  wikichromaActorPacks: DEFAULT_WIKICHROMA_ACTOR_PACKS,
  stagelightsFullscreen: false,
  stagelightsUsePalette: true,
  stagelightsAmplitude: 1,
  stagelightsSweepSpeed: 1,
  stagelightsFixtureCount: 3,
  stagelightsLasers: false,
  comboSphereSize: 1,
  comboSphereSpinSpeed: 0.2,
  comboSphereBassPunch: 0.25,
  comboBarRadius: 4.5,
  comboBarHeightScale: 1,
  comboParticleSize: 1,
  comboLevelMeter: true,
  comboWireframe: false,
  comboFullscreen: false,
  smoothing: 0.82,
  fftSize: 2048,
  gain: 1.0,
  beatSensitivity: 1.4,
  latencyOptimized: true,

  barCount: 128,
  paletteIndex: 0,
  sphereDisplacement: 0.55,
  particleCount: 6000,
  orbitSpeed: 0.18,
  cameraDrift: true,
  cameraDriftAmount: 0.8,
  cameraBeat: true,
  cameraBeatAmount: 1.0,
  cameraMouse: true,
  classicSpin: false,
  classicSpinSpeed: 0.3,

  postFxEnabled: true,
  bloom: true,
  bloomExtreme: false,
  bloomStrength: 0.25,
  bloomRadius: 0.7,
  bloomThreshold: 0.15,
  chroma: true,
  chromaAmount: 0.0025,
  grain: true,
  grainAmount: 0.25,
  vignette: true,
  vignetteAmount: 1.05,
  dof: false,
  dofFocus: 8,
  dofAperture: 0.0006,
  dofMaxBlur: 0.01,
  glitch: false,
  glitchWild: false,
  glitchIntensity: 1,
  lensFlare: false,
  lensFlareAmount: 0.6,
  godRays: true,
  godRaysAmount: 0.55,
  motionTrails: false,
  trailDecay: 0.92,
  trailInject: 1.15,
  trailThreshold: 0.1,
  ssao: false,
  ssaoRadius: 8,
  ssaoDistance: 0.08,
  ssaoIntensity: 0.35,
  radialBlur: false,
  radialBase: 0.02,
  radialKickAmount: 0.32,
  radialZoom: 0.35,
  pixelate: false,
  pixelSize: 4,
  tiltShift: false,
  tiltAmount: 1.2,
  kaleidoscope: false,
  kaleidoscopeSides: 6,
  kaleidoscopeAngle: 0,
  mirrorFx: false,
  mirrorMode: "horizontal",
  mirrorOffset: 0,
  crtFx: false,
  crtScanlineIntensity: 0.35,
  crtCurvature: 0.08,
  crtVignette: 0.45,
  projectorFilmFx: false,
  projectorFilmAmount: 0.45,
  projectorFilmJitter: 0.25,
  projectorFilmFlicker: 0.35,
  asciiFx: false,
  asciiCellSize: 10,
  asciiColored: true,
  grading: true,
  exposure: 1.05,
  contrast: 1.1,
  saturation: 1.15,
  hue: 0,
  sobelMode: false,
  sobelStrength: 1.5,
  sobelThreshold: 0.15,
  sobelFillMix: 0.08,
  assetOverlayFx: false,
  assetOverlayAmount: 0.6,
  assetOverlaySpeed: 1,
  assetOverlayBias: "mixed",
  assetOverlayCommonsEnabled: false,
  assetOverlayCommonsTopic: "abstract",

  textOverlayEnabled: false,
  textOverlaySource: "public-domain",
  textOverlayStyle: "bounce",
  textOverlayIntensity: 1,
  textOverlayPhraseInterval: 6,
  textOverlayAllCaps: true,
  textOverlayScramble: true,

  performance: false,
  bgColor: "#05060a",
  activePreset: null,
  randomizeViewSettings: false,

  slotCycleMode: false,
  slotCycleSeconds: 22,

  viewCycleMode: false,
  viewCycleRandomize: true,

  evolveEnabled: false,
  evolveAmount: 0.6,

  midiEnabled: false,

  // HUDs start hidden; the persisted store still remembers a user's toggle
  // (M / L keys or Audio panel) across sessions like any other setting.
  showBPM: false,
  showLatency: false,
};

export const PRESETS: Record<string, Partial<Settings>> = {
  Cyberpunk: {
    paletteIndex: 0,
    bloom: true,
    bloomExtreme: true,
    bloomStrength: 1.5,
    chroma: true,
    chromaAmount: 0.004,
    grain: true,
    vignette: true,
    godRays: true,
    godRaysAmount: 0.7,
    glitch: false,
    grading: true,
    saturation: 1.4,
    contrast: 1.2,
    hue: -0.05,
    pixelate: false,
    dof: false,
  },
  Cinematic: {
    paletteIndex: 1,
    bloom: true,
    bloomExtreme: true,
    bloomStrength: 0.8,
    chroma: true,
    chromaAmount: 0.0015,
    grain: true,
    grainAmount: 0.15,
    vignette: true,
    vignetteAmount: 1.25,
    dof: true,
    glitch: false,
    godRays: true,
    godRaysAmount: 0.4,
    grading: true,
    contrast: 1.15,
    saturation: 0.95,
    pixelate: false,
  },
  "Liquid Chrome": {
    paletteIndex: 1,
    bloom: true,
    bloomExtreme: true,
    bloomStrength: 1.3,
    chroma: true,
    chromaAmount: 0.002,
    grain: false,
    vignette: true,
    godRays: false,
    glitch: false,
    grading: true,
    saturation: 0.6,
    contrast: 1.25,
    exposure: 1.15,
    pixelate: false,
    dof: false,
  },
  "Glitch Storm": {
    paletteIndex: 2,
    bloom: true,
    bloomExtreme: true,
    bloomStrength: 1.4,
    chroma: true,
    chromaAmount: 0.006,
    grain: true,
    grainAmount: 0.5,
    vignette: true,
    glitch: true,
    glitchWild: false,
    godRays: true,
    godRaysAmount: 0.9,
    grading: true,
    saturation: 1.5,
    hue: 0.1,
    pixelate: false,
    dof: false,
  },
  "CRT Arcade": {
    paletteIndex: 0,
    bloom: true,
    bloomStrength: 0.14,
    bloomRadius: 0.45,
    bloomThreshold: 0.34,
    chroma: true,
    chromaAmount: 0.0016,
    grain: true,
    grainAmount: 0.18,
    vignette: true,
    vignetteAmount: 1.12,
    crtFx: true,
    crtScanlineIntensity: 0.62,
    crtCurvature: 0.1,
    crtVignette: 0.52,
    projectorFilmFx: false,
    mirrorFx: false,
    kaleidoscope: false,
    grading: true,
    exposure: 0.94,
    contrast: 1.2,
    saturation: 1.08,
    hue: -0.01,
    pixelate: false,
    dof: false,
  },
  "Retro Broadcast": {
    paletteIndex: 1,
    bloom: true,
    bloomStrength: 0.1,
    bloomRadius: 0.35,
    bloomThreshold: 0.42,
    chroma: true,
    chromaAmount: 0.0022,
    grain: true,
    grainAmount: 0.2,
    vignette: true,
    vignetteAmount: 1.08,
    crtFx: true,
    crtScanlineIntensity: 0.48,
    crtCurvature: 0.1,
    crtVignette: 0.38,
    projectorFilmFx: false,
    mirrorFx: false,
    kaleidoscope: false,
    grading: true,
    exposure: 0.98,
    contrast: 1.13,
    saturation: 0.92,
    hue: 0,
    pixelate: false,
    dof: false,
  },
  "16mm Projector": {
    paletteIndex: 3,
    bloom: true,
    bloomStrength: 0.22,
    bloomRadius: 0.62,
    bloomThreshold: 0.26,
    chroma: false,
    grain: true,
    grainAmount: 0.36,
    vignette: true,
    vignetteAmount: 1.2,
    crtFx: false,
    projectorFilmFx: true,
    projectorFilmAmount: 0.86,
    projectorFilmJitter: 0.42,
    projectorFilmFlicker: 0.5,
    mirrorFx: false,
    kaleidoscope: false,
    grading: true,
    exposure: 1.03,
    contrast: 1.06,
    saturation: 0.78,
    hue: 0.015,
    lensFlare: false,
    godRays: false,
    pixelate: false,
    dof: false,
  },
  "Projector Grindhouse": {
    paletteIndex: 2,
    bloom: true,
    bloomStrength: 0.28,
    bloomRadius: 0.76,
    bloomThreshold: 0.2,
    chroma: true,
    chromaAmount: 0.0012,
    grain: true,
    grainAmount: 0.45,
    vignette: true,
    vignetteAmount: 1.25,
    crtFx: false,
    projectorFilmFx: true,
    projectorFilmAmount: 1.15,
    projectorFilmJitter: 0.58,
    projectorFilmFlicker: 0.6,
    glitch: true,
    glitchWild: false,
    mirrorFx: false,
    kaleidoscope: false,
    grading: true,
    exposure: 0.95,
    contrast: 1.26,
    saturation: 0.86,
    hue: 0.03,
    dof: false,
  },
  "Vaporwave Sunset": {
    paletteIndex: 4,
    bgColor: "#1e1138",
    bloom: true,
    bloomExtreme: true,
    bloomStrength: 0.6,
    bloomRadius: 0.85,
    bloomThreshold: 0.18,
    chroma: true,
    chromaAmount: 0.0035,
    grain: true,
    grainAmount: 0.22,
    vignette: true,
    vignetteAmount: 1.1,
    crtFx: false,
    projectorFilmFx: false,
    godRays: true,
    godRaysAmount: 0.6,
    glitch: false,
    pixelate: false,
    dof: false,
    mirrorFx: false,
    kaleidoscope: false,
    grading: true,
    exposure: 1.02,
    contrast: 1.08,
    saturation: 1.3,
    hue: -0.03,
  },
  "Mallsoft Haze": {
    paletteIndex: 4,
    bgColor: "#101a33",
    bloom: true,
    bloomExtreme: false,
    bloomStrength: 0.2,
    bloomRadius: 1.0,
    bloomThreshold: 0.2,
    chroma: true,
    chromaAmount: 0.0012,
    grain: true,
    grainAmount: 0.14,
    vignette: true,
    vignetteAmount: 1.2,
    dof: true,
    dofFocus: 8,
    dofAperture: 0.0009,
    dofMaxBlur: 0.012,
    tiltShift: true,
    tiltAmount: 1.5,
    motionTrails: true,
    trailDecay: 0.94,
    trailInject: 1.0,
    trailThreshold: 0.12,
    godRays: false,
    glitch: false,
    crtFx: false,
    projectorFilmFx: false,
    pixelate: false,
    mirrorFx: false,
    kaleidoscope: false,
    grading: true,
    exposure: 1.04,
    contrast: 0.94,
    saturation: 0.82,
    hue: 0.02,
  },
  "Outrun Grid": {
    view: "terrain",
    terrainFullscreen: false,
    terrainWireframe: true,
    terrainUsePalette: true,
    terrainAmplitude: 1.6,
    terrainColumns: 96,
    paletteIndex: 5,
    bgColor: "#1e1138",
    bloom: true,
    bloomExtreme: true,
    bloomStrength: 0.7,
    bloomRadius: 0.75,
    bloomThreshold: 0.16,
    chroma: true,
    chromaAmount: 0.002,
    grain: true,
    grainAmount: 0.15,
    vignette: true,
    vignetteAmount: 1.05,
    godRays: true,
    godRaysAmount: 0.5,
    glitch: false,
    crtFx: false,
    projectorFilmFx: false,
    pixelate: false,
    dof: false,
    mirrorFx: false,
    kaleidoscope: false,
    grading: true,
    exposure: 1.0,
    contrast: 1.2,
    saturation: 1.45,
    hue: 0,
  },
  "Broken Transmission": {
    paletteIndex: 4,
    bgColor: "#05060a",
    bloom: true,
    bloomExtreme: false,
    bloomStrength: 0.18,
    bloomRadius: 0.55,
    bloomThreshold: 0.25,
    chroma: true,
    chromaAmount: 0.006,
    grain: true,
    grainAmount: 0.38,
    vignette: true,
    vignetteAmount: 1.15,
    crtFx: true,
    crtScanlineIntensity: 0.55,
    crtCurvature: 0.09,
    crtVignette: 0.45,
    glitch: true,
    glitchWild: false,
    glitchIntensity: 0.45,
    projectorFilmFx: false,
    pixelate: false,
    dof: false,
    godRays: false,
    mirrorFx: false,
    kaleidoscope: false,
    grading: true,
    exposure: 0.96,
    contrast: 1.18,
    saturation: 1.15,
    hue: -0.02,
  },
  "Marble Dream": {
    paletteIndex: 1,
    bgColor: "#101a33",
    bloom: true,
    bloomExtreme: true,
    bloomStrength: 0.45,
    bloomRadius: 0.9,
    bloomThreshold: 0.22,
    chroma: true,
    chromaAmount: 0.0015,
    grain: true,
    grainAmount: 0.1,
    vignette: true,
    vignetteAmount: 1.1,
    dof: true,
    dofFocus: 9,
    dofAperture: 0.0006,
    dofMaxBlur: 0.008,
    motionTrails: true,
    trailDecay: 0.93,
    trailInject: 1.1,
    trailThreshold: 0.15,
    godRays: true,
    godRaysAmount: 0.35,
    glitch: false,
    crtFx: false,
    projectorFilmFx: false,
    pixelate: false,
    mirrorFx: false,
    kaleidoscope: false,
    grading: true,
    exposure: 1.1,
    contrast: 1.02,
    saturation: 0.72,
    hue: 0.05,
  },
  "VHS Dream": {
    paletteIndex: 0,
    bloom: true,
    bloomStrength: 0.16,
    bloomRadius: 0.52,
    bloomThreshold: 0.29,
    chroma: true,
    chromaAmount: 0.0046,
    grain: true,
    grainAmount: 0.3,
    vignette: true,
    vignetteAmount: 1.16,
    crtFx: true,
    crtScanlineIntensity: 0.42,
    crtCurvature: 0.1,
    crtVignette: 0.34,
    projectorFilmFx: true,
    projectorFilmAmount: 0.62,
    projectorFilmJitter: 0.3,
    projectorFilmFlicker: 0.4,
    mirrorFx: false,
    kaleidoscope: false,
    grading: true,
    exposure: 0.97,
    contrast: 1.16,
    saturation: 1.02,
    hue: -0.02,
    dof: false,
  },
};
