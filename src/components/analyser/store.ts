import { normalizeVisualResponse } from "@spectrum-aura/engine/visual-response";
import {
  TEXT_STYLE_IDS,
  isTextSourceId,
  isTextStyleId,
} from "@spectrum-aura/engine/text-sources/registry";
import { useSyncExternalStore } from "react";
import {
  BLOOM_STRENGTH_MAX_NORMAL,
  DEFAULT_WIKICHROMA_ACTOR_PACKS,
  MIN_VIEW_AMPLITUDE,
  PALETTES,
  VIGNETTE_AMOUNT_MAX,
  VIGNETTE_AMOUNT_MIN,
  WIKICHROMA_ACTOR_PACKS,
  DEFAULT_SETTINGS,
  PRESETS,
  RETRO_SYSTEMS,
  RETRO_DISPLAY_MODES,
  FX_RANDOMIZE_GROUPS,
  FX_STATEMENT_FLAGS,
  normalizeFxPipelineOrder,
  type FxLockId,
  type Settings,
  type WikichromaActorPack,
} from "@spectrum-aura/engine/settings";
import { VISUALS, getVisualOverlayBiasDefault, pickNextView } from "@spectrum-aura/engine/visuals";
import defaultSaves from "./default-saves.json";
import { isSessionKey, preserveSessionSettings, sameSavedLook } from "./saved-look";
import { presetName } from "./preset-name";

export type { ViewMode } from "@spectrum-aura/engine/visuals";
// Re-exported so existing app imports of the schema keep working.
export {
  BLOOM_STRENGTH_MAX_NORMAL,
  DEFAULT_WIKICHROMA_ACTOR_PACKS,
  MIN_VIEW_AMPLITUDE,
  PALETTES,
  VIGNETTE_AMOUNT_MAX,
  VIGNETTE_AMOUNT_MIN,
  WIKICHROMA_ACTOR_PACKS,
  DEFAULT_SETTINGS,
  PRESETS,
  RETRO_SYSTEMS,
  RETRO_DISPLAY_MODES,
  FX_RANDOMIZE_GROUPS,
  FX_PIPELINE,
  DEFAULT_FX_PIPELINE_ORDER,
} from "@spectrum-aura/engine/settings";
export type {
  FxLockId,
  FxPassId,
  Settings,
  WikichromaActorPack,
} from "@spectrum-aura/engine/settings";

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
] as const;

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "").trim();
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const v = Number.parseInt(full, 16);
  return {
    r: (v >> 16) & 255,
    g: (v >> 8) & 255,
    b: v & 255,
  };
}

function srgbToLinear(u8: number): number {
  const c = u8 / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function contrastRatio(a: string, b: string): number {
  const L1 = relativeLuminance(a);
  const L2 = relativeLuminance(b);
  const hi = Math.max(L1, L2);
  const lo = Math.min(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
}

function colorDistance(a: string, b: string): number {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const dr = A.r - B.r;
  const dg = A.g - B.g;
  const db = A.b - B.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function pickReadableRandomBackground(palette: readonly string[]): string {
  const scored = RANDOM_BG_COLORS.map((bg) => {
    let minContrast = Infinity;
    let minDistance = Infinity;
    for (const fg of palette) {
      minContrast = Math.min(minContrast, contrastRatio(bg, fg));
      minDistance = Math.min(minDistance, colorDistance(bg, fg));
    }
    return { bg, score: minContrast * 1.15 + minDistance / 140 };
  }).sort((a, b) => b.score - a.score);

  const candidates = scored.filter((s) => s.score >= scored[0]!.score * 0.82);
  const pool = candidates.length > 0 ? candidates : scored;
  return pool[Math.floor(Math.random() * pool.length)]!.bg;
}

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
    assetflowAmplitude: Math.max(MIN_VIEW_AMPLITUDE, settings.assetflowAmplitude),
    wikichromaAmplitude: Math.max(MIN_VIEW_AMPLITUDE, settings.wikichromaAmplitude),
    stagelightsAmplitude: Math.max(MIN_VIEW_AMPLITUDE, settings.stagelightsAmplitude),
    outrunAmplitude: Math.max(MIN_VIEW_AMPLITUDE, settings.outrunAmplitude),
    globeAmplitude: Math.max(MIN_VIEW_AMPLITUDE, settings.globeAmplitude),
    spectrotunnelAmplitude: Math.max(MIN_VIEW_AMPLITUDE, settings.spectrotunnelAmplitude),
    fractalAmplitude: Math.max(MIN_VIEW_AMPLITUDE, settings.fractalAmplitude),
    blackholeAmplitude: Math.max(MIN_VIEW_AMPLITUDE, settings.blackholeAmplitude),
    neoncityAmplitude: Math.max(MIN_VIEW_AMPLITUDE, settings.neoncityAmplitude),
    oceanAmplitude: Math.max(MIN_VIEW_AMPLITUDE, settings.oceanAmplitude),
    nightwoodAmplitude: Math.max(MIN_VIEW_AMPLITUDE, settings.nightwoodAmplitude),
    desertAmplitude: Math.max(MIN_VIEW_AMPLITUDE, settings.desertAmplitude),
    stationAmplitude: Math.max(MIN_VIEW_AMPLITUDE, settings.stationAmplitude),
    auroraAmplitude: Math.max(MIN_VIEW_AMPLITUDE, settings.auroraAmplitude),
    hifiAmplitude: Math.max(MIN_VIEW_AMPLITUDE, settings.hifiAmplitude),
    labAmplitude: Math.max(MIN_VIEW_AMPLITUDE, settings.labAmplitude),
    tapedeckAmplitude: Math.max(MIN_VIEW_AMPLITUDE, settings.tapedeckAmplitude),
  };
}

function normalizeVignetteAmount(settings: Settings): Settings {
  return {
    ...settings,
    vignetteAmount: Math.max(
      VIGNETTE_AMOUNT_MIN,
      Math.min(VIGNETTE_AMOUNT_MAX, settings.vignetteAmount),
    ),
  };
}

/** Filters the actor-pack multi-select to known packs (deduped, canonical
 * order) and falls back to the default single pack when nothing valid is
 * left. Returns the input array untouched when it is already canonical so
 * repeated normalization keeps a stable reference. */
function normalizeWikichromaActorPacks(packs: unknown): WikichromaActorPack[] {
  const input = Array.isArray(packs) ? packs : [];
  const valid = WIKICHROMA_ACTOR_PACKS.filter((pack) => input.includes(pack));
  if (valid.length === 0) return DEFAULT_WIKICHROMA_ACTOR_PACKS;
  if (input.length === valid.length && valid.every((pack, index) => input[index] === pack)) {
    return packs as WikichromaActorPack[];
  }
  return valid;
}

/** Pins are a contract across every look-changing flow, not just Randomize:
 * presets, save loading (incl. Play Saves rotation), and view-cycle defaults
 * must all leave a pinned group's keys exactly as the user set them. The
 * lock list itself is session state and always survives. */
function preserveLockedFx(prev: Settings, next: Settings): Settings {
  const out = { ...next, fxLocks: prev.fxLocks };
  for (const group of FX_RANDOMIZE_GROUPS) {
    if (!prev.fxLocks.includes(group.id)) continue;
    for (const key of group.keys) {
      (out as Record<string, unknown>)[key] = prev[key];
    }
  }
  return out;
}

function normalizePostFxRanges(settings: Settings): Settings {
  return {
    ...settings,
    visualResponse: normalizeVisualResponse(settings.visualResponse),
    autoBalanceEnabled:
      typeof settings.autoBalanceEnabled === "boolean"
        ? settings.autoBalanceEnabled
        : DEFAULT_SETTINGS.autoBalanceEnabled,
    assetflowIncludeShapes: Boolean(settings.assetflowIncludeShapes),
    trailDecay: Math.max(0.75, Math.min(0.99, settings.trailDecay)),
    trailInject: Math.max(0.5, Math.min(2.25, settings.trailInject)),
    trailThreshold: Math.max(0, Math.min(1, settings.trailThreshold)),
    ssaoRadius: Math.max(2, Math.min(14, settings.ssaoRadius)),
    ssaoDistance: Math.max(0.01, Math.min(0.2, settings.ssaoDistance)),
    ssaoIntensity: Math.max(0, Math.min(1, settings.ssaoIntensity)),
    radialBase: Math.max(0, Math.min(1, settings.radialBase)),
    radialKickAmount: Math.max(0, Math.min(2, settings.radialKickAmount)),
    radialZoom: Math.max(0.05, Math.min(1.2, settings.radialZoom)),
    kaleidoscopeSides: Math.max(2, Math.min(24, Math.round(settings.kaleidoscopeSides))),
    kaleidoscopeAngle: Math.max(-Math.PI, Math.min(Math.PI, settings.kaleidoscopeAngle)),
    mirrorOffset: Math.max(-0.45, Math.min(0.45, settings.mirrorOffset)),
    crtScanlineIntensity: Math.max(0, Math.min(1, settings.crtScanlineIntensity)),
    crtCurvature: Math.max(0, Math.min(0.1, settings.crtCurvature)),
    crtVignette: Math.max(0, Math.min(1, settings.crtVignette)),
    projectorFilmAmount: Math.max(0, Math.min(1.5, settings.projectorFilmAmount)),
    projectorFilmJitter: Math.max(0, Math.min(1, settings.projectorFilmJitter)),
    projectorFilmFlicker: Math.max(0, Math.min(1, settings.projectorFilmFlicker)),
    asciiCellSize: Math.max(4, Math.min(32, Math.round(settings.asciiCellSize))),
    retroSystem: RETRO_SYSTEMS.some((sys) => sys.id === settings.retroSystem)
      ? settings.retroSystem
      : "zx",
    retroMode: RETRO_DISPLAY_MODES.includes(settings.retroMode) ? settings.retroMode : "pixels",
    retroDither: Math.max(0, Math.min(1, settings.retroDither)),
    fxLocks: Array.isArray(settings.fxLocks)
      ? [
          ...new Set(
            settings.fxLocks.filter((id) => FX_RANDOMIZE_GROUPS.some((group) => group.id === id)),
          ),
        ]
      : [],
    fxPipelineOrder: normalizeFxPipelineOrder(settings.fxPipelineOrder),
    sobelStrength: Math.max(0.25, Math.min(4, settings.sobelStrength)),
    sobelThreshold: Math.max(0.01, Math.min(1, settings.sobelThreshold)),
    sobelFillMix: Math.max(0, Math.min(1, settings.sobelFillMix)),
    assetOverlayAmount: Math.max(0, Math.min(2, settings.assetOverlayAmount)),
    assetOverlaySpeed: Math.max(0.1, Math.min(3, settings.assetOverlaySpeed)),
    assetOverlayBias: (["mixed", "technical", "organic", "chaotic"] as const).includes(
      settings.assetOverlayBias,
    )
      ? settings.assetOverlayBias
      : "mixed",
    assetOverlayLocalPack: Boolean(settings.assetOverlayLocalPack),
    assetOverlayCommonsEnabled: Boolean(settings.assetOverlayCommonsEnabled),
    assetOverlayCommonsTopic: (["abstract", "technical", "organic"] as const).includes(
      settings.assetOverlayCommonsTopic,
    )
      ? settings.assetOverlayCommonsTopic
      : "abstract",
    assetflowModelScale: Math.max(0.4, Math.min(2.2, settings.assetflowModelScale)),
    assetflowSpriteAmount: Math.max(0.2, Math.min(2.5, settings.assetflowSpriteAmount)),
    assetflowModelCount: Math.max(1, Math.min(24, Math.round(settings.assetflowModelCount))),
    assetflowSpread: Math.max(2, Math.min(12, settings.assetflowSpread)),
    assetflowSpin: Math.max(0, Math.min(3, settings.assetflowSpin)),
    assetflowMovement: Math.max(0.35, Math.min(1.8, settings.assetflowMovement)),
    assetflowBackgroundDrift: Math.max(0, Math.min(3, settings.assetflowBackgroundDrift)),
    wikichromaMotionSpeed: Math.max(0.2, Math.min(3, settings.wikichromaMotionSpeed)),
    wikichromaMotionMode: (["orbit", "cogs", "runner"] as const).includes(
      settings.wikichromaMotionMode,
    )
      ? settings.wikichromaMotionMode
      : "orbit",
    wikichromaFlowStrength: Math.max(0, Math.min(2, settings.wikichromaFlowStrength)),
    wikichromaBeatsPerLoop: ([1, 2, 4] as const).includes(
      Math.round(settings.wikichromaBeatsPerLoop) as 1 | 2 | 4,
    )
      ? Math.round(settings.wikichromaBeatsPerLoop)
      : 2,
    wikichromaActorPacks: normalizeWikichromaActorPacks(settings.wikichromaActorPacks),
    stagelightsSweepSpeed: Math.max(0.2, Math.min(3, settings.stagelightsSweepSpeed)),
    // snap to odd counts (3/5/7) so there's always a true center fixture
    stagelightsFixtureCount: Math.max(
      3,
      Math.min(7, Math.round((settings.stagelightsFixtureCount - 3) / 2) * 2 + 3),
    ),
    outrunSpeed: Math.max(0.1, Math.min(4, settings.outrunSpeed)),
    globeSpinSpeed: Math.max(0, Math.min(4, settings.globeSpinSpeed)),
    spectrotunnelSpeed: Math.max(0.1, Math.min(4, settings.spectrotunnelSpeed)),
    spectrotunnelTwist: Math.max(-4, Math.min(4, settings.spectrotunnelTwist)),
    // The march budget is per-pixel GPU cost, so a saved value is never trusted past the cap.
    fractalDetail: Math.max(24, Math.min(128, Math.round(settings.fractalDetail))),
    fractalPower: Math.max(2, Math.min(12, settings.fractalPower)),
    neoncitySpeed: Math.max(0.1, Math.min(4, settings.neoncitySpeed)),
    neoncityDensity: Math.max(0.05, Math.min(1, settings.neoncityDensity)),
    oceanSpeed: Math.max(0.1, Math.min(4, settings.oceanSpeed)),
    nightwoodSpeed: Math.max(0.1, Math.min(4, settings.nightwoodSpeed)),
    nightwoodFireflies: Math.max(0, Math.min(1, settings.nightwoodFireflies)),
    desertSpeed: Math.max(0.1, Math.min(4, settings.desertSpeed)),
    stationSpeed: Math.max(0.1, Math.min(4, settings.stationSpeed)),
    auroraSpeed: Math.max(0.1, Math.min(4, settings.auroraSpeed)),
    auroraRays: Math.max(0, Math.min(1, settings.auroraRays)),
    blackholeSpin: Math.max(0.05, Math.min(4, settings.blackholeSpin)),
    blackholeTilt: Math.max(1, Math.min(60, settings.blackholeTilt)),
    blackholeDetail: Math.max(40, Math.min(120, Math.round(settings.blackholeDetail))),
    textOverlaySource: isTextSourceId(settings.textOverlaySource)
      ? settings.textOverlaySource
      : "public-domain",
    textOverlayStyle: isTextStyleId(settings.textOverlayStyle)
      ? settings.textOverlayStyle
      : "bounce",
    // Typed text is the user's own; cap it so a pasted file cannot bloat saved looks.
    textOverlayCustomText:
      typeof settings.textOverlayCustomText === "string"
        ? settings.textOverlayCustomText.slice(0, 4000)
        : "",
    textOverlayIntensity: Math.max(0, Math.min(2, settings.textOverlayIntensity)),
    textOverlayPhraseInterval: Math.max(3, Math.min(20, settings.textOverlayPhraseInterval)),
    glitchIntensity: Math.max(0, Math.min(1, settings.glitchIntensity)),
    evolveAmount: Math.max(0, Math.min(1, settings.evolveAmount)),
    backdropAmount: Number.isFinite(settings.backdropAmount)
      ? Math.max(0, Math.min(1.5, settings.backdropAmount))
      : DEFAULT_SETTINGS.backdropAmount,
    dynamicContrast: Number.isFinite(settings.dynamicContrast)
      ? Math.max(0, Math.min(1, settings.dynamicContrast))
      : DEFAULT_SETTINGS.dynamicContrast,
  };
}

function normalizeSettings(settings: Settings): Settings {
  return normalizePostFxRanges(
    normalizeVignetteAmount(normalizeAmplitudeFloor(normalizeBloomForExtreme(settings))),
  );
}

const STORAGE_KEY = "analyser-settings-v1";
const SLOTS_KEY = "analyser-slots-v1";

export type SavedSlot = {
  name: string;
  settings: Settings;
  /** Small JPEG data URL captured from the canvas at save time. */
  thumb?: string;
  savedAt?: number;
};

type SlotSeed = {
  name: string;
  settings: Partial<Settings> & { rippleWaveLayers?: number };
  thumb?: string;
  savedAt?: number;
  /** Version of the bundled list this look first shipped in (absent = 1). */
  since?: number;
} | null;

/** Bumped whenever looks are added to default-saves.json, so people who
 * already have a saved list are offered the new ones once. */
const DEFAULT_SAVES_VERSION = 3;
const DEFAULT_SAVES_VERSION_KEY = "analyser-default-saves-version";

/** Thumbnails for the bundled looks ship as files, not inline data. */
const BUNDLED_THUMB_RE = /^assets\/default-looks\/[a-z0-9-]+\.jpg$/;
const isSlotThumb = (thumb: unknown): thumb is string =>
  typeof thumb === "string" && (thumb.startsWith("data:image/") || BUNDLED_THUMB_RE.test(thumb));

/** URL to put in an `<img>` for a slot thumbnail (captured or bundled). */
export function slotThumbSrc(thumb: string): string {
  if (thumb.startsWith("data:")) return thumb;
  return `${(import.meta.env.BASE_URL || "/").replace(/\/*$/, "/")}${thumb}`;
}

const DEPLOYMENT_DEFAULT_SLOTS: SlotSeed[] = defaultSaves as SlotSeed[];
export const SLOT_COUNT = DEPLOYMENT_DEFAULT_SLOTS.filter((slot) => slot !== null).length;

function normalizeSlot(seed: SlotSeed): SavedSlot | null {
  if (!seed) return null;
  const raw = seed.settings ?? {};
  const merged = { ...DEFAULT_SETTINGS, ...raw } as Settings;
  if (raw.rippleWaveLayers != null && raw.rippleColumns === undefined) {
    merged.rippleColumns = Math.max(1, Math.min(50, Math.round(raw.rippleWaveLayers)));
  }
  return {
    name: seed.name,
    settings: normalizeSettings(merged),
    ...(isSlotThumb(seed.thumb) ? { thumb: seed.thumb } : {}),
    ...(typeof seed.savedAt === "number" ? { savedAt: seed.savedAt } : {}),
  };
}

function isSavedSlot(slot: SavedSlot | null): slot is SavedSlot {
  return slot !== null;
}

/** True while a first visit is still auto-playing the bundled presets. */
let firstVisitAutoplay = false;
let lastSavedIndex = -1;
let state: Settings = { ...DEFAULT_SETTINGS };
const slots: SavedSlot[] = DEPLOYMENT_DEFAULT_SLOTS.map((slot) => normalizeSlot(slot)).filter(
  isSavedSlot,
);
/** Shallow copy so `useSyncExternalStore` sees a new snapshot when slots change (in-place `slots[]` edits keep the same array ref). */
let slotsSnapshot: SavedSlot[] = [];
function refreshSlotsSnapshot() {
  slotsSnapshot = slots.map((slot) => ({ ...slot, settings: { ...slot.settings } }));
}
const listeners = new Set<() => void>();
const slotListeners = new Set<() => void>();

/**
 * Brings a stored save list up to date with the bundled looks without
 * touching anything the user made: looks that still match a bundled one gain
 * its thumbnail, and bundled looks added since the list was stored are
 * appended once. Returns true when the list changed.
 */
function mergeBundledLooks(
  stored: SavedSlot[],
  bundled: SavedSlot[],
  since: number[],
  storedVersion: number,
): boolean {
  let changed = false;
  bundled.forEach((look, index) => {
    const match = stored.find((slot) => sameSavedLook(slot.settings, look.settings));
    if (match) {
      if (!match.thumb && look.thumb) {
        match.thumb = look.thumb;
        changed = true;
      }
    } else if (since[index]! > storedVersion) {
      // Only looks newer than the stored list: one the user deleted stays deleted.
      stored.push(look);
      changed = true;
    }
  });
  return changed;
}

if (typeof window !== "undefined") {
  try {
    const raw = localStorage.getItem(SLOTS_KEY);
    const storedVersion = Number(localStorage.getItem(DEFAULT_SAVES_VERSION_KEY)) || 1;
    if (raw) {
      const parsed = JSON.parse(raw) as SlotSeed[];
      if (Array.isArray(parsed)) {
        const normalized = parsed.map((slot) => normalizeSlot(slot)).filter(isSavedSlot);
        const bundled = slots.slice();
        const since = DEPLOYMENT_DEFAULT_SLOTS.filter((slot) => slot !== null).map(
          (slot) => slot.since ?? 1,
        );
        const changed = mergeBundledLooks(normalized, bundled, since, storedVersion);
        slots.splice(0, slots.length, ...normalized);
        if (changed) localStorage.setItem(SLOTS_KEY, JSON.stringify(slots));
      }
    }
    if (
      storedVersion !== DEFAULT_SAVES_VERSION ||
      !localStorage.getItem(DEFAULT_SAVES_VERSION_KEY)
    ) {
      localStorage.setItem(DEFAULT_SAVES_VERSION_KEY, String(DEFAULT_SAVES_VERSION));
    }
  } catch {
    // ignore malformed saved slot state
  }
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
    } else if (slots[0]) {
      // First visit: open on the first bundled look instead of the bare
      // defaults, keeping session controls (ambient mode and the like).
      // Play through the bundled looks until the visitor takes over, so a first
      // visit shows what the app can do rather than a single scene.
      state = normalizeSettings({
        ...preserveSessionSettings(DEFAULT_SETTINGS, slots[0].settings),
        slotCycleMode: slots.length > 1,
      });
      firstVisitAutoplay = state.slotCycleMode;
    }
  } catch {
    // ignore malformed saved settings
  }
}

function emit() {
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore storage write failures
    }
  }
  listeners.forEach((l) => l());
}

export const settingsStore = {
  get: () => state,
  set: (patch: Partial<Settings>) => {
    if (firstVisitAutoplay) {
      // The first change to the picture is the visitor taking over: stop
      // playing through the presets so it is not undone a few seconds later.
      if ("slotCycleMode" in patch) firstVisitAutoplay = false;
      else if (Object.keys(patch).some((key) => !isSessionKey(key))) {
        firstVisitAutoplay = false;
        patch = { ...patch, slotCycleMode: false };
      }
    }
    if (patch.slotCycleMode === true) patch = { ...patch, viewCycleMode: false };
    else if (patch.viewCycleMode === true) patch = { ...patch, slotCycleMode: false };
    // any manual edit clears the active preset (unless caller sets it)
    const clearPreset = !("activePreset" in patch);
    // Only an actual view *switch* pulls in the visual's default overlay bias;
    // re-selecting the current view (or toggling its fullscreen variant) must
    // not clobber a bias the user chose.
    const visualDefaultBias =
      patch.view && patch.view !== state.view && !("assetOverlayBias" in patch)
        ? getVisualOverlayBiasDefault(patch.view)
        : undefined;
    state = normalizeSettings({
      ...state,
      ...patch,
      ...(visualDefaultBias ? { assetOverlayBias: visualDefaultBias } : {}),
      ...(clearPreset ? { activePreset: null } : {}),
    });
    emit();
  },
  reset: () => {
    state = normalizeSettings({ ...DEFAULT_SETTINGS });
    emit();
  },
  randomize: () => {
    if (firstVisitAutoplay) {
      firstVisitAutoplay = false;
      state = { ...state, slotCycleMode: false };
    }
    const r = (min: number, max: number) => min + Math.random() * (max - min);
    /** Midpoint-weighted sample (Bates n=3). Same bounds as `r`, but values
     * cluster around the middle of the range, so perceptual extremes — blown
     * out bright, pitch-black murky — stay possible yet rare. */
    const rb = (min: number, max: number) =>
      min + ((Math.random() + Math.random() + Math.random()) / 3) * (max - min);
    const b = (p = 0.5) => Math.random() < p;
    const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)]!;
    const keepRippleColumns = state.rippleColumns;
    const includeViewSettings = state.randomizeViewSettings;
    const assetflowActive = state.view === "assetflow";
    const paletteIndex = Math.floor(Math.random() * PALETTES.length);
    const palette = PALETTES[paletteIndex]?.colors ?? PALETTES[0].colors;
    const bgColor = pickReadableRandomBackground(palette);
    const bgLum = relativeLuminance(bgColor);
    // Reduce extreme-bloom probability on brighter backgrounds.
    const useExtremeBloom = bgLum < 0.12 && b(0.07);
    const bloomStrength = useExtremeBloom ? rb(0.45, 1.05) : rb(0.09, 0.22);
    const bloomThreshold = bgLum < 0.1 ? rb(0.12, 0.3) : rb(0.22, 0.42);
    const bloomRadius = bgLum < 0.1 ? rb(0.25, 0.9) : rb(0.2, 0.65);
    // Dark backgrounds get an exposure floor so rolls never land murky-black.
    const exposure = bgLum < 0.12 ? rb(0.9, 1.18) : rb(0.78, 1.05);
    // Whole-frame "statement" effects share one draw: at most one is active
    // per roll and each stays individually rare (50% of rolls get none).
    // Stacked kaleidoscope/mirror/pixelate is what made randomize feel extreme.
    const statementDraw = Math.random();
    const statementFx = {
      kaleidoscope: statementDraw < 0.07,
      mirrorFx: statementDraw >= 0.07 && statementDraw < 0.17,
      pixelate: statementDraw >= 0.17 && statementDraw < 0.24,
      sobelMode: statementDraw >= 0.24 && statementDraw < 0.31,
      glitch: statementDraw >= 0.31 && statementDraw < 0.43,
      ascii: statementDraw >= 0.43 && statementDraw < 0.47,
      retro: statementDraw >= 0.47 && statementDraw < 0.5,
    };
    const postFxPatch: Partial<Settings> = {
      bloom: true,
      bloomExtreme: useExtremeBloom,
      bloomStrength,
      bloomRadius,
      bloomThreshold,
      chroma: b(0.85),
      chromaAmount: rb(0.0005, 0.008),
      grain: b(0.7),
      grainAmount: rb(0.05, 0.6),
      vignette: b(0.85),
      vignetteAmount: rb(0.7, VIGNETTE_AMOUNT_MAX),
      dof: b(0.2),
      dofFocus: r(4, 14),
      dofAperture: r(0.0001, 0.002),
      dofMaxBlur: r(0.002, 0.02),
      glitch: statementFx.glitch,
      glitchWild: statementFx.glitch && b(0.2),
      glitchIntensity: rb(0.25, 1),
      lensFlare: b(0.45),
      lensFlareAmount: rb(0.2, 1.1),
      godRays: b(0.7),
      godRaysAmount: rb(0.2, 1.2),
      motionTrails: b(0.25),
      trailDecay: rb(0.86, 0.96),
      trailInject: rb(0.9, 1.5),
      trailThreshold: rb(0.04, 0.3),
      ssao: b(0.35),
      ssaoRadius: r(4, 10),
      ssaoDistance: r(0.04, 0.12),
      ssaoIntensity: rb(0.15, 0.65),
      radialBlur: b(0.4),
      radialBase: rb(0, 0.12),
      radialKickAmount: rb(0.12, 0.7),
      radialZoom: rb(0.18, 0.55),
      pixelate: statementFx.pixelate,
      pixelSize: Math.round(r(2, 12)),
      tiltShift: b(0.25),
      tiltAmount: rb(0.5, 2.5),
      kaleidoscope: statementFx.kaleidoscope,
      kaleidoscopeSides: Math.round(r(4, 12)),
      kaleidoscopeAngle: rb(-Math.PI * 0.5, Math.PI * 0.5),
      mirrorFx: statementFx.mirrorFx,
      mirrorMode: pick(["horizontal", "vertical", "quad"] as const),
      mirrorOffset: rb(-0.22, 0.22),
      crtFx: b(0.2),
      crtScanlineIntensity: rb(0.15, 0.8),
      crtCurvature: r(0.02, 0.1),
      crtVignette: rb(0.2, 0.8),
      projectorFilmFx: b(0.22),
      projectorFilmAmount: rb(0.2, 1.0),
      projectorFilmJitter: rb(0.05, 0.65),
      projectorFilmFlicker: rb(0.05, 0.65),
      asciiFx: statementFx.ascii,
      asciiCellSize: Math.round(r(7, 16)),
      asciiColored: b(0.6),
      retroFx: statementFx.retro,
      retroSystem: pick(RETRO_SYSTEMS).id,
      retroMode: pick(RETRO_DISPLAY_MODES),
      retroDither: rb(0.3, 0.9),
      retroBorder: b(0.6),
      grading: true,
      exposure,
      contrast: rb(0.95, 1.35),
      saturation: rb(0.6, 1.6),
      hue: rb(-0.2, 0.2),
      sobelMode: statementFx.sobelMode,
      sobelStrength: rb(0.9, 2.2),
      sobelThreshold: r(0.08, 0.25),
      sobelFillMix: r(0.03, 0.18),
      assetOverlayFx: assetflowActive ? true : b(0.45),
      assetOverlayAmount: rb(0.12, 1.2),
      assetOverlaySpeed: r(0.3, 2.4),
      assetOverlayBias: pick(["mixed", "technical", "organic", "chaotic"] as const),
      // Which overlay sources participate is a structural choice, not a
      // flavour to shuffle — randomize keeps the user's source mix.
      assetOverlayLocalPack: state.assetOverlayLocalPack,
      // Network opt-ins are preserved, never toggled, by randomize: a stray R
      // keypress must neither enable a network feature nor revoke an explicit
      // opt-in (same rule as textOverlayEnabled below).
      assetOverlayCommonsEnabled: state.assetOverlayCommonsEnabled,
      assetOverlayCommonsTopic: state.assetOverlayCommonsTopic,
      // textOverlayEnabled is intentionally left out of randomize — network
      // features only turn on when the user opts in explicitly, never via a
      // stray R keypress.
      textOverlaySource: state.textOverlaySource,
      textOverlayStyle: pick(TEXT_STYLE_IDS),
      textOverlayIntensity: rb(0.4, 1.8),
      textOverlayPhraseInterval: r(4, 12),
      textOverlayAllCaps: b(0.7),
      textOverlayScramble: b(0.6),
    };

    const viewPatch: Partial<Settings> = includeViewSettings
      ? {
          paletteIndex,
          bgColor,

          // global scene variation
          particleCount: Math.round(r(2000, 12000) / 500) * 500,
          sphereDisplacement: r(0.1, 1.4),
          orbitSpeed: r(0, 0.6),
          barCount: Math.round(r(48, 200) / 8) * 8,

          // combo
          comboSphereSize: r(0.2, 3),
          comboSphereBassPunch: r(0, 1.5),
          comboSphereSpinSpeed: r(-1.5, 1.5),
          comboBarRadius: r(2, 10),
          comboBarHeightScale: r(0.1, 3),
          comboParticleSize: r(0.2, 4),
          comboLevelMeter: b(0.75),
          comboWireframe: b(0.3),

          // classic
          classicSpin: b(0.4),
          classicSpinSpeed: r(-2, 2),
          classicPeakDecay: r(0.05, 3),
          classicPeakHold: r(0, 5),
          classicColorBands: b(0.8),
          classicBlocky: b(0.65),
          classicSegments: Math.round(r(4, 40)),
          classicGrid: b(0.7),
          classicGridOpacity: r(0.05, 0.45),
          classicPeakStyle: pick(["bar", "thin", "glow", "none"] as const),
          classicPeakColor: pick([...palette, "#ffffff"]),
          classicWireframe: b(0.3),

          // ripple
          rippleColumns: keepRippleColumns,
          rippleRingCount: Math.round(r(4, 120)),
          rippleMaxRadius: r(2, 14),
          rippleSpeed: r(0, 4),
          rippleAmplitude: rb(MIN_VIEW_AMPLITUDE, 3),
          rippleWaveCycles: r(0.2, 6),
          rippleThickness: r(0.2, 3),
          rippleRotationSpeed: r(-1, 1),
          rippleOpacity: r(0.1, 1),
          rippleWireframe: b(0.35),

          // datastream
          datastreamUsePalette: b(0.7),
          datastreamAmplitude: rb(MIN_VIEW_AMPLITUDE, 3),
          datastreamItemCount: Math.round(r(1000, 30000) / 500) * 500,

          // nebula
          nebulaUsePalette: b(0.7),
          nebulaAmplitude: rb(MIN_VIEW_AMPLITUDE, 3),
          nebulaDetail: Math.round(r(24, 220) / 4) * 4,
          nebulaWireframe: b(0.25),

          // monolith
          monolithUsePalette: b(0.7),
          monolithAmplitude: rb(MIN_VIEW_AMPLITUDE, 3),
          monolithBrightness: rb(0.65, 2.4),
          monolithGridSize: Math.round(r(2, 40)),
          monolithWireframe: b(0.3),

          // mandala
          mandalaUsePalette: b(0.7),
          mandalaAmplitude: rb(MIN_VIEW_AMPLITUDE, 3),
          mandalaLineCount: Math.round(r(2, 48)),
          mandalaLineWidth: r(1, 8),

          // terrain
          terrainUsePalette: b(0.7),
          terrainAmplitude: rb(MIN_VIEW_AMPLITUDE, 4),
          terrainColumns: Math.round(r(16, 256) / 8) * 8,
          terrainWireframe: b(0.65),

          // obsidian
          obsidianUsePalette: b(0.7),
          obsidianAmplitude: rb(MIN_VIEW_AMPLITUDE, 3),
          obsidianShardDetail: Math.round(r(0, 3)),

          // torus
          torusUsePalette: b(0.7),
          torusAmplitude: rb(MIN_VIEW_AMPLITUDE, 3),
          torusParticleCount: Math.round(r(200, 20000) / 200) * 200,
          torusSpeed: r(0.1, 4),
          torusCount: Math.round(r(1, 5)),
          torusSpacing: r(6, 24),
          torusSize: r(0.5, 1.8),
          torusParticleSize: r(0.01, 0.16),
          torusColorMode: pick(["shared", "individual"] as const),
          torusRotationMode: pick([
            "flat",
            "odd-upright",
            "alternating-x",
            "alternating-z",
            "fan",
          ] as const),
          torusOddUpright: b(0.5),

          // sound-wall
          soundwallUsePalette: b(0.7),
          soundwallAmplitude: rb(MIN_VIEW_AMPLITUDE, 3),
          soundwallColumns: Math.round(r(4, 40)),
          soundwallRows: Math.round(r(2, 24)),

          // geometry nebula
          geometrynebulaUsePalette: b(0.7),
          geometrynebulaAmplitude: rb(0.05, 5),
          geometrynebulaCount: Math.round(r(6, 120) / 6) * 6,
          geometrynebulaSpread: r(0.8, 3),
          geometrynebulaOrbitSpeed: r(0.1, 2.5),
          geometrynebulaSpinSpeed: r(0.1, 4),

          // rez tube
          reztubeUsePalette: b(0.6),
          reztubeAmplitude: rb(MIN_VIEW_AMPLITUDE, 3),
          reztubeSpeed: r(0.3, 4),
          reztubeTwist: r(0, 4),
          reztubeRadius: r(3, 9),
          reztubeSegments: pick([3, 4, 5, 6, 8, 10, 12] as const),

          // assetflow
          assetflowUsePalette: b(0.75),
          assetflowIncludeShapes: b(0.4),
          assetflowAmplitude: rb(MIN_VIEW_AMPLITUDE, 3),
          assetflowModelScale: r(0.6, 1.8),
          assetflowSpriteAmount: r(0.4, 2.2),
          assetflowModelCount: Math.round(r(6, 24)),
          assetflowSpread: r(3, 10),
          assetflowSpin: r(0.2, 2.8),
          assetflowMovement: r(0.45, 1.45),
          assetflowBackgroundDrift: r(0.2, 2.8),

          // wiki-chroma
          wikichromaUsePalette: b(0.75),
          wikichromaAmplitude: rb(MIN_VIEW_AMPLITUDE, 3),
          wikichromaMotionMode: pick(["orbit", "cogs", "runner"] as const),
          wikichromaMotionSpeed: r(0.25, 2.8),
          wikichromaFlowStrength: r(0.3, 1.7),
          wikichromaBeatsPerLoop: pick([1, 2, 4] as const),
          // random non-empty subset of the actor packs
          wikichromaActorPacks: (() => {
            const subset = WIKICHROMA_ACTOR_PACKS.filter(() => b(0.55));
            return subset.length > 0 ? subset : [pick(WIKICHROMA_ACTOR_PACKS)];
          })(),

          // stage lights
          stagelightsUsePalette: b(0.7),
          stagelightsAmplitude: rb(MIN_VIEW_AMPLITUDE, 3),
          stagelightsSweepSpeed: r(0.3, 2.5),
          stagelightsFixtureCount: pick([3, 5, 7] as const),
          stagelightsLasers: b(0.35),

          // outrun
          outrunUsePalette: b(0.4),
          outrunAmplitude: rb(0.4, 2.5),
          outrunSpeed: r(0.5, 2.2),
          outrunSun: b(0.85),

          // globe (live data is a network choice, never randomized)
          globeUsePalette: b(0.7),
          globeAmplitude: rb(0.4, 2.5),
          globeSpinSpeed: r(0.3, 2.5),

          // spectro-tunnel
          spectrotunnelUsePalette: b(0.7),
          spectrotunnelAmplitude: rb(0.5, 2),
          spectrotunnelSpeed: r(0.5, 2.2),
          spectrotunnelTwist: r(-2.5, 2.5),

          // fractal (detail is a GPU budget, never randomized)
          fractalUsePalette: b(0.7),
          fractalAmplitude: rb(0.4, 2),
          fractalPower: r(5, 10),

          // black hole (detail is a GPU budget, never randomized)
          blackholeUsePalette: b(0.5),
          blackholeAmplitude: rb(0.5, 2),
          blackholeSpin: r(0.4, 2.2),
          blackholeTilt: r(3, 30),

          // neon city
          neoncityUsePalette: b(0.5),
          neoncityAmplitude: rb(0.6, 2),
          neoncitySpeed: r(0.5, 2.2),
          neoncityDensity: r(0.35, 0.95),

          // ocean
          oceanUsePalette: b(0.5),
          oceanAmplitude: rb(0.5, 2),
          oceanSpeed: r(0.5, 2),
          oceanSun: b(0.85),

          // night wood
          nightwoodUsePalette: b(0.5),
          nightwoodAmplitude: rb(0.6, 2),
          nightwoodSpeed: r(0.5, 2),
          nightwoodFireflies: r(0.4, 1),

          // desert
          desertUsePalette: b(0.5),
          desertAmplitude: rb(0.5, 2.2),
          desertSpeed: r(0.5, 2.2),
          desertSun: b(0.85),

          // station
          stationUsePalette: b(0.5),
          stationAmplitude: rb(0.6, 1.8),
          stationSpeed: r(0.5, 2.4),
          stationChase: b(0.8),

          // aurora
          auroraUsePalette: b(0.5),
          auroraAmplitude: rb(0.6, 2),
          auroraSpeed: r(0.5, 2),
          auroraRays: r(0.2, 1),

          // hifi
          hifiUsePalette: b(0.3),
          hifiAmplitude: rb(0.7, 1.5),
          hifiPeakHold: b(0.85),

          // lab
          labUsePalette: b(0.4),
          labAmplitude: rb(0.7, 1.6),
          labPeaks: b(0.85),
          // tapedeck
          tapedeckUsePalette: b(0.3),
          tapedeckAmplitude: rb(0.7, 1.5),
          tapedeckPeakHold: b(0.85),
        }
      : {};

    // Locked FX groups keep their exact current state: strip their keys from
    // the roll. If a locked statement effect is currently on, suppress the
    // whole statement roll too — otherwise randomize could stack a second
    // whole-frame effect on top of the pinned one.
    const lockedKeys = new Set<string>();
    for (const group of FX_RANDOMIZE_GROUPS) {
      if (state.fxLocks.includes(group.id)) group.keys.forEach((key) => lockedKeys.add(key));
    }
    const lockedStatementOn = (
      Object.entries(FX_STATEMENT_FLAGS) as [FxLockId, keyof Settings][]
    ).some(([groupId, flag]) => state.fxLocks.includes(groupId) && Boolean(state[flag]));
    if (lockedStatementOn) {
      for (const flag of Object.values(FX_STATEMENT_FLAGS)) {
        (postFxPatch as Record<string, unknown>)[flag] = false;
      }
    }
    for (const key of lockedKeys) {
      delete (postFxPatch as Record<string, unknown>)[key];
    }

    state = normalizeSettings({
      ...state,
      activePreset: null,
      ...viewPatch,
      ...postFxPatch,
    });
    emit();
  },
  cycleRandomView: () => {
    if (VISUALS.length <= 1) return;
    const next = pickNextView(state.view, VISUALS);
    if (next === state.view) return;
    // Present the destination in its canonical 3D form. Per-view 2D flags are
    // persistent (set whenever you stop on a view's 2D variant while browsing
    // with the arrow keys) and nothing else ever clears them — so without this,
    // the auto-cycle appears to "only ever show 2D views" once enough flags
    // have accumulated in a long-lived localStorage.
    const fullscreenKey = VISUALS.find((v) => v.id === next)?.fullscreenKey as
      | keyof Settings
      | undefined;
    state = normalizeSettings(
      preserveLockedFx(state, {
        ...state,
        view: next,
        ...(getVisualOverlayBiasDefault(next)
          ? { assetOverlayBias: getVisualOverlayBiasDefault(next) }
          : {}),
        activePreset: null,
        ...(fullscreenKey ? { [fullscreenKey]: false } : {}),
      }),
    );
    emit();
    if (state.viewCycleRandomize) {
      settingsStore.randomize();
    }
  },
  applyPreset: (name: keyof typeof PRESETS) => {
    state = normalizeSettings(
      preserveLockedFx(state, { ...state, ...PRESETS[name], activePreset: name as string }),
    );
    emit();
  },
  getSlots: () => slotsSnapshot,
  getCurrentSaveIndex: () => {
    if (slots[lastSavedIndex] && sameSavedLook(state, slots[lastSavedIndex].settings))
      return lastSavedIndex;
    return slots.findIndex((slot) => sameSavedLook(state, slot.settings));
  },
  saveSlot: (index: number, name?: string) => {
    if (index < 0 || index > slots.length) return;
    const slot: SavedSlot = {
      // Saving over a preset keeps its name; a new one is named for what it shows.
      name:
        name ??
        slots[index]?.name ??
        presetName(
          state,
          slots.map((s) => s.name),
        ),
      settings: { ...state },
      savedAt: Date.now(),
    };
    if (index === slots.length) slots.push(slot);
    else slots[index] = slot;
    lastSavedIndex = index;
    refreshSlotsSnapshot();
    persistSlots();
    slotListeners.forEach((l) => l());
  },
  /** Attaches a canvas thumbnail to a just-saved slot. Separate from
   * saveSlot because captures resolve on the next rendered frame — the save
   * itself stays synchronous. */
  attachSlotThumb: (index: number, thumb: string) => {
    const slot = slots[index];
    if (!slot || !isSlotThumb(thumb)) return;
    slot.thumb = thumb;
    refreshSlotsSnapshot();
    persistSlots();
    slotListeners.forEach((l) => l());
  },
  loadSlot: (index: number) => {
    if (index < 0 || index >= slots.length) return;
    const slot = slots[index];
    const raw = slot.settings as Partial<Settings> & { rippleWaveLayers?: number };
    let merged = { ...DEFAULT_SETTINGS, ...raw } as Settings;
    if (raw.rippleWaveLayers != null && raw.rippleColumns === undefined) {
      merged = {
        ...merged,
        rippleColumns: Math.max(1, Math.min(50, Math.round(raw.rippleWaveLayers))),
      };
    }
    state = normalizeSettings(
      // Pinned FX groups survive save loading too — a pinned Retro look must
      // hold through the Play Saves rotation just like through Randomize.
      preserveLockedFx(state, preserveSessionSettings(state, merged)),
    );
    lastSavedIndex = index;
    emit();
  },
  clearSlot: (index: number) => {
    if (index < 0 || index >= slots.length) return;
    slots.splice(index, 1);
    if (slots.length < 2 && state.slotCycleMode) {
      state = { ...state, slotCycleMode: false };
      emit();
    }
    if (lastSavedIndex === index) lastSavedIndex = -1;
    else if (lastSavedIndex > index) lastSavedIndex -= 1;
    refreshSlotsSnapshot();
    persistSlots();
    slotListeners.forEach((l) => l());
  },
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  subscribeSlots: (l: () => void) => {
    slotListeners.add(l);
    return () => {
      slotListeners.delete(l);
    };
  },
};

function persistSlots() {
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(SLOTS_KEY, JSON.stringify(slots));
    } catch {
      // ignore storage write failures
    }
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
  return useSyncExternalStore(settingsStore.subscribe, settingsStore.get, settingsStore.get);
}

// The settings store is a module-level singleton holding live state that the
// render loop closes over. A hot update that re-evaluates this module splits
// the world in two — the panel writes to a fresh store instance while the
// running rAF loop keeps reading the old one, so toggles (post FX, etc.)
// silently stop working until a manual refresh. Force a clean full reload
// whenever a hot update reaches this module instead.
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    window.location.reload();
  });
}
