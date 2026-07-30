import type { BarTiming } from "./bar-clock";
import { BEATS_PER_PHRASE } from "./bar-clock";

export { BEATS_PER_BAR, BEATS_PER_PHRASE } from "./bar-clock";

export type ViewCycleTickInput = {
  now: number;
  barTiming: BarTiming;
  bpm: number;
  enabled: boolean;
  viewTransitionActive: boolean;
};

export type ViewCycleTickResult = {
  shouldSwitch: boolean;
  reason?: "phrase";
};

/**
 * Music-reactive view cycling: switches at the start of each 4-bar phrase.
 */
export class ViewCycleController {
  private lastSwitchAt = -Infinity;

  reset(): void {
    this.lastSwitchAt = -Infinity;
  }

  tick(input: ViewCycleTickInput): ViewCycleTickResult {
    if (!input.enabled || input.viewTransitionActive) {
      return { shouldSwitch: false };
    }

    const { barTiming, now, bpm } = input;
    const bpmConfident = barTiming.synced && barTiming.clockBpm > 0;
    const beatPeriodMs = bpmConfident ? 60000 / (barTiming.clockBpm || bpm) : 500;
    const phrasePeriodMs = beatPeriodMs * BEATS_PER_PHRASE;
    const minGapMs = bpmConfident ? Math.max(3200, phrasePeriodMs * 0.72) : phrasePeriodMs * 0.85;

    if (now - this.lastSwitchAt < minGapMs) {
      return { shouldSwitch: false };
    }

    const shouldSwitch = barTiming.phraseJustStarted && barTiming.totalBeats > BEATS_PER_PHRASE;

    if (shouldSwitch) {
      this.lastSwitchAt = now;
      return { shouldSwitch: true, reason: "phrase" };
    }

    return { shouldSwitch: false };
  }
}
