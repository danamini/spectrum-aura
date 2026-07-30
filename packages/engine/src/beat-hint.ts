export const BEAT_HINT_EVENT = "spectrum-aura:beat-hint";

export type BeatHintDetail = {
  /** When true, align to bar 1 beat 1 (downbeat). Otherwise tap the current beat. */
  downbeat?: boolean;
};

export function dispatchBeatHint(detail: BeatHintDetail = {}) {
  window.dispatchEvent(new CustomEvent(BEAT_HINT_EVENT, { detail }));
}
