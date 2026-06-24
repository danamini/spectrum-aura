import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { SongClock } from "../song-clock";
import { ViewCycleController } from "../view-cycle-controller";

const BEAT_MS = 500;

describe("sync invariants", () => {
  it("scene uses authoritative beatPhase not wall-clock session time", () => {
    const source = readFileSync(
      join(process.cwd(), "src/components/analyser/engine/scene.ts"),
      "utf8",
    );
    expect(source).toMatch(/const bpmPhase = bpmConfident \? audio\.beatPhase : 0/);
    expect(source).not.toMatch(/time \* \(audio\.bpm \/ 60\)/);
  });

  it("analyser injects song clock phase into scene bands", () => {
    const source = readFileSync(
      join(process.cwd(), "src/components/analyser/Analyser.tsx"),
      "utf8",
    );
    expect(source).toMatch(/bandsForScene/);
    expect(source).toMatch(/clockBeatPhase/);
    expect(source).toMatch(/songClockRef\.current\.tick/);
  });

  it("manual taps resist audio-driven beat drift", () => {
    const clock = new SongClock();
    for (let i = 0; i < 5; i++) clock.hintBeat(i * BEAT_MS);

    const before = clock.tick({
      now: BEAT_MS * 3 + 100,
      estimatedBpm: 90,
      bpmConfidence: 0.95,
      bpmLocked: true,
    });

    for (let t = BEAT_MS * 3 + 120; t < BEAT_MS * 4; t += 30) {
      clock.tick({
        now: t,
        estimatedBpm: 90,
        bpmConfidence: 0.95,
        bpmLocked: true,
      });
    }

    const after = clock.tick({
      now: BEAT_MS * 3 + 350,
      estimatedBpm: 90,
      bpmConfidence: 0.95,
      bpmLocked: true,
    });

    expect(before.source).toBe("manual");
    expect(after.beatInPhrase).toBe(before.beatInPhrase);
  });

  it("view cycle switches only on phraseJustStarted after 4 bars", () => {
    const clock = new SongClock();
    for (let i = 0; i < 4; i++) {
      clock.tick({ now: 100 + i * 100, estimatedBpm: 120, bpmConfidence: 0.7, bpmLocked: false });
    }
    const ctrl = new ViewCycleController();
    let switched = false;
    for (let i = 0; i <= 16; i++) {
      const barTiming = clock.tick({
        now: 400 + i * BEAT_MS,
        estimatedBpm: 120,
        bpmConfidence: 0.8,
        bpmLocked: true,
      });
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
