/**
 * Centralized design + system tokens.
 *
 * Repeated color literals, background swatches, accent glows, and local dev
 * URLs were previously scattered across `App.tsx`, `ControlPanel.tsx`,
 * `Analyser.tsx`, and `engine/audio-support.ts`. Keeping them here means a
 * visual or environment change happens in exactly one place.
 */
import type { CSSProperties } from "react";

/** Shared surface for controls over the live scene. */
export const HUD_GLASS = "bg-black/35 backdrop-blur-sm";
export const MINI_HUD_SURFACE = `${HUD_GLASS} w-[min(220px,calc(50vw-1.125rem))] min-h-[172px] rounded-lg border border-white/15 px-3 py-2`;

/** App shell / default scene background. */
export const APP_BACKGROUND = "#05060a";

/** Quick-pick scene background swatches (Scene tab). */
export const SCENE_BG_SWATCHES = [
  "#05060a",
  "#000000",
  "#0a0010",
  "#000a10",
  "#0a0800",
  "#1a0a00",
] as const;

/** Quick-pick peak-bar color swatches (Classic view). */
export const CLASSIC_PEAK_SWATCHES = [
  "#ffffff",
  "#ff2d95",
  "#00e5ff",
  "#a6ff00",
  "#ffb347",
  "#7a5cff",
] as const;

/** Emerald accent as an `r, g, b` triplet for inline `rgba()` glows. */
export const ACCENT_RGB = "52, 211, 153";

/** Local Chrome debug origin used by audio-capture guidance copy. */
export { LOCAL_DEV_URL } from "@spectrum-aura/engine/audio-support";

/**
 * Inline style for the large BPM readout: an emerald glow whose intensity and
 * opacity track detection confidence. Shared by the canvas overlay and the
 * Audio settings panel so the tempo display stays identical in both places.
 */
export function bpmGlowStyle(bpm: number, confidence: number): CSSProperties {
  return {
    textShadow:
      bpm > 0 && confidence > 0.4
        ? `0 0 ${Math.max(8, confidence * 20)}px rgba(${ACCENT_RGB}, ${confidence * 0.6})`
        : undefined,
    opacity: bpm > 0 ? 0.3 + confidence * 0.4 : 0.35,
  };
}
