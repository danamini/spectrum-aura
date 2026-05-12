import { useSyncExternalStore } from "react";

export type ViewMode = "combo" | "classic" | "ripple";

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
    grain: true, grainAmount: 0.15, vignette: true, vignetteAmount: 1.3, dof: true,
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

function normalizeBloomForExtreme(settings: Settings): Settings {
  if (settings.bloomExtreme) return settings;
  if (settings.bloomStrength > BLOOM_STRENGTH_MAX_NORMAL) {
    return { ...settings, bloomStrength: BLOOM_STRENGTH_MAX_NORMAL };
  }
  return settings;
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
      classicFullscreen: true,
      rippleRingCount: 18,
      rippleColumns: 19,
      rippleMaxRadius: 10.9,
      rippleAmplitude: 0.5,
      rippleWaveCycles: 0.4,
      rippleThickness: 0.45,
      rippleRotationSpeed: 0,
      rippleOpacity: 0.1,
      rippleWireframe: true,
      tiltShift: true,
      performance: true,
    },
  },
  {
    name: "Slot 2",
    settings: {
      view: "classic",
      classicFullscreen: true,
      rippleRingCount: 18,
      rippleMaxRadius: 10.9,
      rippleAmplitude: 0.3,
      rippleWaveCycles: 0.4,
      rippleThickness: 0.45,
      rippleRotationSpeed: 0,
      rippleOpacity: 0.1,
      rippleWireframe: true,
      barCount: 120,
      paletteIndex: 2,
      sphereDisplacement: 1.2744294219011156,
      orbitSpeed: 0.5573645825854491,
      bloomExtreme: true,
      bloomStrength: 0.5,
      bloomRadius: 0.9697065790898396,
      bloomThreshold: 0.19,
      chromaAmount: 0.003996850796579389,
      grain: false,
      grainAmount: 0.12811724566537983,
      vignetteAmount: 0.7248832432138457,
      dofFocus: 12.397176777164006,
      dofAperture: 0.0002518988447226525,
      dofMaxBlur: 0.01424164122486095,
      glitchWild: true,
      godRaysAmount: 1.3,
      pixelSize: 9,
      tiltShift: false,
      tiltAmount: 0.8617719704980613,
      exposure: 1.285841041709212,
      contrast: 1.2255858399724102,
      saturation: 1.5652705936717801,
      hue: 0.13065812648413633,
    },
  },
  {
    name: "Slot 3",
    settings: {
      view: "ripple",
      classicFullscreen: true,
      rippleRingCount: 18,
      rippleColumns: 19,
      rippleMaxRadius: 10.9,
      rippleAmplitude: 1.1,
      rippleWaveCycles: 0.4,
      rippleThickness: 0.45,
      rippleRotationSpeed: 0,
      rippleOpacity: 0.1,
      rippleWireframe: true,
      barCount: 176,
      paletteIndex: 1,
      sphereDisplacement: 0.9964686047889756,
      orbitSpeed: 0.5192011977059071,
      bloomStrength: 0.13380514738467772,
      bloomRadius: 0.9762047393307862,
      bloomThreshold: 0.14096558408629517,
      chromaAmount: 0.0049566853877237495,
      grainAmount: 0.17724662207639846,
      vignetteAmount: 0.9003858888952909,
      dofFocus: 5.5938667825855095,
      dofAperture: 0.00020470383882703326,
      dofMaxBlur: 0.0031123565488038168,
      godRaysAmount: 0.34338425796555355,
      pixelSize: 8,
      tiltShift: false,
      tiltAmount: 2.051080060880908,
      exposure: 0.8311168887919074,
      contrast: 1.3319314014816008,
      saturation: 1.5782626270030198,
      hue: -0.06331707440542603,
      performance: true,
      bgColor: "#0c242d",
    },
  },
  {
    name: "Slot 4",
    settings: {
      view: "combo",
      classicFullscreen: true,
      rippleRingCount: 18,
      rippleMaxRadius: 10.9,
      rippleAmplitude: 0.5,
      rippleWaveCycles: 0.4,
      rippleThickness: 0.45,
      rippleRotationSpeed: 0,
      rippleOpacity: 0.1,
      rippleWireframe: true,
      tiltShift: true,
      performance: true,
    },
  },
  {
    name: "Slot 5",
    settings: {
      view: "ripple",
      classicPeakStyle: "glow",
      classicPeakColor: "#7a5cff",
      classicGridOpacity: 0.5,
      classicFullscreen: true,
      rippleRingCount: 8,
      rippleColumns: 32,
      rippleMaxRadius: 3.9,
      rippleSpeed: 0.45,
      rippleAmplitude: 3,
      rippleWaveCycles: 0.4,
      rippleThickness: 1.9,
      rippleRotationSpeed: 0,
      rippleOpacity: 0.1,
      rippleWireframe: false,
      barCount: 160,
      paletteIndex: 3,
      sphereDisplacement: 0.10585084796487848,
      orbitSpeed: 0.031352524286730056,
      cameraBeatAmount: 0.6,
      bloomStrength: 0.04,
      bloomRadius: 0.9,
      bloomThreshold: 0.34,
      chromaAmount: 0.0115,
      grain: false,
      grainAmount: 0.4625278602751279,
      vignetteAmount: 1.125254940394683,
      dof: true,
      dofFocus: 12.567088561257398,
      dofAperture: 0.0002023636285833952,
      dofMaxBlur: 0.007621570850062608,
      godRaysAmount: 1.7,
      pixelSize: 10,
      tiltShift: true,
      tiltAmount: 1.4014349718473225,
      grading: false,
      exposure: 1.1962672195889943,
      contrast: 0.9851820698988876,
      saturation: 1.5343027456694487,
      hue: 0.03577837548688448,
      bgColor: "#23292a",
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
    settings: normalizeBloomForExtreme(merged),
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
      state = normalizeBloomForExtreme(merged);
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
    state = normalizeBloomForExtreme({
      ...state,
      ...patch,
      ...(clearPreset ? { activePreset: null } : {}),
    });
    emit();
  },
  reset: () => { state = { ...DEFAULT_SETTINGS }; emit(); },
  randomize: () => {
    const r = (min: number, max: number) => min + Math.random() * (max - min);
    const b = (p = 0.5) => Math.random() < p;
    const keepRippleColumns = state.rippleColumns;
    const useExtremeBloom = b(0.14);
    const bloomStrength = useExtremeBloom
      ? r(0.7, 2)
      : r(0.12, BLOOM_STRENGTH_MAX_NORMAL);
    state = {
      ...state,
      activePreset: null,
      rippleColumns: keepRippleColumns,
      paletteIndex: Math.floor(Math.random() * PALETTES.length),
      sphereDisplacement: r(0.1, 1.4),
      orbitSpeed: r(0, 0.6),
      barCount: Math.round(r(48, 200) / 8) * 8,

      bloom: true,
      bloomExtreme: useExtremeBloom,
      bloomStrength,
      bloomRadius: r(0.2, 1.2),
      bloomThreshold: r(0, 0.4),
      chroma: b(0.85), chromaAmount: r(0.0005, 0.008),
      grain: b(0.7), grainAmount: r(0.05, 0.6),
      vignette: b(0.85), vignetteAmount: r(0.7, 1.6),
      dof: b(0.2), dofFocus: r(4, 14), dofAperture: r(0.0001, 0.002), dofMaxBlur: r(0.002, 0.02),
      glitch: b(0.2), glitchWild: b(0.2),
      godRays: b(0.7), godRaysAmount: r(0.2, 1.2),
      pixelate: b(0.1), pixelSize: Math.round(r(2, 12)),
      tiltShift: b(0.25), tiltAmount: r(0.5, 2.5),
      grading: true, exposure: r(0.8, 1.4), contrast: r(0.9, 1.4),
      saturation: r(0.6, 1.6), hue: r(-0.2, 0.2),
      bgColor: RANDOM_BG_COLORS[Math.floor(Math.random() * RANDOM_BG_COLORS.length)],
    };
    emit();
  },
  applyPreset: (name: keyof typeof PRESETS) => {
    state = { ...state, ...PRESETS[name], activePreset: name as string };
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
    state = normalizeBloomForExtreme({
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
