import type { SceneUpdateOpts } from "./scene-update-opts";
import type { Settings } from "./settings";

/**
 * Dynamic Mode's ear. Listens for the moments a listener hears as "the music
 * changed" — a drop, a breakdown, a new section — and turns them into moves
 * that are visible in every view: a new camera shot, a palette step, a burst
 * of post-FX, and a scale on the view's size that follows the track's energy.
 *
 * Presentation only: it reads band levels and bar boundaries and never
 * touches SongClock state.
 */
export type DirectorEvent = "drop" | "breakdown" | null;

export type DirectorState = {
  /** Fired on the frame the change is detected, null otherwise. */
  event: DirectorEvent;
  /** 0–1 loudness relative to the track's recent peak. */
  intensity: number;
  /** 1 on a drop, decaying to 0 over about a second. */
  burst: number;
  /** 0–1, rises during a breakdown and falls when the music returns. */
  calm: number;
  /** Signed orbit multiplier for the current camera shot, eased. */
  shotOrbit: number;
  /** Camera drift multiplier for the current shot, eased. */
  shotDrift: number;
  /** Camera elevation offset for the current shot, radians. */
  shotPitch: number;
  /** Camera distance multiplier for the current shot (below 1 is closer). */
  shotZoom: number;
  /** Increments on each drop; steps the palette. */
  paletteShift: number;
};

export type DirectorInput = {
  dt: number;
  bass: number;
  mid: number;
  high: number;
  centroid: number;
  /** Kick-band level (`AudioBands.kick`). When given, it is the level the
   * director follows: breakdowns are the kick leaving, which the wide bands
   * barely register under vocals and synths. */
  kick?: number;
  barJustStarted: boolean;
  phraseJustStarted: boolean;
  /** False until the beat grid is locked; bars are then timed by wall clock. */
  synced: boolean;
  /** The song clock re-anchored bar 1 on a section start this frame
   * (`BarTiming.phraseChangeDetected`). */
  sectionStart?: boolean;
};

/** Longer than a beat at any tempo: a shorter window rides up on every kick,
 * and each kick then read as a drop. */
const FAST_SECONDS = 1.2;
const SLOW_SECONDS = 7;
const PEAK_HALF_LIFE_SECONDS = 25;
/**
 * Levels are on the analyser's decibel scale (0–1 spans 70 dB), so these are
 * differences, not ratios: 0.07 is about 5 dB. Calibrated on recorded tracks.
 */
/** A drop without a beat grid: the short-term level clears the running level by this much. */
const DROP_RISE = 0.06;
const DROP_COOLDOWN_SECONDS = 5;
/** A breakdown: the short-term level falls this far below the running level. */
const BREAKDOWN_FALL = 0.07;
const BREAKDOWN_COOLDOWN_SECONDS = 8;
/** Calm eases in from this smaller fall, and a breakdown re-arms above it. */
const CALM_FALL = 0.04;
/** Intensity runs from 1 at the recent peak to 0 this far below it (21 dB). */
const INTENSITY_SPAN = 0.3;
const FALLBACK_SHOT_SECONDS = 8;
/** No level-based events until the running level has something to compare with. */
const WARMUP_SECONDS = 4;
const BURST_DECAY_PER_SECOND = 1.1;
const SHOT_ORBITS = [0.35, 0.8, 1.3, 2.1] as const;

export class MusicDirector {
  private fast = 0;
  private slow = 0;
  private peak = 0.05;
  private primed = false;
  private sinceDrop = Infinity;
  private sinceBreakdown = Infinity;
  private sinceShot = 0;
  private inBreakdown = false;
  private elapsed = 0;
  private targetOrbit = 1;
  private targetDrift = 1;
  private targetPitch = 0;
  private targetZoom = 1;
  private readonly state: DirectorState = {
    event: null,
    intensity: 0,
    burst: 0,
    calm: 0,
    shotOrbit: 1,
    shotDrift: 1,
    shotPitch: 0,
    shotZoom: 1,
    paletteShift: 0,
  };

  constructor(private readonly random: () => number = Math.random) {}

  reset(): void {
    this.fast = 0;
    this.slow = 0;
    this.peak = 0.05;
    this.primed = false;
    this.sinceDrop = Infinity;
    this.sinceBreakdown = Infinity;
    this.sinceShot = 0;
    this.inBreakdown = false;
    this.elapsed = 0;
    this.targetOrbit = 1;
    this.targetDrift = 1;
    this.targetPitch = 0;
    this.targetZoom = 1;
    Object.assign(this.state, {
      event: null,
      intensity: 0,
      burst: 0,
      calm: 0,
      shotOrbit: 1,
      shotDrift: 1,
      shotPitch: 0,
      shotZoom: 1,
      paletteShift: 0,
    });
  }

  private newShot(reverse: boolean) {
    const speed = SHOT_ORBITS[Math.floor(this.random() * SHOT_ORBITS.length)] ?? 1;
    const direction = reverse
      ? -Math.sign(this.targetOrbit || 1)
      : Math.sign(this.targetOrbit || 1);
    this.targetOrbit = speed * direction;
    this.targetDrift = 0.5 + this.random() * 1.1;
    // A new angle and distance each shot: from low and close to high and wide.
    this.targetPitch = -0.15 + this.random() * 0.6;
    this.targetZoom = 0.72 + this.random() * 0.5;
    this.sinceShot = 0;
  }

  tick(input: DirectorInput): DirectorState {
    const dt = Math.max(0, Math.min(0.1, input.dt));
    const s = this.state;
    s.event = null;
    const level = input.kick ?? input.bass * 0.5 + input.mid * 0.35 + input.high * 0.15;

    if (!this.primed) {
      // Start level with the signal so switching Dynamic Mode on mid-song is
      // not itself read as a drop.
      this.fast = level;
      this.slow = level;
      this.primed = true;
    }
    this.fast += (level - this.fast) * Math.min(1, dt / FAST_SECONDS);
    // The running level starts as a plain average of what has been heard and
    // only then slows to its long window. Seeded from one frame it sat at
    // whatever that frame held — a kick's peak — and the track's own average
    // then read as a breakdown.
    this.elapsed += dt;
    const slowSeconds = Math.min(SLOW_SECONDS, Math.max(FAST_SECONDS, this.elapsed));
    this.slow += (level - this.slow) * Math.min(1, dt / slowSeconds);
    this.peak = Math.max(this.fast, this.peak * Math.pow(0.5, dt / PEAK_HALF_LIFE_SECONDS), 0.05);
    s.intensity = Math.max(0, Math.min(1, 1 - (this.peak - this.fast) / INTENSITY_SPAN));

    this.sinceDrop += dt;
    this.sinceBreakdown += dt;
    this.sinceShot += dt;

    const below = this.fast < this.slow - BREAKDOWN_FALL;
    const calmTarget = this.fast < this.slow - CALM_FALL ? 1 : 0;
    s.calm += (calmTarget - s.calm) * Math.min(1, dt * (calmTarget ? 1.2 : 2.5));

    // With a beat grid, a drop is whatever the song clock anchored bar 1 to:
    // one definition of a drop, judged beat by beat. Without a grid, fall
    // back to the level jump.
    const levelJump = this.fast > this.slow + DROP_RISE;
    const settled = this.elapsed >= WARMUP_SECONDS;
    const drop = input.synced ? Boolean(input.sectionStart) : levelJump && settled;
    if (this.fast > this.slow - CALM_FALL / 2) this.inBreakdown = false;
    if (drop && this.sinceDrop >= DROP_COOLDOWN_SECONDS) {
      s.event = "drop";
      this.sinceDrop = 0;
      this.inBreakdown = false;
    } else if (
      below &&
      settled &&
      !this.inBreakdown &&
      this.sinceBreakdown >= BREAKDOWN_COOLDOWN_SECONDS
    ) {
      // Once per breakdown: it re-arms only when the level has come back.
      s.event = "breakdown";
      this.sinceBreakdown = 0;
      this.inBreakdown = true;
    }

    if (s.event === "drop") s.burst = 1;
    else s.burst = Math.max(0, s.burst - dt * BURST_DECAY_PER_SECOND);
    if (s.event === "drop") s.paletteShift += 1;

    // A new shot on every musical change, and on each phrase so a steady
    // section still moves; a drop also reverses the orbit.
    if (s.event) this.newShot(s.event !== "breakdown");
    else if (input.synced ? input.phraseJustStarted : this.sinceShot >= FALLBACK_SHOT_SECONDS) {
      this.newShot(false);
    }
    const ease = Math.min(1, dt * 2.6);
    s.shotOrbit += (this.targetOrbit - s.shotOrbit) * ease;
    s.shotDrift += (this.targetDrift - s.shotDrift) * ease;
    s.shotPitch += (this.targetPitch - s.shotPitch) * ease;
    s.shotZoom += (this.targetZoom - s.shotZoom) * ease;
    return s;
  }
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Applies the director's camera shot and energy scale to this frame's scene
 * options. Works on the pooled per-frame bag only, so turning Dynamic Mode
 * off restores exactly what the user set.
 */
export function applyDirectorToScene(
  opts: SceneUpdateOpts,
  view: string,
  state: DirectorState,
  amount: number,
): void {
  const a = clamp01(amount);
  if (a <= 0) return;
  // Camera: every view honours orbit, drift and the beat kick, so the shot
  // change is visible everywhere.
  const baseOrbit = Math.max(Math.abs(opts.orbitSpeed), 0.18);
  const shotOrbit = baseOrbit * state.shotOrbit * (0.6 + state.intensity * 0.9);
  opts.orbitSpeed = Math.max(
    -2.5,
    Math.min(2.5, opts.orbitSpeed + (shotOrbit - opts.orbitSpeed) * a),
  );
  const baseDrift = opts.cameraDrift ? opts.cameraDriftAmount : 0;
  const shotDrift = Math.max(baseDrift, 0.5) * state.shotDrift * (0.5 + state.intensity);
  opts.cameraDrift = true;
  opts.cameraDriftAmount = Math.min(2.5, baseDrift + (shotDrift - baseDrift) * a);
  // The same shot expressed as offsets on the mouse camera, which is what
  // most views use by default: a steady turn, a new elevation and distance
  // per shot, and a push in on a drop.
  opts.dynamicYawRate = state.shotOrbit * (0.1 + state.intensity * 0.22) * a;
  opts.dynamicPitch = state.shotPitch * a;
  opts.dynamicZoom = 1 + (state.shotZoom - 1 - state.burst * 0.22 + state.calm * 0.12) * a;
  const baseKick = opts.cameraBeat ? opts.cameraBeatAmount : 0;
  opts.cameraBeat = true;
  opts.cameraBeatAmount = Math.min(2.5, Math.max(baseKick, 0.35 * a) + state.burst * 0.8 * a);

  // Size follows the track: bigger in loud sections and on a drop, smaller
  // through a breakdown.
  const numeric = opts as unknown as Record<string, unknown>;
  const key = `${view}Amplitude`;
  const amplitude = numeric[key];
  if (typeof amplitude === "number") {
    const scale = 1 + a * ((state.intensity - 0.5) * 0.7 + state.burst * 0.35 - state.calm * 0.3);
    numeric[key] = Math.max(0.05, amplitude * scale);
  }
}

/**
 * Writes `source` plus the director's post-FX accents into the pooled
 * `target`: a radial/chroma/glitch hit on a drop, and exposure and saturation
 * that follow the track's energy.
 */
export function applyDirectorToPostFx(
  target: Settings,
  source: Settings,
  state: DirectorState,
  amount: number,
): Settings {
  Object.assign(target, source);
  const a = clamp01(amount);
  if (a <= 0) return target;
  if (state.burst > 0.02) {
    target.radialBlur = true;
    target.radialBase = (source.radialBlur ? source.radialBase : 0) + state.burst * 0.22 * a;
    if (!source.radialBlur) target.radialKickAmount = 0;
    target.chroma = true;
    target.chromaAmount = (source.chroma ? source.chromaAmount : 0) + state.burst * 0.012 * a;
    // A short digital tear right on the hit, only at stronger settings.
    if (state.burst > 0.72 && a >= 0.6) target.glitch = true;
  }
  // The user's grade when it is on; neutral otherwise, so stored-but-disabled
  // grade values are not suddenly applied.
  const exposure = source.grading ? source.exposure : 1;
  const saturation = source.grading ? source.saturation : 1;
  target.grading = true;
  if (!source.grading) {
    target.contrast = 1;
    target.hue = 0;
  }
  target.exposure = exposure * (1 + (state.burst * 0.3 - state.calm * 0.18) * a);
  target.saturation = Math.max(
    0,
    saturation * (1 + ((state.intensity - 0.5) * 0.5 - state.calm * 0.35) * a),
  );
  return target;
}
