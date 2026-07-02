/**
 * Shared perceptual-loudness curve so every visual view responds to the same
 * normalized band/bin value with the same "feel". Before this module existed,
 * each view in scene.ts invented its own gamma exponent (or none at all —
 * plain linear response), which is why the same slider value could look loud
 * in one view and flat in another. Views should route their primary
 * amplitude-driving value through `normalizedBand()` (or `bipolarBand()` for
 * views that displace around a midpoint) instead of calling `Math.pow`
 * directly or using the raw linear value.
 *
 * Pure, allocation-free — safe to call every frame from the render hot path.
 */

/** Reference curve: matches the Classic view's original `Math.pow(v, 1.3)`. */
export const DEFAULT_GAMMA = 1.3;

export type LoudnessOpts = {
  /** Curve exponent. Lower = brighter/louder-feeling response to quiet input. */
  gamma?: number;
};

/** Maps a normalized [0,1] band/bin value to a perceptually consistent [0,1] response. */
export function normalizedBand(v: number, opts: LoudnessOpts = {}): number {
  const gamma = opts.gamma ?? DEFAULT_GAMMA;
  const clamped = v < 0 ? 0 : v > 1 ? 1 : v;
  return Math.pow(clamped, gamma);
}

/**
 * Same curve, but for views that displace around a midpoint (e.g. a particle
 * cloud where `v - 0.5` pushes points up or down). Input is a normalized
 * [0,1] value; output is a signed value in [-0.5, 0.5] with the same gamma
 * shaping applied to the magnitude on each side of the midpoint.
 */
export function bipolarBand(v: number, opts: LoudnessOpts = {}): number {
  const clamped = v < 0 ? 0 : v > 1 ? 1 : v;
  const centered = clamped - 0.5;
  const sign = centered < 0 ? -1 : 1;
  return sign * (normalizedBand(Math.abs(centered) * 2, opts) / 2);
}
