import { EMPTY_BAR_TIMING, type BarTiming } from "./bar-clock";

export type LiveTempoState = {
  audioRunning: boolean;
  bpm: number;
  bpmConfidence: number;
  beat: boolean;
  barTiming: BarTiming;
  beatHintFlash: string | null;
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
