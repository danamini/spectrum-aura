import { describe, expect, it } from "vitest";

import { BEATS_PER_PHRASE, SongClock } from "../song-clock";
import { ViewCycleController } from "../view-cycle-controller";
import { BEAT_MS, startAuto, tickAt } from "./helpers/song-clock.harness";

describe("ViewCycleController", () => {
  it("does not switch when disabled", () => {
    const clock = new SongClock();
    startAuto(clock, 400);
    const ctrl = new ViewCycleController();
    for (let i = 1; i <= 4 + 1; i++) {
      const barTiming = tickAt(clock, 400 + i * BEAT_MS);
      const result = ctrl.tick({
        now: 400 + i * BEAT_MS,
        barTiming,
        bpm: 120,
        enabled: false,
        viewTransitionActive: false,
      });
      expect(result.shouldSwitch).toBe(false);
    }
  });

  it("does not switch during view transition", () => {
    const clock = new SongClock();
    startAuto(clock, 400);
    const ctrl = new ViewCycleController();
    for (let i = 1; i <= 6; i++) tickAt(clock, 400 + i * BEAT_MS);
    const barTiming = tickAt(clock, 400 + 7 * BEAT_MS);
    const result = ctrl.tick({
      now: 4000,
      barTiming,
      bpm: 120,
      enabled: true,
      viewTransitionActive: true,
    });
    expect(result.shouldSwitch).toBe(false);
  });

  it("does not switch before the first full phrase", () => {
    const clock = new SongClock();
    startAuto(clock, 400);
    const ctrl = new ViewCycleController();
    for (let i = 0; i < BEATS_PER_PHRASE; i++) {
      const barTiming = tickAt(clock, 400 + i * BEAT_MS);
      const result = ctrl.tick({
        now: 400 + i * BEAT_MS,
        barTiming,
        bpm: 120,
        enabled: true,
        viewTransitionActive: false,
      });
      expect(result.shouldSwitch).toBe(false);
    }
  });

  it("does not switch on bar 2–4 downbeats within the first phrase", () => {
    const clock = new SongClock();
    startAuto(clock, 400);
    const ctrl = new ViewCycleController();
    for (let beat = 0; beat < BEATS_PER_PHRASE; beat++) {
      const barTiming = tickAt(clock, 400 + beat * BEAT_MS);
      const result = ctrl.tick({
        now: 400 + beat * BEAT_MS,
        barTiming,
        bpm: 120,
        enabled: true,
        viewTransitionActive: false,
      });
      expect(result.shouldSwitch).toBe(false);
    }
  });

  it("switches on phraseJustStarted after 4 bars", () => {
    const clock = new SongClock();
    startAuto(clock, 400);
    const ctrl = new ViewCycleController();
    for (let i = 0; i < BEATS_PER_PHRASE; i++) {
      const barTiming = tickAt(clock, 400 + i * BEAT_MS);
      ctrl.tick({
        now: 400 + i * BEAT_MS,
        barTiming,
        bpm: 120,
        enabled: true,
        viewTransitionActive: false,
      });
    }
    const barTiming = tickAt(clock, 400 + BEATS_PER_PHRASE * BEAT_MS);
    const result = ctrl.tick({
      now: 400 + BEATS_PER_PHRASE * BEAT_MS,
      barTiming,
      bpm: 120,
      enabled: true,
      viewTransitionActive: false,
    });
    expect(result.shouldSwitch).toBe(true);
    expect(result.reason).toBe("phrase");
    expect(barTiming.phraseJustStarted).toBe(true);
    expect(barTiming.beatInPhrase).toBe(1);
  });

  it("resets cooldown state", () => {
    const clock = new SongClock();
    startAuto(clock, 400);
    const ctrl = new ViewCycleController();
    for (let i = 1; i <= 6; i++) tickAt(clock, 400 + i * BEAT_MS);
    ctrl.reset();
    const barTiming = tickAt(clock, 100);
    const result = ctrl.tick({
      now: 100,
      barTiming,
      bpm: 120,
      enabled: true,
      viewTransitionActive: false,
    });
    expect(result.shouldSwitch).toBe(false);
  });
});
