import { EMPTY_BAR_TIMING, type BarTiming } from "./bar-clock";

/** A structural moment the engine detected in the music. `atMs` is on the
 * `performance.now()` clock, so a display can show it for a fixed time. */
export type SectionEvent = { kind: "drop" | "breakdown"; atMs: number };

export type LiveTempoState = {
  audioRunning: boolean;
  bpm: number;
  bpmConfidence: number;
  beat: boolean;
  barTiming: BarTiming;
  beatHintFlash: string | null;
  /** The most recent drop or breakdown, kept until the next one. */
  sectionEvent?: SectionEvent | null;
};

export const LIVE_TEMPO_EVENT = "spectrum-aura:live-tempo";

export const EMPTY_LIVE_TEMPO: LiveTempoState = {
  audioRunning: false,
  bpm: 0,
  bpmConfidence: 0,
  beat: false,
  barTiming: EMPTY_BAR_TIMING,
  beatHintFlash: null,
};

let liveTempoFrame: LiveTempoState = EMPTY_LIVE_TEMPO;

/** Written every render frame; read by HUD for smooth 60fps display. */
export function setLiveTempoFrame(state: LiveTempoState): void {
  liveTempoFrame = state;
}

export function getLiveTempoFrame(): LiveTempoState {
  return liveTempoFrame;
}

export function dispatchLiveTempo(state: LiveTempoState) {
  setLiveTempoFrame(state);
  window.dispatchEvent(new CustomEvent(LIVE_TEMPO_EVENT, { detail: state }));
}
