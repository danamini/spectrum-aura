import { useEffect, useRef, useState } from "react";
import { dispatchBeatHint } from "@spectrum-aura/engine/beat-hint";
import {
  MidiInputManager,
  describeMidiAction,
  isMidiSupported,
  mapMidiEvent,
  type MidiAction,
} from "@spectrum-aura/engine/midi";
import { settingsStore, useSettings } from "../store";

export type MidiStatus = {
  supported: boolean;
  /** True while an access request is granted and inputs are being listened to. */
  active: boolean;
  inputs: string[];
  error: string | null;
  /** Label of the most recent mapped action, for panel feedback. */
  lastAction: string | null;
};

const IDLE_STATUS: MidiStatus = {
  supported: true,
  active: false,
  inputs: [],
  error: null,
  lastAction: null,
};

function applyMidiAction(action: MidiAction): void {
  switch (action.kind) {
    case "beatTap":
      dispatchBeatHint({ downbeat: action.downbeat });
      break;
    case "randomVisual":
      settingsStore.cycleRandomView();
      break;
    case "randomizeFx":
      settingsStore.randomize();
      break;
    case "loadSlot":
      settingsStore.loadSlot(action.index);
      break;
    case "setParam":
      settingsStore.set(action.patch);
      break;
  }
}

/**
 * Owns the Web MIDI lifecycle for the whole app (mounted from ControlPanel,
 * which lives at the top level). Requesting access prompts the browser for
 * permission, so the manager only starts after the explicit `midiEnabled`
 * opt-in. Mapping lives in `engine/midi.ts`; this hook just applies actions
 * to the settings store / beat-hint bus and exposes status for the panel.
 */
export function useMidiControl(): MidiStatus {
  const settings = useSettings();
  const [status, setStatus] = useState<MidiStatus>({
    ...IDLE_STATUS,
    supported: isMidiSupported(),
  });
  // Re-render throttle for continuous CC turns: only update the readout when
  // the action label actually changes.
  const lastActionRef = useRef<string | null>(null);

  useEffect(() => {
    if (!settings.midiEnabled) {
      lastActionRef.current = null;
      setStatus({ ...IDLE_STATUS, supported: isMidiSupported() });
      return;
    }
    if (!isMidiSupported()) {
      setStatus({
        ...IDLE_STATUS,
        supported: false,
        error: "Web MIDI is not supported in this browser (try Chrome, Edge, or Firefox)",
      });
      return;
    }
    const manager = new MidiInputManager({
      onEvent: (event) => {
        const action = mapMidiEvent(event, settingsStore.get());
        if (!action) return;
        applyMidiAction(action);
        const label = describeMidiAction(action);
        if (label !== lastActionRef.current) {
          lastActionRef.current = label;
          setStatus((prev) => ({ ...prev, lastAction: label }));
        }
      },
      onInputsChange: (inputs) =>
        setStatus((prev) => ({ ...prev, active: true, error: null, inputs })),
      onError: (message) =>
        setStatus((prev) => ({ ...prev, active: false, inputs: [], error: message })),
    });
    void manager.start();
    return () => manager.stop();
  }, [settings.midiEnabled]);

  return status;
}
