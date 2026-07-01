import type { BarTiming } from "./bar-clock";
import type { SceneUpdateOpts } from "./scene-update-opts";
import type { ViewMode } from "../visuals";

export type EvolutionTarget = {
  /** SceneUpdateOpts key this target drifts — see scene-update-opts.ts. */
  key: string;
  min: number;
  max: number;
};

/**
 * Curated, deliberately small per-view whitelist of settings allowed to
 * drift under Dynamic Mode — only the ones that visibly change how big/fast
 * a view feels, so it reads as a musical, tasteful shift rather than
 * everything wobbling at once. Bounds match the sliders in ViewSettings.tsx.
 */
export const EVOLUTION_TARGETS: Partial<Record<ViewMode, EvolutionTarget[]>> = {
  combo: [
    { key: "comboSphereBassPunch", min: 0, max: 1.5 },
    { key: "orbitSpeed", min: 0, max: 1 },
  ],
  classic: [{ key: "classicSpinSpeed", min: -2, max: 2 }],
  ripple: [
    { key: "rippleAmplitude", min: 0.05, max: 3 },
    { key: "rippleSpeed", min: 0, max: 4 },
  ],
  datastream: [{ key: "datastreamAmplitude", min: 0.05, max: 3 }],
  nebula: [{ key: "nebulaAmplitude", min: 0.05, max: 3 }],
  monolith: [
    { key: "monolithAmplitude", min: 0.05, max: 3 },
    { key: "monolithBrightness", min: 0.2, max: 3 },
  ],
  mandala: [{ key: "mandalaAmplitude", min: 0.05, max: 3 }],
  terrain: [{ key: "terrainAmplitude", min: 0.05, max: 4 }],
  obsidian: [{ key: "obsidianAmplitude", min: 0.05, max: 3 }],
  torus: [
    { key: "torusAmplitude", min: 0.05, max: 3 },
    { key: "torusSpeed", min: 0.1, max: 4 },
  ],
  soundwall: [{ key: "soundwallAmplitude", min: 0.05, max: 3 }],
  geometrynebula: [
    { key: "geometrynebulaAmplitude", min: 0.05, max: 5 },
    { key: "geometrynebulaOrbitSpeed", min: 0.1, max: 2.5 },
  ],
  reztube: [
    { key: "reztubeAmplitude", min: 0.1, max: 4 },
    { key: "reztubeSpeed", min: 0.1, max: 6 },
  ],
  assetflow: [
    { key: "assetflowAmplitude", min: 0.1, max: 3 },
    { key: "assetflowMovement", min: 0.35, max: 1.8 },
  ],
};

/** New waypoint picked every this many phrases (4 bars each) — a slow "progressive slide". */
const PHRASES_PER_WAYPOINT = 3;
/** Fraction of the remaining distance to the waypoint closed per second of easing. */
const EASE_PER_SEC = 0.6;
/** Max drift as a fraction of the base value, at evolveAmount = 1. */
const MAX_OFFSET_RATIO = 0.4;

type TargetState = {
  waypointIndex: number;
  target: number; // 0..1
  current: number; // 0..1, eased toward target
};

/**
 * Drives slow, musically-quantized drift for a curated whitelist of settings
 * on the currently displayed view. Applies as a bounded +/- offset around
 * whatever value is already in `opts[key]` (written by syncSceneUpdateOpts
 * from the user's actual settings) — never reads or mutates the settings
 * store, so disabling Dynamic Mode always restores exactly what the user
 * set. Only *observes* `barTiming.phraseJustStarted`; never reads or writes
 * any SongClock authoritative state (beat index, beatPhase, epoch).
 */
export class ViewEvolutionEngine {
  private phraseCounter = 0;
  private states = new Map<string, TargetState>();

  reset(): void {
    this.phraseCounter = 0;
    this.states.clear();
  }

  tick(
    opts: SceneUpdateOpts,
    view: ViewMode,
    barTiming: Pick<BarTiming, "phraseJustStarted">,
    dt: number,
    amount: number,
  ): void {
    const targets = EVOLUTION_TARGETS[view];
    if (!targets || targets.length === 0 || amount <= 0) return;

    if (barTiming.phraseJustStarted) {
      this.phraseCounter += 1;
    }
    const waypointIndex = Math.floor(this.phraseCounter / PHRASES_PER_WAYPOINT);
    const boundedAmount = Math.max(0, Math.min(1, amount));
    const ease = Math.min(1, dt * EASE_PER_SEC);
    const numericOpts = opts as unknown as Record<string, number>;

    for (const t of targets) {
      let state = this.states.get(t.key);
      if (!state) {
        state = { waypointIndex: -1, target: 0.5, current: 0.5 };
        this.states.set(t.key, state);
      }
      if (state.waypointIndex !== waypointIndex) {
        state.waypointIndex = waypointIndex;
        state.target = Math.random();
      }
      state.current += (state.target - state.current) * ease;

      const base = numericOpts[t.key];
      if (typeof base !== "number") continue;
      const offsetFraction = (state.current - 0.5) * 2; // -1..1
      const offset = base * offsetFraction * MAX_OFFSET_RATIO * boundedAmount;
      numericOpts[t.key] = Math.max(t.min, Math.min(t.max, base + offset));
    }
  }
}
