import type { AudioBands } from "./audio";

export const VISUAL_RESPONSE = { min: 0.25, max: 4, default: 1, logStep: 0.05 } as const;

export function normalizeVisualResponse(value: number): number {
  return Number.isFinite(value)
    ? Math.max(VISUAL_RESPONSE.min, Math.min(VISUAL_RESPONSE.max, value))
    : VISUAL_RESPONSE.default;
}

/** Presentation-only gain. Never modify the source consumed by tempo/onset detection. */
export class VisualResponse {
  private bins = new Uint8Array(0);

  apply(source: AudioBands, target: AudioBands, response: number): void {
    Object.assign(target, source);
    // Optional fields a source may not carry at all (the ambient source has
    // no waveform): copy them explicitly so a stale buffer is never left over
    // from the previous source.
    target.kick = source.kick;
    target.wave = source.wave;
    target.stereo = source.stereo;
    target.display = source.display;
    // Visuals follow the fast-attack spectrum when the engine provides one;
    // the detector-facing fields on `source` are left untouched.
    const shown = source.display ?? source;
    target.bass = shown.bass;
    target.mid = shown.mid;
    target.high = shown.high;
    target.centroid = shown.centroid;
    target.bins = shown.bins;
    const gain = normalizeVisualResponse(response);
    if (gain === 1) return;
    target.bass = Math.min(1, shown.bass * gain);
    target.mid = Math.min(1, shown.mid * gain);
    target.high = Math.min(1, shown.high * gain);
    target.onsetStrength = Math.min(1, source.onsetStrength * gain);
    if (this.bins.length !== shown.bins.length) this.bins = new Uint8Array(shown.bins.length);
    for (let i = 0; i < shown.bins.length; i++) {
      this.bins[i] = Math.min(255, Math.round(shown.bins[i] * gain));
    }
    target.bins = this.bins;
  }
}
