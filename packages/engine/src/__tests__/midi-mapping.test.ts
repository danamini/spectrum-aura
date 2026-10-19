import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../settings";
import {
  DEFAULT_MIDI_BINDINGS,
  MidiMappingRouter,
  midiBindingMatches,
  midiTargetAction,
  type MidiBinding,
} from "../midi-mapping";
import { VISUALS } from "../visuals";
const binding: MidiBinding = {
  target: "bloom",
  device: "akai",
  channel: 0,
  type: "controlChange",
  number: 20,
  min: 0,
  max: 1,
  pickup: false,
};
const cc = (value: number) => ({
  type: "controlChange" as const,
  channel: 0,
  controller: 20,
  value,
});
describe("controller mappings", () => {
  it("isolates identical messages on different devices and channels", () => {
    expect(midiBindingMatches(binding, cc(1), "akai")).toBe(true);
    expect(midiBindingMatches(binding, cc(1), "arturia")).toBe(false);
    expect(midiBindingMatches(binding, { ...cc(1), channel: 1 }, "akai")).toBe(false);
    expect(
      midiBindingMatches(
        { ...binding, device: "", channel: null },
        { ...cc(1), channel: 1 },
        "arturia",
      ),
    ).toBe(true);
  });
  it("keeps the factory instrument mappings", () => {
    const router = new MidiMappingRouter();
    const pad = DEFAULT_MIDI_BINDINGS.find((b) => b.target === "beat")!;
    expect(
      router.route(
        pad,
        { type: "noteOn", channel: 9, note: 36, velocity: 1 },
        "drums",
        DEFAULT_SETTINGS,
      ),
    ).toEqual({ kind: "beatTap", downbeat: false });
    expect(
      router.route(pad, { type: "noteOff", channel: 9, note: 36 }, "drums", DEFAULT_SETTINGS),
    ).toBeNull();
  });
  it("uses the registry for both scene selector endpoints", () => {
    expect(midiTargetAction("scene", 0, DEFAULT_SETTINGS)).toMatchObject({
      patch: { view: VISUALS[0].id },
    });
    expect(midiTargetAction("scene", 1, DEFAULT_SETTINGS)).toMatchObject({
      patch: { view: VISUALS.at(-1)!.id },
    });
  });
  it("supports narrowed and inverted ranges", () => {
    const router = new MidiMappingRouter();
    expect(
      router.route({ ...binding, min: 1, max: 0.2 }, cc(1), "akai", DEFAULT_SETTINGS),
    ).toMatchObject({ patch: { bloomStrength: expect.closeTo(0.05) } });
  });
  it("triggers CC actions once per rising edge, without firing on release", () => {
    const router = new MidiMappingRouter();
    const button = { ...binding, target: "randomVisual" };
    expect(router.route(button, cc(0), "akai", DEFAULT_SETTINGS)).toBeNull();
    expect(router.route(button, cc(1), "akai", DEFAULT_SETTINGS)).toEqual({ kind: "randomVisual" });
    expect(router.route(button, cc(1), "akai", DEFAULT_SETTINGS)).toBeNull();
    expect(router.route(button, cc(0), "akai", DEFAULT_SETTINGS)).toBeNull();
    expect(router.route(button, cc(1), "akai", DEFAULT_SETTINGS)).toEqual({ kind: "randomVisual" });
  });
  it("waits for pickup, follows after crossing, and re-arms after a preset changes", () => {
    const router = new MidiMappingRouter();
    const b = { ...binding, pickup: true };
    const settings = { ...DEFAULT_SETTINGS, bloomStrength: 0.125 };
    expect(router.route(b, cc(0.1), "akai", settings)).toBeNull();
    expect(router.route(b, cc(0.6), "akai", settings)).toMatchObject({
      patch: { bloomStrength: 0.15 },
    });
    expect(router.route(b, cc(0.7), "akai", { ...settings, bloomStrength: 0.15 })).toMatchObject({
      patch: { bloomStrength: 0.175 },
    });
    expect(router.route(b, cc(0.8), "akai", { ...settings, bloomStrength: 0.025 })).toBeNull();
  });
  it("does not repeatedly re-select a scene within the same knob segment", () => {
    expect(
      new MidiMappingRouter().route({ ...binding, target: "scene" }, cc(0), "akai", {
        ...DEFAULT_SETTINGS,
        view: VISUALS[0].id,
      }),
    ).toBeNull();
  });
});
