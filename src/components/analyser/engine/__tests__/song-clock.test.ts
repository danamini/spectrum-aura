import { describe, expect, it } from "vitest";

import {
  SongClock,
  BEATS_PER_PHRASE,
  TAP_TIMEOUT_MS,
  MANUAL_RELEASE_STREAK,
  MANUAL_REACQUIRE_AFTER_MS,
  autoBpmBlendAlpha,
} from "../song-clock";
import { BEAT_MS, startAuto, tickAt } from "./helpers/song-clock.harness";

describe("autoBpmBlendAlpha", () => {
  it("starts fast right after entering auto mode", () => {
    expect(autoBpmBlendAlpha(0)).toBeGreaterThan(0.2);
  });

  it("eases down to the steady-state rate as auto mode continues", () => {
    expect(autoBpmBlendAlpha(30)).toBeCloseTo(0.03);
    expect(autoBpmBlendAlpha(1000)).toBeCloseTo(0.03);
  });

  it("decreases monotonically between the fast start and steady state", () => {
    let prev = autoBpmBlendAlpha(0);
    for (let f = 1; f <= 30; f++) {
      const next = autoBpmBlendAlpha(f);
      expect(next).toBeLessThanOrEqual(prev);
      prev = next;
    }
  });
});

describe("SongClock", () => {
  it("converges toward a confident auto-mode BPM faster in the frames right after entering auto than steady-state 3%/frame would", () => {
    const clock = new SongClock();
    // Enter auto mode locked onto 120 BPM, then feed a steadily different 140 BPM
    // estimate for a handful of frames — the blended clockBpm should move further
    // toward 140 than a flat 3%/frame blend would in the same number of frames.
    startAuto(clock, 400);
    let lastBpm = 120;
    for (let i = 0; i < 10; i++) {
      const frame = tickAt(clock, 400 + BEAT_MS * (i + 1), {
        estimatedBpm: 140,
        bpmConfidence: 0.7,
        bpmLocked: false,
      });
      lastBpm = frame.clockBpm;
    }
    const flatBlendBpm = Array.from({ length: 10 }).reduce(
      (bpm: number) => bpm * 0.97 + 140 * 0.03,
      120,
    );
    expect(lastBpm).toBeGreaterThan(flatBlendBpm);
  });
  it("starts idle until taps or auto confidence", () => {
    const clock = new SongClock();
    const idle = tickAt(clock, 0, { bpmConfidence: 0.1, bpmLocked: false });
    expect(idle.source).toBe("idle");
    expect(idle.totalBeats).toBe(0);
  });

  it("enters auto mode after stable confidence", () => {
    const clock = new SongClock();
    startAuto(clock, 400);
    const synced = tickAt(clock, 900, { bpmConfidence: 0.7, bpmLocked: false });
    expect(synced.source).toBe("auto");
    expect(synced.synced).toBe(true);
    expect(synced.beatInPhrase).toBe(2);
  });

  it("advances beat in bar and phrase over four beats in auto mode", () => {
    const clock = new SongClock();
    startAuto(clock, 400);
    const beat1 = tickAt(clock, 400);
    const beat3 = tickAt(clock, 400 + BEAT_MS * 2);
    expect(beat1.beatInPhrase).toBe(1);
    expect(beat3.beatInBar).toBe(3);
    expect(beat3.beatInPhrase).toBe(3);

    const beat4 = tickAt(clock, 400 + BEAT_MS * 3);
    expect(beat4.beatInBar).toBe(4);
    expect(beat4.beatInPhrase).toBe(4);
  });

  it("wraps to beat 1 of bar 2 at beat 5", () => {
    const clock = new SongClock();
    startAuto(clock, 400);
    tickAt(clock, 400);
    const bar2 = tickAt(clock, 400 + BEAT_MS * 4);
    expect(bar2.beatInBar).toBe(1);
    expect(bar2.beatInPhrase).toBe(5);
    expect(bar2.barInPhrase).toBe(2);
    expect(bar2.barJustStarted).toBe(true);
  });

  it("wraps phrase at beat 17 back to 1", () => {
    const clock = new SongClock();
    startAuto(clock, 400);
    const next = tickAt(clock, 400 + BEAT_MS * BEATS_PER_PHRASE);
    expect(next.beatInPhrase).toBe(1);
    expect(next.phraseJustStarted).toBe(true);
  });

  it("aligns to downbeat on manual hint", () => {
    const clock = new SongClock();
    for (let i = 0; i < 5; i++) {
      clock.hintBeat(1000 + i * BEAT_MS);
      tickAt(clock, 1000 + i * BEAT_MS + 10);
    }
    clock.hintDownbeat(1000 + 5 * BEAT_MS);
    const timing = tickAt(clock, 1000 + 5 * BEAT_MS + 50);
    expect(timing.source).toBe("manual");
    expect(timing.beatInPhrase).toBe(1);
    expect(timing.beatInBar).toBe(1);
    expect(timing.phraseJustStarted).toBe(true);
  });

  it("downbeat resets mid-phrase grid to beat 1 immediately", () => {
    const clock = new SongClock();
    for (let i = 0; i < 8; i++) clock.hintBeat(i * BEAT_MS);
    const midPhrase = tickAt(clock, BEAT_MS * 7 + 100);
    expect(midPhrase.beatInPhrase).toBe(8);

    clock.hintDownbeat(BEAT_MS * 7 + 200);
    const down = tickAt(clock, BEAT_MS * 7 + 210);
    expect(down.beatInPhrase).toBe(1);
    expect(down.beatInBar).toBe(1);
    expect(down.phraseJustStarted).toBe(true);
  });

  it("downbeat accepts estimated BPM when taps have not learned tempo", () => {
    const clock = new SongClock();
    clock.hintDownbeat(1000, 120);
    const timing = tickAt(clock, 1050, { estimatedBpm: 120, bpmConfidence: 0.8 });
    expect(timing.beatInPhrase).toBe(1);
    expect(timing.synced).toBe(true);
    expect(clock.getClockBpm()).toBe(120);
  });

  it("releases manual mode after sustained aligned audio beats", () => {
    const clock = new SongClock();
    for (let i = 0; i < 4; i++) clock.hintBeat(i * BEAT_MS);
    expect(clock.getSource()).toBe("manual");
    expect(clock.isManualTapComplete()).toBe(true);

    for (let i = 0; i < MANUAL_RELEASE_STREAK; i++) {
      tickAt(clock, BEAT_MS * 4 + i * BEAT_MS, {
        audioBeat: true,
        onsetStrength: 0.12,
        bpmConfidence: 0.75,
      });
    }
    expect(clock.getSource()).toBe("auto");
  });

  it("drops a stale manual lock after a long silence/gap and signals a release", () => {
    const clock = new SongClock();
    for (let i = 0; i < 4; i++) clock.hintBeat(i * BEAT_MS);
    expect(clock.getSource()).toBe("manual");
    // No audioBeat overrides below — tickAt's default (audioBeat: false) simulates
    // silence: nothing ever confirms alignment, so the reacquire clock never resets.
    const stillWithinGrace = tickAt(clock, BEAT_MS * 4 + MANUAL_REACQUIRE_AFTER_MS - 500);
    expect(clock.getSource()).toBe("manual");
    expect(stillWithinGrace.bpmLocked).toBe(true);
    expect(clock.consumeManualReleaseSignal()).toBe(false);

    const afterGap = tickAt(clock, BEAT_MS * 4 + MANUAL_REACQUIRE_AFTER_MS + 500);
    expect(clock.getSource()).toBe("idle");
    expect(clock.isManualTapComplete()).toBe(false);
    expect(afterGap.bpmLocked).toBe(false);
    expect(afterGap.synced).toBe(false);

    // Edge-triggered: true exactly once, then false until the next stale release.
    expect(clock.consumeManualReleaseSignal()).toBe(true);
    expect(clock.consumeManualReleaseSignal()).toBe(false);
  });

  it("does not drop the manual lock while audio keeps confirming alignment", () => {
    const clock = new SongClock();
    for (let i = 0; i < 4; i++) clock.hintBeat(i * BEAT_MS);
    const start = BEAT_MS * 4;

    // Aligned confirmations below MANUAL_RELEASE_STREAK's confidence bar (0.68), so
    // they refresh the reacquire clock without also triggering the separate
    // release-to-auto path this file already covers above.
    let now = start;
    while (now < start + MANUAL_REACQUIRE_AFTER_MS * 2) {
      tickAt(clock, now, { audioBeat: true, onsetStrength: 0.12, bpmConfidence: 0.6 });
      now += BEAT_MS;
    }

    expect(clock.getSource()).toBe("manual");
    expect(clock.consumeManualReleaseSignal()).toBe(false);
  });

  it("re-tapping resets the reacquire grace period", () => {
    const clock = new SongClock();
    for (let i = 0; i < 4; i++) clock.hintBeat(i * BEAT_MS);
    const firstTapEnd = BEAT_MS * 4;

    tickAt(clock, firstTapEnd + MANUAL_REACQUIRE_AFTER_MS - 1000);
    clock.hintBeat(firstTapEnd + MANUAL_REACQUIRE_AFTER_MS - 1000);
    expect(clock.getSource()).toBe("manual");

    // Well past the original tap's threshold, but under MANUAL_REACQUIRE_AFTER_MS
    // since the re-tap above.
    tickAt(clock, firstTapEnd + MANUAL_REACQUIRE_AFTER_MS + 2000);
    expect(clock.getSource()).toBe("manual");
  });

  it("detects phrase change after four bars with spectral shift", () => {
    const clock = new SongClock();
    startAuto(clock, 0);
    const stable = { bass: 0.2, mid: 0.18, centroid: 0.3 };
    const shifted = { bass: 0.65, mid: 0.55, centroid: 0.72 };
    const atBeat = (beat1: number) => (beat1 - 1) * BEAT_MS + 40;

    for (let beat = 1; beat <= 17; beat++) {
      tickAt(clock, atBeat(beat), stable);
    }
    for (let beat = 18; beat <= 20; beat++) {
      tickAt(clock, atBeat(beat), shifted);
    }

    const detected = tickAt(clock, atBeat(21), {
      ...shifted,
      audioBeat: true,
      onsetStrength: 0.15,
    });

    expect(detected.phraseChangeDetected).toBe(true);
    expect(detected.beatInPhrase).toBe(1);
  });

  it("learns BPM from manual taps and holds tempo", () => {
    const clock = new SongClock();
    for (let i = 0; i < 5; i++) {
      clock.hintBeat(i * BEAT_MS);
    }
    expect(clock.getSource()).toBe("manual");
    expect(clock.getClockBpm()).toBeGreaterThanOrEqual(115);
    expect(clock.getClockBpm()).toBeLessThanOrEqual(125);

    const atBeat5 = tickAt(clock, BEAT_MS * 4);
    expect(atBeat5.beatInPhrase).toBe(5);
    expect(atBeat5.clockBpm).toBeGreaterThanOrEqual(115);
  });

  it("does not advance beats from audio after manual lock", () => {
    const clock = new SongClock();
    for (let i = 0; i < 5; i++) clock.hintBeat(i * BEAT_MS);

    const before = tickAt(clock, BEAT_MS * 3 + 100);
    const beatAtPhrase = before.beatInPhrase;

    for (let t = BEAT_MS * 3 + 120; t < BEAT_MS * 4; t += 30) {
      tickAt(clock, t, { bpmConfidence: 0.9, bpmLocked: true });
    }

    const after = tickAt(clock, BEAT_MS * 3 + 350);
    expect(after.beatInPhrase).toBe(beatAtPhrase);
    expect(after.source).toBe("manual");
  });

  it("resets tap sequence after timeout", () => {
    const clock = new SongClock();
    clock.hintBeat(0);
    clock.hintBeat(BEAT_MS);
    expect(clock.getClockBpm()).toBeGreaterThan(0);
    clock.hintBeat(TAP_TIMEOUT_MS + BEAT_MS * 2);
    expect(clock.getClockBpm()).toBe(0);
  });

  it("does not skip beats when frames arrive irregularly", () => {
    const clock = new SongClock();
    clock.hintDownbeat(0);
    const a = tickAt(clock, 200);
    clock.hintBeat(500);
    const b = tickAt(clock, 550);
    expect(a.beatInPhrase).toBe(1);
    expect(b.beatInPhrase).toBe(2);
    expect(b.beatJustTicked).toBe(true);
  });
});
