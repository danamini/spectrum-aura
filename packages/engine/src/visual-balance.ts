export type FrameMetrics = {
  mean: number;
  litMean: number;
  litFraction: number;
  whiteFraction: number;
  activity: number;
};
export type BalanceStatus =
  | "settling"
  | "balanced"
  | "brightening"
  | "dimming"
  | "adding motion"
  | "quiet"
  | "limit reached";

/** Feedback is temporary: user settings and the audio detector remain untouched. */
export class VisualBalance {
  exposure = 1;
  response = 1;
  status: BalanceStatus = "settling";
  private elapsed = 0;
  private darkTime = 0;
  private brightTime = 0;
  private stillTime = 0;

  reset() {
    this.exposure = 1;
    this.response = 1;
    this.elapsed = this.darkTime = this.brightTime = this.stillTime = 0;
    this.status = "settling";
  }

  tick(frame: FrameMetrics, dt: number, energy: number, active: boolean) {
    const seconds = Math.max(0, Math.min(0.5, dt));
    this.elapsed += seconds;
    if (!active || energy < 0.008) {
      this.darkTime = this.brightTime = this.stillTime = 0;
      this.status = "quiet";
      return;
    }
    if (this.elapsed < 2) {
      this.status = "settling";
      return;
    }
    // Black backgrounds are intentional; assess visible content rather than the whole-frame mean.
    const dark = frame.litFraction > 0.015 && frame.litMean < 0.12;
    const bright = frame.whiteFraction > 0.22 || frame.mean > 0.72;
    const still = frame.activity < 0.0025 && energy > 0.025 && !bright;
    this.darkTime = dark ? this.darkTime + seconds : 0;
    this.brightTime = bright ? this.brightTime + seconds : 0;
    this.stillTime = still ? this.stillTime + seconds : 0;
    this.status = "balanced";
    if (this.brightTime >= 1) {
      this.exposure = Math.max(0.55, this.exposure * Math.exp(-seconds * 0.18));
      this.status = this.exposure <= 0.55 ? "limit reached" : "dimming";
    } else if (this.darkTime >= 2) {
      this.exposure = Math.min(1.8, this.exposure * Math.exp(seconds * 0.12));
      this.status = this.exposure >= 1.8 ? "limit reached" : "brightening";
    }
    if (this.stillTime >= 4) {
      this.response = Math.min(2, this.response * Math.exp(seconds * 0.1));
      this.status = this.response >= 2 ? "limit reached" : "adding motion";
    } else if (frame.activity > 0.012 || bright) {
      this.response += (1 - this.response) * Math.min(1, seconds * 0.15);
    }
  }
}

/** Measures the canvas only (no HUD). Brightness models the display's CSS brightness filter. */
export function measureFrame(
  pixels: Uint8ClampedArray,
  previous: Float32Array,
  brightness: number,
  hasPrevious: boolean,
): FrameMetrics {
  let sum = 0,
    litSum = 0,
    lit = 0,
    whites = 0,
    activity = 0;
  const count = pixels.length / 4;
  for (let i = 0; i < count; i++) {
    const offset = i * 4;
    const raw =
      (pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722) / 255;
    const value =
      (Math.min(255, pixels[offset] * brightness) * 0.2126 +
        Math.min(255, pixels[offset + 1] * brightness) * 0.7152 +
        Math.min(255, pixels[offset + 2] * brightness) * 0.0722) /
      255;
    sum += value;
    if (value > 0.015) {
      lit++;
      litSum += value;
    }
    if (value > 0.94) whites++;
    if (hasPrevious) activity += Math.abs(raw - previous[i]);
    previous[i] = raw;
  }
  return {
    mean: sum / count,
    litMean: lit ? litSum / lit : 0,
    litFraction: lit / count,
    whiteFraction: whites / count,
    activity: hasPrevious ? activity / count : 1,
  };
}
