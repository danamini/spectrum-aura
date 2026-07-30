import type { Settings } from "./settings";
import { BLOOM_STRENGTH_MAX_NORMAL, VIGNETTE_AMOUNT_MAX, VIGNETTE_AMOUNT_MIN } from "./settings";

/**
 * Web MIDI integration, split in two layers so the engine stays UI-free:
 *
 * - `parseMidiMessage` / `mapMidiEvent` — pure functions (unit-tested) that
 *   turn raw MIDI bytes into typed events and typed events into app actions.
 * - `MidiInputManager` — thin wrapper around `navigator.requestMIDIAccess`
 *   that listens on every connected input and reports typed events plus
 *   device hot-plug changes. No store or React imports; the UI layer
 *   (`hooks/useMidiControl`) decides what actions do.
 */

export type MidiEvent =
  | { type: "noteOn"; channel: number; note: number; velocity: number }
  | { type: "noteOff"; channel: number; note: number }
  | { type: "controlChange"; channel: number; controller: number; value: number };

/** Parse a raw MIDI message. Velocity/CC values are normalized to 0..1; a
 * note-on with velocity 0 is a note-off per the MIDI spec (running status). */
export function parseMidiMessage(data: ArrayLike<number> | null): MidiEvent | null {
  if (!data || data.length === 0) return null;
  const status = data[0]!;
  const d1 = data.length > 1 ? data[1]! : 0;
  const d2 = data.length > 2 ? data[2]! : 0;
  const kind = status & 0xf0;
  const channel = status & 0x0f;
  if (kind === 0x90 && d2 > 0) {
    return { type: "noteOn", channel, note: d1, velocity: d2 / 127 };
  }
  if (kind === 0x80 || (kind === 0x90 && d2 === 0)) {
    return { type: "noteOff", channel, note: d1 };
  }
  if (kind === 0xb0) {
    return { type: "controlChange", channel, controller: d1, value: d2 / 127 };
  }
  return null;
}

export type MidiAction =
  | { kind: "beatTap"; downbeat: boolean }
  | { kind: "randomVisual" }
  | { kind: "randomizeFx" }
  | { kind: "loadSlot"; index: number }
  | { kind: "setParam"; label: string; patch: Partial<Settings> };

/** Note map (any channel): pads on the bottom octaves drive performance
 * actions, C2 upward loads save slots. Documented in the panel UI. */
export const MIDI_NOTE_BEAT_TAP = 36; // C1
export const MIDI_NOTE_DOWNBEAT = 38; // D1
export const MIDI_NOTE_RANDOM_VISUAL = 40; // E1
export const MIDI_NOTE_RANDOMIZE_FX = 41; // F1
export const MIDI_NOTE_SLOT_BASE = 48; // C2 → slot 1, chromatic upward
export const MIDI_SLOT_COUNT = 10;

const lerp = (min: number, max: number, t: number) => min + (max - min) * t;

/**
 * Map a typed MIDI event to an app action. CC mappings follow General MIDI
 * knob conventions (1 = mod wheel, 7 = volume, 71/74 = filter, 91/93 = FX
 * sends) so most controllers work with their factory layout.
 */
export function mapMidiEvent(
  event: MidiEvent,
  current: Pick<Settings, "bloomExtreme">,
): MidiAction | null {
  if (event.type === "noteOff") return null;
  if (event.type === "noteOn") {
    if (event.note === MIDI_NOTE_BEAT_TAP) return { kind: "beatTap", downbeat: false };
    if (event.note === MIDI_NOTE_DOWNBEAT) return { kind: "beatTap", downbeat: true };
    if (event.note === MIDI_NOTE_RANDOM_VISUAL) return { kind: "randomVisual" };
    if (event.note === MIDI_NOTE_RANDOMIZE_FX) return { kind: "randomizeFx" };
    const slot = event.note - MIDI_NOTE_SLOT_BASE;
    if (slot >= 0 && slot < MIDI_SLOT_COUNT) return { kind: "loadSlot", index: slot };
    return null;
  }
  const v = event.value;
  switch (event.controller) {
    case 1:
      return {
        kind: "setParam",
        label: "Bloom",
        patch: { bloomStrength: v * (current.bloomExtreme ? 3 : BLOOM_STRENGTH_MAX_NORMAL) },
      };
    case 7:
      return { kind: "setParam", label: "Exposure", patch: { exposure: lerp(0.7, 1.4, v) } };
    case 71:
      return { kind: "setParam", label: "Chroma", patch: { chromaAmount: v * 0.01 } };
    case 74:
      return { kind: "setParam", label: "Hue", patch: { hue: lerp(-0.2, 0.2, v) } };
    case 91:
      return { kind: "setParam", label: "Grain", patch: { grainAmount: v * 0.6 } };
    case 93:
      return {
        kind: "setParam",
        label: "Vignette",
        patch: { vignetteAmount: lerp(VIGNETTE_AMOUNT_MIN, VIGNETTE_AMOUNT_MAX, v) },
      };
    default:
      return null;
  }
}

/** Short human label for the last-action readout in the panel. */
export function describeMidiAction(action: MidiAction): string {
  switch (action.kind) {
    case "beatTap":
      return action.downbeat ? "Downbeat" : "Beat tap";
    case "randomVisual":
      return "Random visual";
    case "randomizeFx":
      return "Randomize FX";
    case "loadSlot":
      return `Load save ${action.index + 1}`;
    case "setParam":
      return action.label;
  }
}

export function isMidiSupported(): boolean {
  return typeof navigator !== "undefined" && "requestMIDIAccess" in navigator;
}

type MidiManagerCallbacks = {
  onEvent: (event: MidiEvent) => void;
  onInputsChange: (names: string[]) => void;
  onError: (message: string) => void;
};

/** Listens on all connected MIDI inputs and follows hot-plug state changes. */
export class MidiInputManager {
  private access: MIDIAccess | null = null;
  private stopped = false;

  constructor(private readonly callbacks: MidiManagerCallbacks) {}

  async start(): Promise<void> {
    if (!isMidiSupported()) {
      this.callbacks.onError("Web MIDI is not supported in this browser");
      return;
    }
    try {
      const access = await navigator.requestMIDIAccess({ sysex: false });
      if (this.stopped) return;
      this.access = access;
      access.onstatechange = () => {
        if (!this.stopped) this.attachInputs();
      };
      this.attachInputs();
    } catch {
      this.callbacks.onError("MIDI access was denied");
    }
  }

  stop(): void {
    this.stopped = true;
    if (this.access) {
      this.access.onstatechange = null;
      for (const input of this.access.inputs.values()) input.onmidimessage = null;
      this.access = null;
    }
  }

  private attachInputs(): void {
    if (!this.access) return;
    const names: string[] = [];
    for (const input of this.access.inputs.values()) {
      names.push(input.name ?? "MIDI input");
      input.onmidimessage = (message: MIDIMessageEvent) => {
        const event = parseMidiMessage(message.data);
        if (event) this.callbacks.onEvent(event);
      };
    }
    this.callbacks.onInputsChange(names);
  }
}
