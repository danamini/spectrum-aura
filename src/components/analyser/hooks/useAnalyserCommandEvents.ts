import { useEffect, useRef } from "react";

const TOGGLE_STATS_PANEL_EVENT = "spectrum-aura:toggle-stats-panel";
const TOGGLE_FULLSCREEN_EVENT = "spectrum-aura:toggle-fullscreen";
const STOP_AUDIO_EVENT = "spectrum-aura:stop-audio";

export const ANALYSER_EVENTS = {
  toggleStatsPanel: TOGGLE_STATS_PANEL_EVENT,
  toggleFullscreen: TOGGLE_FULLSCREEN_EVENT,
  stopAudio: STOP_AUDIO_EVENT,
} as const;

type Handlers = {
  onToggleStatsPanel: () => void;
  onToggleStatsFullscreen: () => void;
  onToggleFullscreen: () => void;
  onStopAudio: () => void;
};

/**
 * Wires the global keyboard / custom-event commands that drive the analyser
 * overlays (stats panel `N`, fullscreen, stop-audio). Handlers are read through
 * a ref so listeners attach once and always call the latest closures.
 */
export function useAnalyserCommandEvents(handlers: Handlers) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (e.key.toLowerCase() !== "n") return;
      e.preventDefault();
      if (e.shiftKey) {
        ref.current.onToggleStatsFullscreen();
        return;
      }
      ref.current.onToggleStatsPanel();
    };
    const onToggleStatsPanel = () => ref.current.onToggleStatsPanel();
    const onToggleFullscreen = () => ref.current.onToggleFullscreen();
    const onStopAudio = () => ref.current.onStopAudio();

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(TOGGLE_STATS_PANEL_EVENT, onToggleStatsPanel);
    window.addEventListener(TOGGLE_FULLSCREEN_EVENT, onToggleFullscreen);
    window.addEventListener(STOP_AUDIO_EVENT, onStopAudio);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(TOGGLE_STATS_PANEL_EVENT, onToggleStatsPanel);
      window.removeEventListener(TOGGLE_FULLSCREEN_EVENT, onToggleFullscreen);
      window.removeEventListener(STOP_AUDIO_EVENT, onStopAudio);
    };
  }, []);
}
