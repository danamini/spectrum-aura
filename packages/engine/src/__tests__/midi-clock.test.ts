import { describe, expect, it } from "vitest";
import { MidiClockInput, parseMidiSyncMessage, MIDI_CLOCK_TIMEOUT_MS } from "../midi-clock";
import { SongClock } from "../song-clock";
const tick = (clock: SongClock, input: MidiClockInput, now: number) =>
  clock.tick({
    now,
    external: input.read(now),
    estimatedBpm: 170,
    bpmConfidence: 1,
    bpmLocked: true,
    audioBeat: true,
    onsetStrength: 1,
  });
function setup(bpm = 120) {
  const input = new MidiClockInput();
  const clock = new SongClock();
  input.select("Live");
  input.receive({ type: "start" }, "Live", 0);
  const pulse = 60000 / bpm / 24;
  for (let i = 0; i <= 24; i++) {
    input.receive({ type: "clock" }, "Live", i * pulse);
    tick(clock, input, i * pulse);
  }
  return { input, clock, pulse, now: pulse * 24 };
}
describe("MIDI clock and transport", () => {
  it("parses single-byte realtime and 14-bit song position", () => {
    expect(parseMidiSyncMessage([0xf8])).toEqual({ type: "clock" });
    expect(parseMidiSyncMessage([0xfa])).toEqual({ type: "start" });
    expect(parseMidiSyncMessage([0xfb])).toEqual({ type: "continue" });
    expect(parseMidiSyncMessage([0xfc])).toEqual({ type: "stop" });
    expect(parseMidiSyncMessage([0xf2, 1, 2])).toEqual({ type: "position", sixteenths: 257 });
    expect(parseMidiSyncMessage([0xf2, 0])).toBeNull();
    expect(parseMidiSyncMessage([0xfe])).toBeNull();
  });
  it("uses 24 pulses per quarter without octave folding or audio takeover", () => {
    for (const bpm of [45, 120, 240]) {
      const { input, clock, now } = setup(bpm);
      const timing = tick(clock, input, now);
      expect(timing.clockBpm).toBeCloseTo(bpm, 6);
      expect(timing.source).toBe("external");
      expect(timing.beatInBar).toBe(2);
      expect(timing.totalBeats).toBe(2);
      expect(timing.beatPhase).toBeCloseTo(0, 6);
    }
  });
  it("interpolates phase but cannot invent a beat while a pulse is missing", () => {
    const { input, clock, pulse, now } = setup();
    expect(tick(clock, input, now + pulse / 2).beatPhase).toBeCloseTo(1 / 48);
    expect(tick(clock, input, now + 900).totalBeats).toBe(2);
    const lost = tick(clock, input, now + MIDI_CLOCK_TIMEOUT_MS + 1);
    expect(lost.synced).toBe(false);
    expect(lost.bpmLocked).toBe(false);
    expect(lost.source).toBe("external");
    expect(lost.beatJustTicked).toBe(false);
    expect(input.read(now + MIDI_CLOCK_TIMEOUT_MS + 1).status).toBe("lost");
  });
  it("stops, continues from position, and starts again at zero", () => {
    const { input, clock, now } = setup();
    input.receive({ type: "stop" }, "Live", now + 5);
    const stopped = tick(clock, input, now + 10);
    input.receive({ type: "clock" }, "Live", now + 20);
    expect(tick(clock, input, now + 100).totalBeats).toBe(stopped.totalBeats);
    input.receive({ type: "position", sixteenths: 64 }, "Live", now + 101);
    input.receive({ type: "continue" }, "Live", now + 102);
    expect(tick(clock, input, now + 103).phraseJustStarted).toBe(false);
    input.receive({ type: "clock" }, "Live", now + 120);
    const continued = tick(clock, input, now + 120);
    expect(continued.totalBeats).toBe(17);
    expect(continued.phraseJustStarted).toBe(true);
    input.receive({ type: "start" }, "Live", now + 121);
    input.receive({ type: "clock" }, "Live", now + 140);
    expect(tick(clock, input, now + 140).totalBeats).toBe(1);
  });
  it("ignores other ports, follows tempo changes and resets after disconnect", () => {
    const { input, clock, now } = setup();
    input.receive({ type: "start" }, "other", now);
    expect(input.read(now).beat).toBe(1);
    for (let i = 1; i <= 30; i++)
      input.receive({ type: "clock" }, "Live", now + i * (60000 / 150 / 24));
    expect(input.read(1000).bpm).toBeCloseTo(150);
    input.disconnect("Live");
    expect(tick(clock, input, 1100).synced).toBe(false);
    expect(input.read(1100).status).toBe("waiting");
    input.select("");
    expect(tick(clock, input, 1100).source).toBe("auto");
  });
  it("requires fresh transport after a gap and accepts Start after a long stop", () => {
    const { input, clock } = setup();
    input.receive({ type: "clock" }, "Live", 3000);
    expect(tick(clock, input, 3000).synced).toBe(false);
    input.receive({ type: "start" }, "Live", 6000);
    for (let i = 0; i <= 24; i++) input.receive({ type: "clock" }, "Live", 6000 + (i * 500) / 24);
    expect(tick(clock, input, 6500).synced).toBe(true);
    expect(tick(clock, input, 6500).totalBeats).toBe(2);
  });
});
