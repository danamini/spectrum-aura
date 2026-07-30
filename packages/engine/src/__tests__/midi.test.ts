import { describe, expect, it } from "vitest";
import {
  MIDI_NOTE_SLOT_BASE,
  MIDI_SLOT_COUNT,
  describeMidiAction,
  mapMidiEvent,
  parseMidiMessage,
} from "../midi";

const noExtreme = { bloomExtreme: false };

describe("parseMidiMessage", () => {
  it("parses note-on with normalized velocity and channel", () => {
    expect(parseMidiMessage([0x92, 60, 127])).toEqual({
      type: "noteOn",
      channel: 2,
      note: 60,
      velocity: 1,
    });
  });

  it("treats note-on with velocity 0 as note-off (running status)", () => {
    expect(parseMidiMessage([0x90, 60, 0])).toEqual({ type: "noteOff", channel: 0, note: 60 });
    expect(parseMidiMessage([0x81, 60, 40])).toEqual({ type: "noteOff", channel: 1, note: 60 });
  });

  it("parses control change with normalized value", () => {
    expect(parseMidiMessage([0xb0, 1, 127])).toEqual({
      type: "controlChange",
      channel: 0,
      controller: 1,
      value: 1,
    });
  });

  it("ignores unhandled messages (pitch bend, aftertouch, empty)", () => {
    expect(parseMidiMessage([0xe0, 0, 64])).toBeNull();
    expect(parseMidiMessage([0xd0, 40])).toBeNull();
    expect(parseMidiMessage([])).toBeNull();
    expect(parseMidiMessage(null)).toBeNull();
  });
});

describe("mapMidiEvent notes", () => {
  const noteOn = (note: number) => ({ type: "noteOn", channel: 0, note, velocity: 0.8 }) as const;

  it("maps the performance pads", () => {
    expect(mapMidiEvent(noteOn(36), noExtreme)).toEqual({ kind: "beatTap", downbeat: false });
    expect(mapMidiEvent(noteOn(38), noExtreme)).toEqual({ kind: "beatTap", downbeat: true });
    expect(mapMidiEvent(noteOn(40), noExtreme)).toEqual({ kind: "randomVisual" });
    expect(mapMidiEvent(noteOn(41), noExtreme)).toEqual({ kind: "randomizeFx" });
  });

  it("maps C2 upward to save slots and rejects notes past the last slot", () => {
    expect(mapMidiEvent(noteOn(MIDI_NOTE_SLOT_BASE), noExtreme)).toEqual({
      kind: "loadSlot",
      index: 0,
    });
    expect(mapMidiEvent(noteOn(MIDI_NOTE_SLOT_BASE + MIDI_SLOT_COUNT - 1), noExtreme)).toEqual({
      kind: "loadSlot",
      index: MIDI_SLOT_COUNT - 1,
    });
    expect(mapMidiEvent(noteOn(MIDI_NOTE_SLOT_BASE + MIDI_SLOT_COUNT), noExtreme)).toBeNull();
  });

  it("ignores unmapped notes and note-offs", () => {
    expect(mapMidiEvent(noteOn(37), noExtreme)).toBeNull();
    expect(mapMidiEvent({ type: "noteOff", channel: 0, note: 36 }, noExtreme)).toBeNull();
  });
});

describe("mapMidiEvent control changes", () => {
  const cc = (controller: number, value: number) =>
    ({ type: "controlChange", channel: 0, controller, value }) as const;

  it("scales CC1 bloom to the normal cap unless extreme bloom is on", () => {
    expect(mapMidiEvent(cc(1, 1), noExtreme)).toEqual({
      kind: "setParam",
      label: "Bloom",
      patch: { bloomStrength: 0.25 },
    });
    expect(mapMidiEvent(cc(1, 1), { bloomExtreme: true })).toEqual({
      kind: "setParam",
      label: "Bloom",
      patch: { bloomStrength: 3 },
    });
  });

  it("maps CC74 across the full hue range", () => {
    expect(mapMidiEvent(cc(74, 0), noExtreme)?.kind).toBe("setParam");
    expect(mapMidiEvent(cc(74, 0), noExtreme)).toMatchObject({ patch: { hue: -0.2 } });
    expect(mapMidiEvent(cc(74, 1), noExtreme)).toMatchObject({ patch: { hue: 0.2 } });
  });

  it("maps CC93 within the vignette clamp range", () => {
    expect(mapMidiEvent(cc(93, 0), noExtreme)).toMatchObject({ patch: { vignetteAmount: 0.5 } });
    expect(mapMidiEvent(cc(93, 1), noExtreme)).toMatchObject({ patch: { vignetteAmount: 1.25 } });
  });

  it("ignores unmapped controllers", () => {
    expect(mapMidiEvent(cc(10, 0.5), noExtreme)).toBeNull();
  });
});

describe("describeMidiAction", () => {
  it("labels actions for the panel readout", () => {
    expect(describeMidiAction({ kind: "beatTap", downbeat: true })).toBe("Downbeat");
    expect(describeMidiAction({ kind: "loadSlot", index: 2 })).toBe("Load save 3");
    expect(describeMidiAction({ kind: "setParam", label: "Bloom", patch: {} })).toBe("Bloom");
  });
});
