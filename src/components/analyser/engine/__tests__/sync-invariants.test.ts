import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { SongClock, MANUAL_RELEASE_STREAK } from "../song-clock";
import { ViewCycleController } from "../view-cycle-controller";
import { BEAT_MS, startAuto, tickAt } from "./helpers/song-clock.harness";

describe("sync invariants", () => {
  it("scene uses authoritative beatPhase not wall-clock session time", () => {
    const source = readFileSync(
      join(process.cwd(), "src/components/analyser/engine/scene.ts"),
      "utf8",
    );
    expect(source).toMatch(/const bpmPhase = bpmConfident \? audio\.beatPhase : 0/);
    expect(source).not.toMatch(/time \* \(audio\.bpm \/ 60\)/);
  });

  it("analyser injects song clock phase and audio onset data into tick", () => {
    const source = readFileSync(
      join(process.cwd(), "src/components/analyser/Analyser.tsx"),
      "utf8",
    );
    expect(source).toMatch(/bandsForScene/);
    expect(source).toMatch(/clockBeatPhase/);
    expect(source).toMatch(/songClockRef\.current\.tick/);
    expect(source).toMatch(/audioBeat: bands\.beat/);
    expect(source).toMatch(/hintDownbeat\(now, bands\?\.bpm/);
  });

  it("misaligned audio beats do not skip beat index during manual sync", () => {
    const clock = new SongClock();
    for (let i = 0; i < 5; i++) clock.hintBeat(i * BEAT_MS);

    const before = tickAt(clock, BEAT_MS * 3 + 100);

    for (let t = BEAT_MS * 3 + 120; t < BEAT_MS * 4; t += 30) {
      tickAt(clock, t, {
        estimatedBpm: 90,
        bpmConfidence: 0.95,
        audioBeat: true,
        onsetStrength: 0.2,
      });
    }

    const after = tickAt(clock, BEAT_MS * 3 + 350, {
      estimatedBpm: 90,
      bpmConfidence: 0.95,
      audioBeat: true,
      onsetStrength: 0.2,
    });

    expect(before.source).toBe("manual");
    expect(after.beatInPhrase).toBe(before.beatInPhrase);
  });

  it("aligned manual audio beats can release to auto mode", () => {
    const clock = new SongClock();
    for (let i = 0; i < 4; i++) clock.hintBeat(i * BEAT_MS);

    for (let i = 0; i < MANUAL_RELEASE_STREAK; i++) {
      tickAt(clock, BEAT_MS * 4 + i * BEAT_MS, {
        audioBeat: true,
        onsetStrength: 0.12,
        bpmConfidence: 0.75,
      });
    }

    expect(clock.getSource()).toBe("auto");
  });

  it("view cycle switches only on phraseJustStarted after 4 bars", () => {
    const clock = new SongClock();
    for (let i = 0; i < 4; i++) {
      tickAt(clock, 100 + i * 100, { bpmConfidence: 0.7, bpmLocked: false });
    }
    startAuto(clock, 400);
    const ctrl = new ViewCycleController();
    let switched = false;
    for (let i = 0; i <= 16; i++) {
      const barTiming = tickAt(clock, 400 + i * BEAT_MS);
      const result = ctrl.tick({
        now: 400 + i * BEAT_MS,
        barTiming,
        bpm: 120,
        enabled: true,
        viewTransitionActive: false,
      });
      if (result.shouldSwitch) switched = true;
    }
    expect(switched).toBe(true);
  });
});
