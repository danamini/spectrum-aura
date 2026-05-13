import { useSyncExternalStore } from "react";

export type ViewMode =
  | "combo"
  | "classic"
  | "ripple"
  | "datastream"
  | "nebula"
  | "monolith"
  | "mandala"
  | "terrain";

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
  cameraMouse: boolean;     // drag to orbit
  classicSpin: boolean;
  classicSpinSpeed: number; // rad/sec

  // classic view
  classicPeakDecay: number; // units/sec
  classicPeakHold: number;  // seconds peak stays before falling
  classicColorBands: boolean; // green/yellow/red banding
  classicBlocky: boolean;    // segmented LED cells
  classicSegments: number;   // number of LED segments per bar
  classicGrid: boolean;      // background grid overlay
  classicGridOpacity: number; // 0..1
  classicShowFreqLabels: boolean; // Hz tick labels under bars
  classicPeakColor: string;       // hex color for peak bars
  classicPeakStyle: "bar" | "thin" | "glow" | "none";
  classicFullscreen: boolean;
  rippleFullscreen: boolean;
  datastreamFullscreen: boolean;
  nebulaFullscreen: boolean;
  monolithFullscreen: boolean;
  mandalaFullscreen: boolean;
  terrainFullscreen: boolean;

  // ripple view
  rippleRingCount: number;       // number of rings
  /** 1–5 side-by-side ripple stacks; each column uses a different slice of the spectrum (low → high). */
  rippleColumns: number;
  rippleMaxRadius: number;       // outer radius
  rippleSpeed: number;           // base wave phase speed
  rippleAmplitude: number;       // wave height multiplier
  rippleWaveCycles: number;      // base wave cycles across rings
  rippleThickness: number;       // ring cross-section thickness
  rippleRotationSpeed: number;   // group rotation
  rippleOpacity: number;         // ring opacity
  rippleWireframe: boolean;      // wireframe rings

  // datastream view
  datastreamUsePalette: boolean;
  datastreamAmplitude: number;
  datastreamItemCount: number;

  // nebula view
  nebulaUsePalette: boolean;
  nebulaAmplitude: number;
  nebulaDetail: number;

  // monolith view
  monolithUsePalette: boolean;
  monolithAmplitude: number;
  monolithGridSize: number;

  // mandala view
  mandalaUsePalette: boolean;
  mandalaAmplitude: number;
  mandalaLineCount: number;
  mandalaLineWidth: number;

  // terrain view
  terrainUsePalette: boolean;
  terrainAmplitude: number;
  terrainColumns: number;

  // 3D combo view
  comboSphereSize: number;       // base sphere scale (1 = default)
  comboSphereSpinSpeed: number;  // sphere rotation speed
  comboSphereBassPunch: number;  // how much bass scales the sphere
  comboBarRadius: number;        // ring radius for bars
  comboBarHeightScale: number;   // bar height multiplier
  comboParticleSize: number;     // base point size
  comboLevelMeter: boolean;      // R/Y/G level-meter coloring on bars
  comboFullscreen: boolean;      // top-down 2D camera lock

  // post fx (toggle + params)
  bloom: boolean;
  /** When false, bloom strength is capped at `BLOOM_STRENGTH_MAX_NORMAL` (0.25). */
  bloomExtreme: boolean;
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;
  chroma: boolean; chromaAmount: number;
  grain: boolean; grainAmount: number;
  vignette: boolean; vignetteAmount: number;
  dof: boolean; dofFocus: number; dofAperture: number; dofMaxBlur: number;
  glitch: boolean; glitchWild: boolean;
  godRays: boolean; godRaysAmount: number;
  pixelate: boolean; pixelSize: number;
  tiltShift: boolean; tiltAmount: number;
  grading: boolean; exposure: number; contrast: number; saturation: number; hue: number;

  performance: boolean; // cap pixel ratio harder

  bgColor: string; // scene background colour

  activePreset: string | null; // last applied built-in preset, cleared on manual edits

  /** When on, saved slots (1–5) are loaded in rotation, skipping empty slots. */
  slotCycleMode: boolean;
  /** Seconds to keep each slot before advancing (only used when `slotCycleMode`). */
  slotCycleSeconds: number;

  // experimental features
  showBPM: boolean; // show BPM overlay when detected
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
  classicFullscreen: false,
  rippleFullscreen: false,
  datastreamFullscreen: false,
  nebulaFullscreen: false,
  monolithFullscreen: false,
  mandalaFullscreen: false,
  terrainFullscreen: false,
  rippleRingCount: 40,
  rippleColumns: 5,
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
  monolithUsePalette: true,
  monolithAmplitude: 1,
  monolithGridSize: 32,
  mandalaUsePalette: true,
  mandalaAmplitude: 1,
  mandalaLineCount: 12,
  mandalaLineWidth: 1,
  terrainUsePalette: true,
  terrainAmplitude: 1,
  terrainColumns: 128,
  comboSphereSize: 1,
  comboSphereSpinSpeed: 0.2,
  comboSphereBassPunch: 0.25,
  comboBarRadius: 4.5,
  comboBarHeightScale: 1,
  comboParticleSize: 1,
  comboLevelMeter: true,
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

  bloom: true,
  bloomExtreme: false,
  bloomStrength: 0.25,
  bloomRadius: 0.7,
  bloomThreshold: 0.15,
  chroma: true, chromaAmount: 0.0025,
  grain: true, grainAmount: 0.25,
  vignette: true, vignetteAmount: 1.05,
  dof: false, dofFocus: 8, dofAperture: 0.0006, dofMaxBlur: 0.01,
  glitch: false, glitchWild: false,
  godRays: true, godRaysAmount: 0.55,
  pixelate: false, pixelSize: 4,
  tiltShift: false, tiltAmount: 1.2,
  grading: true, exposure: 1.05, contrast: 1.1, saturation: 1.15, hue: 0,

  performance: false,
  bgColor: "#05060a",
  activePreset: null,

  slotCycleMode: false,
  slotCycleSeconds: 22,

  showBPM: true,
};

export const PRESETS: Record<string, Partial<Settings>> = {
  Cyberpunk: {
    paletteIndex: 0, bloom: true, bloomExtreme: true, bloomStrength: 1.5, chroma: true, chromaAmount: 0.004,
    grain: true, vignette: true, godRays: true, godRaysAmount: 0.7, glitch: false,
    grading: true, saturation: 1.4, contrast: 1.2, hue: -0.05, pixelate: false, dof: false,
  },
  Cinematic: {
    paletteIndex: 1, bloom: true, bloomExtreme: true, bloomStrength: 0.8, chroma: true, chromaAmount: 0.0015,
    grain: true, grainAmount: 0.15, vignette: true, vignetteAmount: 1.25, dof: true,
    glitch: false, godRays: true, godRaysAmount: 0.4, grading: true, contrast: 1.15,
    saturation: 0.95, pixelate: false,
  },
  "Liquid Chrome": {
    paletteIndex: 1, bloom: true, bloomExtreme: true, bloomStrength: 1.3, chroma: true, chromaAmount: 0.002,
    grain: false, vignette: true, godRays: false, glitch: false, grading: true,
    saturation: 0.6, contrast: 1.25, exposure: 1.15, pixelate: false, dof: false,
  },
  "Glitch Storm": {
    paletteIndex: 2, bloom: true, bloomExtreme: true, bloomStrength: 1.4, chroma: true, chromaAmount: 0.006,
    grain: true, grainAmount: 0.5, vignette: true, glitch: true, glitchWild: false,
    godRays: true, godRaysAmount: 0.9, grading: true, saturation: 1.5, hue: 0.1,
    pixelate: false, dof: false,
  },
};

const RANDOM_BG_COLORS = [
  "#05060a",
  "#000000",
  "#101a33",
  "#1e1138",
  "#0d2a2a",
  "#2b1a10",
  "#3b3b3b",
  "#1f2a16",
  "#0047ff",
  "#00c2ff",
  "#00ff87",
  "#e6ff00",
  "#ff9f1c",
  "#ff3d00",
  "#ff2ad4",
  "#ff1744",
  "#ffffff",
] as const;

/**
 * Converts a 6-digit hex color string to [r, g, b] array (0-255).
 * @example hexToRgb("#ff2d95") -> [255, 45, 149]
 */
function hexToRgb(hex: string): [number, number, number] | null {
  const s = hex.trim();
  const m = /^#([\da-f]{6})$/i.exec(s);
  if (!m) return null;
  const n = Number.parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Converts sRGB byte value (0-255) to linear color space for luminance calculation. */
function srgbToLinear(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Computes WCAG relative luminance of a hex color. Used for contrast calculations. */
function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb;
  const rl = srgbToLinear(r);
  const gl = srgbToLinear(g);
  const bl = srgbToLinear(b);
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

/**
 * Computes WCAG contrast ratio between two hex colors.
 * Range: 1 (identical) to 21 (max contrast, e.g. white on black).
 * Recommended minimum for readability: 4.5:1
 */
function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Euclidean distance between two colors in normalized RGB space.
 * Returns 0 (identical) to ~1.73 (opposite corners of RGB cube).
 */
function colorDistance(a: string, b: string): number {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  if (!ra || !rb) return 0;
  const dr = (ra[0] - rb[0]) / 255;
  const dg = (ra[1] - rb[1]) / 255;
  const db = (ra[2] - rb[2]) / 255;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * Selects a random background color that provides good contrast with the given palette.
 * 
 * Uses WCAG contrast ratio + RGB distance scoring to ensure:
 * - Minimum contrast ratio to at least one palette color
 * - Sufficient perceptual distance from all palette colors
 * 
 * Picks randomly from top-scoring 30% of candidates for variety.
 */
function pickRandomBgColorForPalette(palette: [string, string, string]): string {
  const scored = RANDOM_BG_COLORS.map((bg) => {
    const contrasts = palette.map((fg) => contrastRatio(bg, fg));
    const distances = palette.map((fg) => colorDistance(bg, fg));
    const minContrast = Math.min(...contrasts);
    const minDistance = Math.min(...distances);
    const avgContrast = (contrasts[0] + contrasts[1] + contrasts[2]) / 3;
    const avgDistance = (distances[0] + distances[1] + distances[2]) / 3;
    const score = minContrast * 1.8 + avgDistance * 2.2 + Math.min(1, avgContrast / 5) * 1.5;
    return { bg, minContrast, minDistance, avgContrast, avgDistance, score };
  });
  const pool = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(4, Math.floor(scored.length * 0.3)));
  return pool[Math.floor(Math.random() * pool.length)]!.bg;
}

/**
 * Normalizes bloom strength to respect bloomExtreme mode.
 * If bloomExtreme is off, caps bloom at BLOOM_STRENGTH_MAX_NORMAL.
 */
function normalizeBloomForExtreme(settings: Settings): Settings {
  if (settings.bloomExtreme) return settings;
  if (settings.bloomStrength > BLOOM_STRENGTH_MAX_NORMAL) {
    return { ...settings, bloomStrength: BLOOM_STRENGTH_MAX_NORMAL };
  }
  return settings;
}

function normalizeAmplitudeFloor(settings: Settings): Settings {
  return {
    ...settings,
    rippleAmplitude: Math.max(MIN_VIEW_AMPLITUDE, settings.rippleAmplitude),
    datastreamAmplitude: Math.max(MIN_VIEW_AMPLITUDE, settings.datastreamAmplitude),
    nebulaAmplitude: Math.max(MIN_VIEW_AMPLITUDE, settings.nebulaAmplitude),
    monolithAmplitude: Math.max(MIN_VIEW_AMPLITUDE, settings.monolithAmplitude),
    mandalaAmplitude: Math.max(MIN_VIEW_AMPLITUDE, settings.mandalaAmplitude),
    terrainAmplitude: Math.max(MIN_VIEW_AMPLITUDE, settings.terrainAmplitude),
  };
}

function normalizeVignetteAmount(settings: Settings): Settings {
  return {
    ...settings,
    vignetteAmount: Math.max(VIGNETTE_AMOUNT_MIN, Math.min(VIGNETTE_AMOUNT_MAX, settings.vignetteAmount)),
  };
}

function normalizeSettings(settings: Settings): Settings {
  return normalizeVignetteAmount(normalizeAmplitudeFloor(normalizeBloomForExtreme(settings)));
}

const STORAGE_KEY = "analyser-settings-v1";
const SLOTS_KEY = "analyser-slots-v1";
export const SLOT_COUNT = 5;

export type SavedSlot = { name: string; settings: Settings } | null;

type SlotSeed = {
  name: string;
  settings: Partial<Settings> & { rippleWaveLayers?: number };
} | null;

const DEPLOYMENT_DEFAULT_SLOTS: SlotSeed[] = [
  {
    name: "Slot 1",
    settings: {
      view: "ripple",
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
      classicFullscreen: true,
      rippleFullscreen: false,
      datastreamFullscreen: false,
      nebulaFullscreen: false,
      monolithFullscreen: false,
      mandalaFullscreen: false,
      terrainFullscreen: false,
      rippleRingCount: 18,
      rippleColumns: 19,
      rippleMaxRadius: 10.9,
      rippleSpeed: 1,
      rippleAmplitude: 0.5,
      rippleWaveCycles: 0.4,
      rippleThickness: 0.45,
      rippleRotationSpeed: 0,
      rippleOpacity: 0.1,
      rippleWireframe: true,
      datastreamUsePalette: true,
      datastreamAmplitude: 1,
      datastreamItemCount: 10000,
      nebulaUsePalette: true,
      nebulaAmplitude: 1,
      nebulaDetail: 144,
      monolithUsePalette: true,
      monolithAmplitude: 1,
      monolithGridSize: 32,
      mandalaUsePalette: true,
      mandalaAmplitude: 1,
      mandalaLineCount: 12,
      mandalaLineWidth: 1,
      terrainUsePalette: true,
      terrainAmplitude: 1,
      terrainColumns: 128,
      comboSphereSize: 1,
      comboSphereSpinSpeed: 0.2,
      comboSphereBassPunch: 0.25,
      comboBarRadius: 4.5,
      comboBarHeightScale: 1,
      comboParticleSize: 1,
      comboLevelMeter: true,
      comboFullscreen: false,
      smoothing: 0.82,
      fftSize: 2048,
      gain: 1,
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
      cameraBeatAmount: 1,
      cameraMouse: true,
      classicSpin: false,
      classicSpinSpeed: 0.3,
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
      godRays: true,
      godRaysAmount: 0.55,
      pixelate: false,
      pixelSize: 4,
      tiltShift: true,
      tiltAmount: 1.2,
      grading: true,
      exposure: 1.05,
      contrast: 1.1,
      saturation: 1.15,
      hue: 0,
      performance: true,
      bgColor: "#05060a",
      activePreset: null,
      slotCycleMode: false,
      slotCycleSeconds: 22,
      showBPM: true,
    },
  },
  {
    name: "Slot 2",
    settings: {
      view: "classic",
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
      classicFullscreen: true,
      rippleFullscreen: false,
      datastreamFullscreen: false,
      nebulaFullscreen: false,
      monolithFullscreen: false,
      mandalaFullscreen: false,
      terrainFullscreen: false,
      rippleRingCount: 18,
      rippleColumns: 5,
      rippleMaxRadius: 10.9,
      rippleSpeed: 1,
      rippleAmplitude: 0.5,
      rippleWaveCycles: 0.4,
      rippleThickness: 0.45,
      rippleRotationSpeed: 0,
      rippleOpacity: 0.1,
      rippleWireframe: true,
      datastreamUsePalette: true,
      datastreamAmplitude: 1,
      datastreamItemCount: 10000,
      nebulaUsePalette: true,
      nebulaAmplitude: 1,
      nebulaDetail: 144,
      monolithUsePalette: true,
      monolithAmplitude: 1,
      monolithGridSize: 32,
      mandalaUsePalette: true,
      mandalaAmplitude: 1,
      mandalaLineCount: 12,
      mandalaLineWidth: 1,
      terrainUsePalette: true,
      terrainAmplitude: 1,
      terrainColumns: 128,
      comboSphereSize: 1,
      comboSphereSpinSpeed: 0.2,
      comboSphereBassPunch: 0.25,
      comboBarRadius: 4.5,
      comboBarHeightScale: 1,
      comboParticleSize: 1,
      comboLevelMeter: true,
      comboFullscreen: false,
      smoothing: 0.82,
      fftSize: 2048,
      gain: 1,
      beatSensitivity: 1.4,
      latencyOptimized: true,
      barCount: 120,
      paletteIndex: 2,
      sphereDisplacement: 1.2744294219011156,
      particleCount: 6000,
      orbitSpeed: 0.5573645825854491,
      cameraDrift: true,
      cameraDriftAmount: 0.8,
      cameraBeat: true,
      cameraBeatAmount: 1,
      cameraMouse: true,
      classicSpin: false,
      classicSpinSpeed: 0.3,
      bloom: true,
      bloomExtreme: true,
      bloomStrength: 0.5,
      bloomRadius: 0.9697065790898396,
      bloomThreshold: 0.19,
      chroma: true,
      chromaAmount: 0.003996850796579389,
      grain: false,
      grainAmount: 0.12811724566537983,
      vignette: true,
      vignetteAmount: 0.7248832432138457,
      dof: false,
      dofFocus: 12.397176777164006,
      dofAperture: 0.0002518988447226525,
      dofMaxBlur: 0.01424164122486095,
      glitch: false,
      glitchWild: true,
      godRays: true,
      godRaysAmount: 1.3,
      pixelate: false,
      pixelSize: 9,
      tiltShift: false,
      tiltAmount: 0.8617719704980613,
      grading: true,
      exposure: 1.285841041709212,
      contrast: 1.2255858399724102,
      saturation: 1.5652705936717801,
      hue: 0.13065812648413633,
      performance: false,
      bgColor: "#05060a",
      activePreset: null,
      slotCycleMode: false,
      slotCycleSeconds: 22,
      showBPM: true,
    },
  },
  {
    name: "Slot 3",
    settings: {
      view: "terrain",
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
      classicFullscreen: true,
      rippleFullscreen: true,
      datastreamFullscreen: true,
      nebulaFullscreen: true,
      monolithFullscreen: true,
      mandalaFullscreen: true,
      terrainFullscreen: false,
      rippleRingCount: 18,
      rippleColumns: 19,
      rippleMaxRadius: 10.9,
      rippleSpeed: 1,
      rippleAmplitude: 0.5,
      rippleWaveCycles: 0.4,
      rippleThickness: 0.45,
      rippleRotationSpeed: 0,
      rippleOpacity: 0.1,
      rippleWireframe: true,
      datastreamUsePalette: true,
      datastreamAmplitude: 1,
      datastreamItemCount: 10000,
      nebulaUsePalette: true,
      nebulaAmplitude: 1,
      nebulaDetail: 144,
      monolithUsePalette: true,
      monolithAmplitude: 1,
      monolithGridSize: 32,
      mandalaUsePalette: true,
      mandalaAmplitude: 1,
      mandalaLineCount: 12,
      mandalaLineWidth: 1,
      terrainUsePalette: true,
      terrainAmplitude: 0.75,
      terrainColumns: 256,
      comboSphereSize: 1,
      comboSphereSpinSpeed: 0.2,
      comboSphereBassPunch: 0.25,
      comboBarRadius: 4.5,
      comboBarHeightScale: 1,
      comboParticleSize: 1,
      comboLevelMeter: true,
      comboFullscreen: true,
      smoothing: 0.82,
      fftSize: 2048,
      gain: 1,
      beatSensitivity: 1.4,
      latencyOptimized: true,
      barCount: 112,
      paletteIndex: 0,
      sphereDisplacement: 0.8566941123745052,
      particleCount: 6000,
      orbitSpeed: 0.40032727522506045,
      cameraDrift: true,
      cameraDriftAmount: 0.8,
      cameraBeat: true,
      cameraBeatAmount: 1,
      cameraMouse: true,
      classicSpin: false,
      classicSpinSpeed: 0.3,
      bloom: true,
      bloomExtreme: false,
      bloomStrength: 0.17813569767410845,
      bloomRadius: 1.1782335342586248,
      bloomThreshold: 0.36606877504439916,
      chroma: true,
      chromaAmount: 0.0036617866568955603,
      grain: true,
      grainAmount: 0.5676069099851931,
      vignette: true,
      vignetteAmount: 1.25,
      dof: false,
      dofFocus: 13.486183873692216,
      dofAperture: 0.0011571856876829813,
      dofMaxBlur: 0.005851545688396055,
      glitch: false,
      glitchWild: false,
      godRays: false,
      godRaysAmount: 0.38028617062760567,
      pixelate: false,
      pixelSize: 4,
      tiltShift: false,
      tiltAmount: 0.8800698905120965,
      grading: true,
      exposure: 1.0453375039455972,
      contrast: 0.9077652269806988,
      saturation: 0.8990554937835574,
      hue: 0.16303556547640524,
      performance: true,
      bgColor: "#0d2a2a",
      activePreset: null,
      slotCycleMode: false,
      slotCycleSeconds: 22,
      showBPM: true,
    },
  },
  {
    name: "Slot 4",
    settings: {
      view: "monolith",
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
      classicFullscreen: true,
      rippleFullscreen: true,
      datastreamFullscreen: true,
      nebulaFullscreen: true,
      monolithFullscreen: false,
      mandalaFullscreen: true,
      terrainFullscreen: true,
      rippleRingCount: 18,
      rippleColumns: 19,
      rippleMaxRadius: 10.9,
      rippleSpeed: 1,
      rippleAmplitude: 1.0017408142989792,
      rippleWaveCycles: 0.4,
      rippleThickness: 0.45,
      rippleRotationSpeed: 0,
      rippleOpacity: 0.1,
      rippleWireframe: true,
      datastreamUsePalette: true,
      datastreamAmplitude: 2.7422853407392913,
      datastreamItemCount: 6000,
      nebulaUsePalette: false,
      nebulaAmplitude: 1.1024099680379322,
      nebulaDetail: 36,
      monolithUsePalette: true,
      monolithAmplitude: 0.85,
      monolithGridSize: 35,
      mandalaUsePalette: true,
      mandalaAmplitude: 1.9488661399792826,
      mandalaLineCount: 15,
      mandalaLineWidth: 3.3558010473191837,
      terrainUsePalette: true,
      terrainAmplitude: 1.9775440174913057,
      terrainColumns: 80,
      comboSphereSize: 1,
      comboSphereSpinSpeed: 0.2,
      comboSphereBassPunch: 0.25,
      comboBarRadius: 4.5,
      comboBarHeightScale: 1,
      comboParticleSize: 1,
      comboLevelMeter: true,
      comboFullscreen: true,
      smoothing: 0.82,
      fftSize: 2048,
      gain: 1,
      beatSensitivity: 1.4,
      latencyOptimized: true,
      barCount: 168,
      paletteIndex: 2,
      sphereDisplacement: 0.1609328503532775,
      particleCount: 6000,
      orbitSpeed: 0.24083078158068708,
      cameraDrift: true,
      cameraDriftAmount: 1.8,
      cameraBeat: true,
      cameraBeatAmount: 2.25,
      cameraMouse: true,
      classicSpin: false,
      classicSpinSpeed: 0.3,
      bloom: true,
      bloomExtreme: false,
      bloomStrength: 0.02,
      bloomRadius: 1.25,
      bloomThreshold: 0.06,
      chroma: true,
      chromaAmount: 0.005877583742959139,
      grain: true,
      grainAmount: 0.3897634890614775,
      vignette: true,
      vignetteAmount: 1.100688390196532,
      dof: false,
      dofFocus: 7.322388770920318,
      dofAperture: 0.0019244275660418647,
      dofMaxBlur: 0.018531114329265803,
      glitch: false,
      glitchWild: false,
      godRays: false,
      godRaysAmount: 1.1018009490980523,
      pixelate: false,
      pixelSize: 7,
      tiltShift: false,
      tiltAmount: 1.0162166873541705,
      grading: false,
      exposure: 0.8489685922350773,
      contrast: 1.1555097676822843,
      saturation: 1.2958261410115912,
      hue: 0.1766568783204942,
      performance: true,
      bgColor: "#2b1a10",
      activePreset: null,
      slotCycleMode: false,
      slotCycleSeconds: 22,
      showBPM: true,
    },
  },
  {
    name: "Slot 5",
    settings: {
      view: "datastream",
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
      classicFullscreen: true,
      rippleFullscreen: true,
      datastreamFullscreen: false,
      nebulaFullscreen: false,
      monolithFullscreen: false,
      mandalaFullscreen: false,
      terrainFullscreen: false,
      rippleRingCount: 18,
      rippleColumns: 19,
      rippleMaxRadius: 10.9,
      rippleSpeed: 1,
      rippleAmplitude: 0.5,
      rippleWaveCycles: 0.4,
      rippleThickness: 0.45,
      rippleRotationSpeed: 0,
      rippleOpacity: 0.1,
      rippleWireframe: true,
      datastreamUsePalette: true,
      datastreamAmplitude: 1,
      datastreamItemCount: 10000,
      nebulaUsePalette: true,
      nebulaAmplitude: 1,
      nebulaDetail: 144,
      monolithUsePalette: true,
      monolithAmplitude: 1,
      monolithGridSize: 32,
      mandalaUsePalette: true,
      mandalaAmplitude: 1,
      mandalaLineCount: 12,
      mandalaLineWidth: 1,
      terrainUsePalette: true,
      terrainAmplitude: 1,
      terrainColumns: 128,
      comboSphereSize: 1,
      comboSphereSpinSpeed: 0.2,
      comboSphereBassPunch: 0.25,
      comboBarRadius: 4.5,
      comboBarHeightScale: 1,
      comboParticleSize: 1,
      comboLevelMeter: true,
      comboFullscreen: false,
      smoothing: 0.82,
      fftSize: 2048,
      gain: 1,
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
      cameraBeatAmount: 1,
      cameraMouse: true,
      classicSpin: false,
      classicSpinSpeed: 0.3,
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
      godRays: true,
      godRaysAmount: 0.55,
      pixelate: false,
      pixelSize: 4,
      tiltShift: true,
      tiltAmount: 1.2,
      grading: true,
      exposure: 1.05,
      contrast: 1.1,
      saturation: 1.15,
      hue: 0,
      performance: true,
      bgColor: "#05060a",
      activePreset: null,
      slotCycleMode: false,
      slotCycleSeconds: 22,
      showBPM: true,
    },
  },
];

function normalizeSlot(seed: SlotSeed): SavedSlot {
  if (!seed) return null;
  const raw = seed.settings ?? {};
  const merged = { ...DEFAULT_SETTINGS, ...raw } as Settings;
  if (raw.rippleWaveLayers != null && raw.rippleColumns === undefined) {
    merged.rippleColumns = Math.max(1, Math.min(50, Math.round(raw.rippleWaveLayers)));
  }
  return {
    name: seed.name,
    settings: normalizeSettings(merged),
  };
}

let state: Settings = { ...DEFAULT_SETTINGS };
let slots: SavedSlot[] = Array.from(
  { length: SLOT_COUNT },
  (_, i) => normalizeSlot(DEPLOYMENT_DEFAULT_SLOTS[i] ?? null),
);
/** Shallow copy so `useSyncExternalStore` sees a new snapshot when slots change (in-place `slots[]` edits keep the same array ref). */
let slotsSnapshot: SavedSlot[] = [];
function refreshSlotsSnapshot() {
  slotsSnapshot = slots.map((s) => (s ? { name: s.name, settings: { ...s.settings } } : null));
}
const listeners = new Set<() => void>();
const slotListeners = new Set<() => void>();

if (typeof window !== "undefined") {
  try {
    const raw = localStorage.getItem(SLOTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SlotSeed[];
      if (Array.isArray(parsed)) {
        for (let i = 0; i < SLOT_COUNT; i++) {
          slots[i] = normalizeSlot(parsed[i] ?? null);
        }
      }
    }
  } catch {}
}
refreshSlotsSnapshot();

if (typeof window !== "undefined") {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Settings> & { rippleWaveLayers?: number };
      const merged = { ...DEFAULT_SETTINGS, ...parsed } as Settings;
      if (parsed.rippleWaveLayers != null && parsed.rippleColumns === undefined) {
        merged.rippleColumns = Math.max(1, Math.min(50, Math.round(parsed.rippleWaveLayers)));
      }
      state = normalizeSettings(merged);
    }
  } catch {}
}

function emit() {
  if (typeof window !== "undefined") {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  }
  listeners.forEach((l) => l());
}

export const settingsStore = {
  get: () => state,
  set: (patch: Partial<Settings>) => {
    // any manual edit clears the active preset (unless caller sets it)
    const clearPreset = !("activePreset" in patch);
    state = normalizeSettings({
      ...state,
      ...patch,
      ...(clearPreset ? { activePreset: null } : {}),
    });
    emit();
  },
  reset: () => { state = normalizeSettings({ ...DEFAULT_SETTINGS }); emit(); },
  randomize: () => {
    const r = (min: number, max: number) => min + Math.random() * (max - min);
    const b = (p = 0.5) => Math.random() < p;
    const keepRippleColumns = state.rippleColumns;
    const randomPaletteIndex = Math.floor(Math.random() * PALETTES.length);
    const selectedPalette = PALETTES[randomPaletteIndex]?.colors ?? PALETTES[0].colors;
    const useExtremeBloom = b(0.14);
    const bloomStrength = useExtremeBloom
      ? r(0.7, 2)
      : r(0.12, BLOOM_STRENGTH_MAX_NORMAL);
    state = normalizeSettings({
      ...state,
      activePreset: null,
      rippleColumns: keepRippleColumns,
      paletteIndex: randomPaletteIndex,
      sphereDisplacement: r(0.1, 1.4),
      orbitSpeed: r(0, 0.6),
      barCount: Math.round(r(48, 200) / 8) * 8,

      rippleAmplitude: r(MIN_VIEW_AMPLITUDE, 3),

      datastreamUsePalette: b(0.7),
      datastreamAmplitude: r(MIN_VIEW_AMPLITUDE, 3),
      datastreamItemCount: Math.round(r(1000, 30000) / 500) * 500,

      nebulaUsePalette: b(0.7),
      nebulaAmplitude: r(MIN_VIEW_AMPLITUDE, 3),
      nebulaDetail: Math.round(r(24, 220) / 4) * 4,

      monolithUsePalette: b(0.7),
      monolithAmplitude: r(MIN_VIEW_AMPLITUDE, 3),
      monolithGridSize: Math.round(r(2, 40)),

      mandalaUsePalette: b(0.7),
      mandalaAmplitude: r(MIN_VIEW_AMPLITUDE, 3),
      mandalaLineCount: Math.round(r(2, 48)),
      mandalaLineWidth: r(1, 8),

      terrainUsePalette: b(0.7),
      terrainAmplitude: r(MIN_VIEW_AMPLITUDE, 4),
      terrainColumns: Math.round(r(16, 256) / 8) * 8,

      bloom: true,
      bloomExtreme: useExtremeBloom,
      bloomStrength,
      bloomRadius: r(0.2, 1.2),
      bloomThreshold: r(0, 0.4),
      chroma: b(0.85), chromaAmount: r(0.0005, 0.008),
      grain: b(0.7), grainAmount: r(0.05, 0.6),
      vignette: b(0.85), vignetteAmount: r(0.7, VIGNETTE_AMOUNT_MAX),
      dof: b(0.2), dofFocus: r(4, 14), dofAperture: r(0.0001, 0.002), dofMaxBlur: r(0.002, 0.02),
      glitch: b(0.2), glitchWild: b(0.2),
      godRays: b(0.7), godRaysAmount: r(0.2, 1.2),
      pixelate: b(0.1), pixelSize: Math.round(r(2, 12)),
      tiltShift: b(0.25), tiltAmount: r(0.5, 2.5),
      grading: true, exposure: r(0.8, 1.4), contrast: r(0.9, 1.4),
      saturation: r(0.6, 1.6), hue: r(-0.2, 0.2),
      bgColor: pickRandomBgColorForPalette(selectedPalette),
    });
    emit();
  },
  applyPreset: (name: keyof typeof PRESETS) => {
    state = normalizeSettings({ ...state, ...PRESETS[name], activePreset: name as string });
    emit();
  },
  getSlots: () => slotsSnapshot,
  saveSlot: (index: number, name?: string) => {
    if (index < 0 || index >= SLOT_COUNT) return;
    slots[index] = { name: name ?? `Slot ${index + 1}`, settings: { ...state } };
    refreshSlotsSnapshot();
    persistSlots();
    slotListeners.forEach((l) => l());
  },
  loadSlot: (index: number) => {
    if (index < 0 || index >= SLOT_COUNT) return;
    const slot = slots[index];
    if (!slot) return;
    const currentCycleMode = state.slotCycleMode;
    const currentCycleSeconds = state.slotCycleSeconds;
    const raw = slot.settings as Partial<Settings> & { rippleWaveLayers?: number };
    let merged = { ...DEFAULT_SETTINGS, ...raw } as Settings;
    if (raw.rippleWaveLayers != null && raw.rippleColumns === undefined) {
      merged = { ...merged, rippleColumns: Math.max(1, Math.min(50, Math.round(raw.rippleWaveLayers))) };
    }
    state = normalizeSettings({
      ...merged,
      slotCycleMode: currentCycleMode,
      slotCycleSeconds: currentCycleSeconds,
    });
    emit();
  },
  clearSlot: (index: number) => {
    if (index < 0 || index >= SLOT_COUNT) return;
    slots[index] = null;
    refreshSlotsSnapshot();
    persistSlots();
    slotListeners.forEach((l) => l());
  },
  subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; },
  subscribeSlots: (l: () => void) => { slotListeners.add(l); return () => { slotListeners.delete(l); }; },
};

function persistSlots() {
  if (typeof window !== "undefined") {
    try { localStorage.setItem(SLOTS_KEY, JSON.stringify(slots)); } catch {}
  }
}

export function useSlots(): SavedSlot[] {
  return useSyncExternalStore(
    settingsStore.subscribeSlots,
    settingsStore.getSlots,
    settingsStore.getSlots,
  );
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    settingsStore.subscribe,
    settingsStore.get,
    settingsStore.get,
  );
}
