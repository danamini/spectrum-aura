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
    const gain = normalizeVisualResponse(response);
    if (gain === 1) return;
    target.bass = Math.min(1, source.bass * gain);
    target.mid = Math.min(1, source.mid * gain);
    target.high = Math.min(1, source.high * gain);
    target.onsetStrength = Math.min(1, source.onsetStrength * gain);
    if (this.bins.length !== source.bins.length) this.bins = new Uint8Array(source.bins.length);
    for (let i = 0; i < source.bins.length; i++) {
      this.bins[i] = Math.min(255, Math.round(source.bins[i] * gain));
    }
    target.bins = this.bins;
  }
}
