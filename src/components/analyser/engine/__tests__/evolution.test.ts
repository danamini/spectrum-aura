import { afterEach, describe, expect, it, vi } from "vitest";

import { EVOLUTION_TARGETS, ViewEvolutionEngine } from "../evolution";
import { createSceneUpdateOpts } from "../scene-update-opts";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("EVOLUTION_TARGETS", () => {
  const allTargetLists = Object.values(EVOLUTION_TARGETS).filter((v) => v !== undefined);

  it("only whitelists 1-3 impactful settings per view", () => {
    for (const targets of allTargetLists) {
      expect(targets.length).toBeGreaterThan(0);
      expect(targets.length).toBeLessThanOrEqual(3);
    }
  });

  it("has sane min < max bounds for every target", () => {
    for (const targets of allTargetLists) {
      for (const t of targets) {
        expect(t.min).toBeLessThan(t.max);
      }
    }
  });
});

describe("ViewEvolutionEngine", () => {
  it("does nothing when amount is 0", () => {
    const engine = new ViewEvolutionEngine();
    const opts = createSceneUpdateOpts("mandala");
    opts.mandalaAmplitude = 1;
    for (let i = 0; i < 200; i++) {
      engine.tick(opts, "mandala", { phraseJustStarted: i % 60 === 0 }, 1 / 60, 0);
    }
    expect(opts.mandalaAmplitude).toBe(1);
  });

  it("does nothing for a view with no whitelisted targets", () => {
    const engine = new ViewEvolutionEngine();
    const opts = createSceneUpdateOpts("no-such-view");
    const before = { ...opts };
    for (let i = 0; i < 10; i++) {
      engine.tick(opts, "no-such-view", { phraseJustStarted: true }, 1 / 60, 1);
    }
    expect(opts).toEqual(before);
  });

  it("drifts a whitelisted setting within its configured bounds, never past them", () => {
    const engine = new ViewEvolutionEngine();
    const opts = createSceneUpdateOpts("mandala");
    opts.mandalaAmplitude = 2;
    const target = EVOLUTION_TARGETS.mandala![0]!;

    let sawDrift = false;
    for (let i = 0; i < 600; i++) {
      engine.tick(opts, "mandala", { phraseJustStarted: i % 90 === 0 }, 1 / 60, 1);
      expect(opts.mandalaAmplitude).toBeGreaterThanOrEqual(target.min);
      expect(opts.mandalaAmplitude).toBeLessThanOrEqual(target.max);
      if (opts.mandalaAmplitude !== 2) sawDrift = true;
    }
    expect(sawDrift).toBe(true);
  });

  it("keeps the view gently in motion between waypoints (continuous wobble)", () => {
    const engine = new ViewEvolutionEngine();
    const opts = createSceneUpdateOpts("mandala");

    // Tick well past the initial waypoint ease (~5s at EASE_PER_SEC) with no
    // phrase ticks and no new waypoints — without the wobble, the value would
    // settle at the waypoint and freeze, which read as "the setting does
    // nothing" when watching the view.
    const values: number[] = [];
    for (let i = 0; i < 420; i++) {
      opts.mandalaAmplitude = 2;
      engine.tick(opts, "mandala", { phraseJustStarted: false }, 1 / 60, 1);
      if (i >= 360) values.push(opts.mandalaAmplitude);
    }
    const spread = Math.max(...values) - Math.min(...values);
    expect(spread).toBeGreaterThan(0.001);
  });

  it("advances waypoints on wall-clock when phrases never tick (no BPM sync)", () => {
    const engine = new ViewEvolutionEngine();
    const opts = createSceneUpdateOpts("mandala");
    // First tick consumes one Math.random for the initial waypoint; count
    // rolls after that. Each pseudo-phrase fallback fires every ~8s of dt and
    // a new waypoint every 3 phrases — so ~25s with no phraseJustStarted must
    // roll at least one more waypoint.
    opts.mandalaAmplitude = 2;
    engine.tick(opts, "mandala", { phraseJustStarted: false }, 1 / 60, 1);
    const randomSpy = vi.spyOn(Math, "random");
    const frames = Math.ceil(25 / (1 / 60));
    for (let i = 0; i < frames; i++) {
      opts.mandalaAmplitude = 2;
      engine.tick(opts, "mandala", { phraseJustStarted: false }, 1 / 60, 1);
    }
    expect(randomSpy).toHaveBeenCalled();
  });

  it("resets cleanly so re-enabling starts a fresh phrase count", () => {
    const engine = new ViewEvolutionEngine();
    const opts = createSceneUpdateOpts("mandala");
    opts.mandalaAmplitude = 1;
    engine.tick(opts, "mandala", { phraseJustStarted: true }, 1 / 60, 1);
    engine.reset();
    // After reset, ticking with amount 0 (as the disabled path does) must not throw
    // and must leave the base value untouched.
    opts.mandalaAmplitude = 1;
    engine.tick(opts, "mandala", { phraseJustStarted: false }, 1 / 60, 0);
    expect(opts.mandalaAmplitude).toBe(1);
  });
});
