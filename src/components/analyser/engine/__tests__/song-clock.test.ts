import { describe, expect, it } from "vitest";

import { SongClock, BEATS_PER_BAR, BEATS_PER_PHRASE, TAP_TIMEOUT_MS } from "../song-clock";
import { BEAT_MS, startAuto, tickAt } from "./helpers/song-clock.harness";

describe("SongClock", () => {
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
