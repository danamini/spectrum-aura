import {
  MIDI_NOTE_BEAT_TAP,
  MIDI_NOTE_DOWNBEAT,
  MIDI_NOTE_RANDOM_VISUAL,
  MIDI_NOTE_RANDOMIZE_FX,
  MIDI_NOTE_SLOT_BASE,
  MIDI_SLOT_COUNT,
  mapMidiEvent,
  type MidiAction,
  type MidiEvent,
} from "./midi";
import type { Settings } from "./settings";
import { VISUALS } from "./visuals";

export const MIDI_TARGETS = [
  { id: "scene", label: "Scene", continuous: true },
  { id: "bloom", label: "Bloom", continuous: true, cc: 1 },
  { id: "exposure", label: "Exposure", continuous: true, cc: 7 },
  { id: "chroma", label: "Chroma", continuous: true, cc: 71 },
  { id: "hue", label: "Hue", continuous: true, cc: 74 },
  { id: "grain", label: "Grain", continuous: true, cc: 91 },
  { id: "vignette", label: "Vignette", continuous: true, cc: 93 },
  { id: "glitch", label: "Glitch intensity", continuous: true },
  { id: "beat", label: "Beat tap", continuous: false, note: MIDI_NOTE_BEAT_TAP },
  { id: "downbeat", label: "Downbeat", continuous: false, note: MIDI_NOTE_DOWNBEAT },
  { id: "randomVisual", label: "Random visual", continuous: false, note: MIDI_NOTE_RANDOM_VISUAL },
  { id: "randomFx", label: "Randomize FX", continuous: false, note: MIDI_NOTE_RANDOMIZE_FX },
  ...Array.from({ length: MIDI_SLOT_COUNT }, (_, i) => ({
    id: `slot${i}`,
    label: `Load save ${i + 1}`,
    continuous: false,
    note: MIDI_NOTE_SLOT_BASE + i,
  })),
];
export type MidiBinding = {
  target: string;
  device: string;
  channel: number | null;
  type: "noteOn" | "controlChange";
  number: number;
  min: number;
  max: number;
  pickup: boolean;
};
export const DEFAULT_MIDI_BINDINGS: MidiBinding[] = MIDI_TARGETS.flatMap((target) => {
  const number = "cc" in target ? target.cc : "note" in target ? target.note : undefined;
  return typeof number === "number"
    ? [
        {
          target: target.id,
          device: "",
          channel: null,
          type: "cc" in target ? ("controlChange" as const) : ("noteOn" as const),
          number,
          min: 0,
          max: 1,
          pickup: false,
        },
      ]
    : [];
});
export function midiBindingMatches(
  binding: MidiBinding,
  event: MidiEvent,
  device: string,
): boolean {
  return (
    event.type === binding.type &&
    (!binding.device || binding.device === device) &&
    (binding.channel === null || binding.channel === event.channel) &&
    binding.number === (event.type === "controlChange" ? event.controller : event.note)
  );
}
export function midiTargetAction(
  targetId: string,
  value: number,
  current: Settings,
): MidiAction | null {
  const target = MIDI_TARGETS.find((item) => item.id === targetId);
  if (!target) return null;
  const v = Math.max(0, Math.min(1, value));
  if (target.id === "scene") {
    const visual = VISUALS[Math.min(VISUALS.length - 1, Math.floor(v * VISUALS.length))];
    return visual ? { kind: "setParam", label: visual.label, patch: { view: visual.id } } : null;
  }
  if (target.id === "glitch")
    return {
      kind: "setParam",
      label: "Glitch intensity",
      patch: { glitch: v > 0, glitchIntensity: v },
    };
  if ("cc" in target && typeof target.cc === "number")
    return mapMidiEvent(
      { type: "controlChange", channel: 0, controller: target.cc, value: v },
      current,
    );
  if ("note" in target && typeof target.note === "number")
    return mapMidiEvent({ type: "noteOn", channel: 0, note: target.note, velocity: 1 }, current);
  return null;
}

/** State is scoped to a controller connection; never advances the song clock. */
export class MidiMappingRouter {
  private previous = new Map<string, number>();
  private acquired = new Set<string>();
  private lastOutput = new Map<string, unknown>();
  route(
    binding: MidiBinding,
    event: MidiEvent,
    device: string,
    current: Settings,
  ): MidiAction | null {
    if (!midiBindingMatches(binding, event, device) || event.type === "noteOff") return null;
    const key = JSON.stringify([binding, device, event.channel]);
    const raw = event.type === "controlChange" ? event.value : event.velocity;
    const previous = this.previous.get(key);
    this.previous.set(key, raw);
    const target = MIDI_TARGETS.find((item) => item.id === binding.target);
    if (!target) return null;
    if (
      !target.continuous &&
      event.type === "controlChange" &&
      (raw < 0.5 || (previous !== undefined && previous >= 0.5))
    )
      return null;
    const value = binding.min + (binding.max - binding.min) * raw;
    const action = midiTargetAction(binding.target, value, current);
    if (action?.kind === "setParam") {
      const param = Object.keys(action.patch).find(
        (key) => typeof action.patch[key as keyof Settings] === "number",
      ) as keyof Settings | undefined;
      if (binding.pickup && param && event.type === "controlChange") {
        const currentValue = current[param] as number;
        if (this.lastOutput.has(key) && this.lastOutput.get(key) !== currentValue)
          this.acquired.delete(key);
        const low = midiTargetAction(binding.target, binding.min, current);
        const high = midiTargetAction(binding.target, binding.max, current);
        if (low?.kind === "setParam" && high?.kind === "setParam") {
          const a = low.patch[param] as number;
          const b = high.patch[param] as number;
          const position = a === b ? 0 : (currentValue - a) / (b - a);
          if (
            Math.abs(raw - position) <= 1 / 127 ||
            (previous !== undefined && (previous - position) * (raw - position) <= 0)
          )
            this.acquired.add(key);
          if (!this.acquired.has(key)) return null;
        }
        this.lastOutput.set(key, action.patch[param]);
      }
      if (
        Object.entries(action.patch).every(([key, next]) => current[key as keyof Settings] === next)
      )
        return null;
    }
    return action;
  }
}
