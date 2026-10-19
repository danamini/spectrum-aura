import { midiClockInput } from "@spectrum-aura/engine/midi-clock";
import { useEffect, useRef, useState } from "react";
import { dispatchBeatHint } from "@spectrum-aura/engine/beat-hint";
import {
  MidiInputManager,
  describeMidiAction,
  isMidiSupported,
  type MidiAction,
} from "@spectrum-aura/engine/midi";
import { MidiMappingRouter, midiBindingMatches } from "@spectrum-aura/engine/midi-mapping";
import { midiStore } from "../midi-store";
import { settingsStore, useSettings } from "../store";

export type MidiStatus = {
  supported: boolean;
  /** True while an access request is granted and inputs are being listened to. */
  active: boolean;
  inputs: string[];
  devices: { id: string; name: string }[];
  error: string | null;
  /** Label of the most recent mapped action, for panel feedback. */
  lastAction: string | null;
};

const IDLE_STATUS: MidiStatus = {
  supported: true,
  active: false,
  inputs: [],
  devices: [],
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
    const selectSync = () => midiClockInput.select(midiStore.get().syncInput);
    selectSync();
    const unsubscribeSync = midiStore.subscribe(selectSync);
    let connected: string[] = [];
    const router = new MidiMappingRouter();
    let timer: number | undefined;
    let pending: ReturnType<typeof midiStore.get>["latest"] = null;
    const manager = new MidiInputManager({
      onEvent: (event, device) => {
        const config = midiStore.get();
        if (config.input && config.input !== device.id) return;
        if (event.type === "noteOff") return;
        let label: string | null = null;
        if (config.learning) {
          midiStore.bind({
            target: config.learning,
            device: device.id,
            channel: event.channel,
            type: event.type,
            number: event.type === "controlChange" ? event.controller : event.note,
            min: 0,
            max: 1,
            pickup: false,
          });
          label = "Mapping learned";
        } else {
          const matches = config.bindings.filter((binding) =>
            midiBindingMatches(binding, event, device.id),
          );
          // Device-specific learned controls override the factory any-device bindings.
          const specific = matches.filter((binding) => binding.device !== "");
          for (const binding of specific.length ? specific : matches) {
            const action = router.route(binding, event, device.id, settingsStore.get());
            if (action) {
              applyMidiAction(action);
              label = describeMidiAction(action);
            }
          }
        }
        pending = { event, device: device.id, label: device.name, action: label };
        if (timer === undefined)
          timer = window.setTimeout(() => {
            midiStore.report(pending);
            timer = undefined;
          }, 50);
        if (label && label !== lastActionRef.current) {
          lastActionRef.current = label;
          setStatus((prev) => ({ ...prev, lastAction: label }));
        }
      },
      onSync: (event, device, timestamp) => midiClockInput.receive(event, device.id, timestamp),
      onDevicesChange: (devices) => {
        for (const id of connected)
          if (!devices.some((device) => device.id === id)) midiClockInput.disconnect(id);
        connected = devices.map((device) => device.id);
        setStatus((prev) => ({ ...prev, devices }));
      },
      onInputsChange: (inputs) =>
        setStatus((prev) => ({ ...prev, active: true, error: null, inputs })),
      onError: (message) =>
        setStatus((prev) => ({ ...prev, active: false, inputs: [], error: message })),
    });
    void manager.start();
    return () => {
      manager.stop();
      unsubscribeSync();
      midiClockInput.select("");
      window.clearTimeout(timer);
      midiStore.learn(null);
      midiStore.report(null);
    };
  }, [settings.midiEnabled]);

  return status;
}
