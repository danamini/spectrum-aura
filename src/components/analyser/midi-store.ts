import { useSyncExternalStore } from "react";
import {
  DEFAULT_MIDI_BINDINGS,
  MIDI_TARGETS,
  type MidiBinding,
} from "@spectrum-aura/engine/midi-mapping";
import type { MidiEvent } from "@spectrum-aura/engine/midi";

const KEY = "spectrum-aura:midi-mapping:v1";
type MidiConfig = { input: string; syncInput: string; bindings: MidiBinding[] };
export function normalizeMidiConfig(value: unknown): MidiConfig {
  const fallback = {
    input: "",
    syncInput: "",
    bindings: DEFAULT_MIDI_BINDINGS.map((binding) => ({ ...binding })),
  };
  if (!value || typeof value !== "object") return fallback;
  const raw = value as Partial<MidiConfig>;
  return {
    syncInput: typeof raw.syncInput === "string" ? raw.syncInput : "",
    input: typeof raw.input === "string" ? raw.input : "",
    bindings: Array.isArray(raw.bindings)
      ? raw.bindings.filter(
          (b): b is MidiBinding =>
            !!b &&
            MIDI_TARGETS.some((target) => target.id === b.target) &&
            typeof b.device === "string" &&
            (b.channel === null ||
              (Number.isInteger(b.channel) && b.channel >= 0 && b.channel <= 15)) &&
            (b.type === "noteOn" || b.type === "controlChange") &&
            Number.isInteger(b.number) &&
            b.number >= 0 &&
            b.number <= 127 &&
            Number.isFinite(b.min) &&
            b.min >= 0 &&
            b.min <= 1 &&
            Number.isFinite(b.max) &&
            b.max >= 0 &&
            b.max <= 1 &&
            typeof b.pickup === "boolean",
        )
      : fallback.bindings,
  };
}
let initial: unknown;
try {
  initial = JSON.parse(localStorage.getItem(KEY) ?? "null");
} catch {
  /* Use defaults when storage is unavailable. */
}
let state = {
  ...normalizeMidiConfig(initial),
  learning: null as string | null,
  latest: null as { event: MidiEvent; device: string; label: string; action: string | null } | null,
};
const listeners = new Set<() => void>();
function emit(persist = false) {
  if (persist) {
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({
          input: state.input,
          syncInput: state.syncInput,
          bindings: state.bindings,
        }),
      );
    } catch {
      /* In-memory mappings still work. */
    }
  }
  listeners.forEach((listener) => listener());
}
export const midiStore = {
  get: () => state,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  setSyncInput: (syncInput: string) => {
    state = { ...state, syncInput };
    emit(true);
  },
  setInput: (input: string) => {
    state = { ...state, input, learning: null };
    emit(true);
  },
  learn: (target: string | null) => {
    state = { ...state, learning: target };
    emit();
  },
  bind: (binding: MidiBinding) => {
    state = {
      ...state,
      learning: null,
      bindings: [
        ...state.bindings.filter(
          (b) =>
            b.target !== binding.target &&
            !(
              b.device === binding.device &&
              b.channel === binding.channel &&
              b.type === binding.type &&
              b.number === binding.number
            ),
        ),
        binding,
      ],
    };
    emit(true);
  },
  update: (target: string, patch: Partial<Pick<MidiBinding, "min" | "max" | "pickup">>) => {
    state = {
      ...state,
      bindings: state.bindings.map((b) => (b.target === target ? { ...b, ...patch } : b)),
    };
    emit(true);
  },
  remove: (target: string) => {
    state = { ...state, bindings: state.bindings.filter((b) => b.target !== target) };
    emit(true);
  },
  reset: () => {
    state = { ...state, bindings: DEFAULT_MIDI_BINDINGS.map((b) => ({ ...b })), learning: null };
    emit(true);
  },
  report: (latest: typeof state.latest) => {
    state = { ...state, latest };
    emit();
  },
};
export function useMidiMapping() {
  return useSyncExternalStore(midiStore.subscribe, midiStore.get, midiStore.get);
}
