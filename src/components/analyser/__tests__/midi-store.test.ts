import { installStorageMock } from "./helpers/test-helpers";
import { beforeEach, describe, expect, it } from "vitest";
import { midiStore, normalizeMidiConfig } from "../midi-store";
import { DEFAULT_MIDI_BINDINGS } from "@spectrum-aura/engine/midi-mapping";
describe("MIDI configuration", () => {
  beforeEach(() => {
    installStorageMock();
    midiStore.reset();
  });
  it("rejects malformed persisted controls and preserves an intentionally empty map", () => {
    expect(normalizeMidiConfig(null).bindings).toEqual(DEFAULT_MIDI_BINDINGS);
    expect(normalizeMidiConfig({ bindings: [null, { target: "unsafe" }] }).bindings).toEqual([]);
    expect(normalizeMidiConfig({ bindings: [] }).bindings).toEqual([]);
  });
  it("learns device-specific controls and replaces conflicts on the same device", () => {
    const binding = { ...DEFAULT_MIDI_BINDINGS[0], device: "akai", channel: 0, number: 20 };
    midiStore.learn("scene");
    midiStore.bind({ ...binding, target: "scene" });
    expect(midiStore.get().learning).toBeNull();
    midiStore.bind({ ...binding, target: "bloom" });
    expect(midiStore.get().bindings.some((b) => b.target === "scene")).toBe(false);
    midiStore.bind({ ...binding, target: "scene", device: "arturia" });
    expect(midiStore.get().bindings.filter((b) => b.number === 20)).toHaveLength(2);
    expect(JSON.parse(localStorage.getItem("spectrum-aura:midi-mapping:v1")!).bindings).toEqual(
      midiStore.get().bindings,
    );
  });
});
