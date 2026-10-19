import { useEffect, useState } from "react";
import { midiClockInput } from "@spectrum-aura/engine/midi-clock";
import { MIDI_TARGETS, midiBindingMatches } from "@spectrum-aura/engine/midi-mapping";
import { midiStore, useMidiMapping } from "../midi-store";
import { settingsStore, useSettings } from "../store";
import type { MidiStatus } from "../hooks/useMidiControl";
import { ToggleRow } from "./primitives";

const button =
  "rounded border border-white/20 px-2 py-1 text-white/80 hover:border-emerald-300 focus-visible:outline-emerald-300 disabled:opacity-40";
export function MidiPanel({ midi }: { midi: MidiStatus }) {
  const settings = useSettings();
  const mapping = useMidiMapping();
  const latest = mapping.latest;
  const [sync, setSync] = useState(() => ({ ...midiClockInput.read(performance.now()) }));
  useEffect(() => {
    const timer = window.setInterval(
      () => setSync({ ...midiClockInput.read(performance.now()) }),
      200,
    );
    return () => window.clearInterval(timer);
  }, []);
  const value = latest
    ? Math.round(
        (latest.event.type === "controlChange"
          ? latest.event.value
          : latest.event.type === "noteOn"
            ? latest.event.velocity
            : 0) * 127,
      )
    : 0;
  return (
    <section className="space-y-4 font-mono text-[11px] text-white/80" aria-label="MIDI mapping">
      <ToggleRow
        label="MIDI input"
        enabled={settings.midiEnabled}
        onToggle={(midiEnabled) => settingsStore.set({ midiEnabled })}
      />
      <p className="leading-relaxed text-white/55">
        Play with MIDI on its own, or alongside microphone and system audio. Learn a control, then
        move a knob, slider or pad. Your mappings are saved on this browser.
      </p>
      {midi.error && (
        <p role="alert" className="text-amber-200">
          {midi.error}
        </p>
      )}
      <label className="block space-y-2">
        <span>Listen to</span>
        <select
          aria-label="MIDI input device"
          value={mapping.input}
          onChange={(e) => midiStore.setInput(e.target.value)}
          className="block w-full rounded border border-white/20 bg-zinc-900 p-2"
        >
          <option value="">All connected devices</option>
          {mapping.input && !midi.devices.some((d) => d.id === mapping.input) && (
            <option value={mapping.input}>Selected device disconnected</option>
          )}
          {midi.devices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </label>
      <p className="text-white/50">
        {midi.active
          ? midi.inputs.length
            ? midi.inputs.join(" · ")
            : "No devices connected. Connect a USB MIDI device to begin."
          : midi.error
            ? "Turn MIDI off and on to retry after allowing access in your browser."
            : settings.midiEnabled
              ? "Connecting…"
              : "Enable MIDI input to connect your controllers."}
      </p>
      <div className="space-y-2 rounded border border-white/15 p-3">
        <label className="block space-y-2">
          <span>Tempo & transport source</span>
          <select
            aria-label="MIDI clock source"
            value={mapping.syncInput}
            onChange={(event) => {
              midiStore.setSyncInput(event.target.value);
              if (event.target.value) settingsStore.set({ showBPM: true });
            }}
            className="block w-full rounded border border-white/20 bg-zinc-900 p-2"
          >
            <option value="">Audio detection / manual taps</option>
            {mapping.syncInput &&
              !midi.devices.some((device) => device.id === mapping.syncInput) && (
                <option value={mapping.syncInput}>Selected clock device disconnected</option>
              )}
            {midi.devices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.name}
              </option>
            ))}
          </select>
        </label>
        {mapping.syncInput && (
          <p role="status" className="text-emerald-200">
            {!settings.midiEnabled
              ? "Enable MIDI to receive clock"
              : `${sync.status} · ${sync.bpm > 0 ? sync.bpm.toFixed(1) + " BPM" : "waiting for tempo"} · quarter note ${Math.floor(sync.beat) + 1}`}
          </p>
        )}
        <p className="text-[10px] leading-relaxed text-white/55">
          For Ableton Live, send Track and Sync output to a virtual MIDI port, then select it here.
          MIDI supplies tempo, play/stop and song position; audio supplies sound response. The grid
          uses 4/4. Press T to return to manual sync.
        </p>
      </div>
      <div className="rounded border border-emerald-300/20 bg-emerald-400/5 p-3">
        <div className="flex justify-between">
          <span>
            {latest
              ? latest.event.type === "controlChange"
                ? `CC ${latest.event.controller}`
                : `Note ${latest.event.note}`
              : "Waiting for MIDI"}
          </span>
          <span>{latest ? `${value} / 127` : "—"}</span>
        </div>
        <meter
          aria-label="Last MIDI value"
          min={0}
          max={127}
          value={value}
          className="my-2 h-2 w-full"
        />
        <p className="text-white/55">
          {latest
            ? `${latest.label} · Ch ${latest.event.channel + 1} · ${latest.action ?? "Unmapped / waiting for pick-up"}`
            : "Incoming notes and controller values appear here."}
        </p>
      </div>
      {mapping.learning && (
        <p role="status" className="text-emerald-200">
          Move the control for {MIDI_TARGETS.find((t) => t.id === mapping.learning)?.label}.{" "}
          <button className={button} onClick={() => midiStore.learn(null)}>
            Cancel
          </button>
        </p>
      )}
      <div className="divide-y divide-white/10">
        {MIDI_TARGETS.map((target) => {
          const binding = mapping.bindings.find((b) => b.target === target.id);
          const live = !!(
            binding &&
            latest &&
            midiBindingMatches(binding, latest.event, latest.device)
          );
          return (
            <div key={target.id} className={`space-y-2 py-3 ${live ? "text-emerald-200" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <span>{target.label}</span>
                <div className="flex gap-2">
                  <button
                    className={button}
                    disabled={!midi.active}
                    aria-pressed={mapping.learning === target.id}
                    aria-label={`Learn ${target.label}`}
                    onClick={() =>
                      midiStore.learn(mapping.learning === target.id ? null : target.id)
                    }
                  >
                    Learn
                  </button>
                  {binding && (
                    <button
                      className={button}
                      aria-label={`Remove ${target.label} mapping`}
                      onClick={() => midiStore.remove(target.id)}
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
              <p className="text-[10px] text-white/50">
                {binding
                  ? `${binding.type === "controlChange" ? "CC" : "Note"} ${binding.number} · ${binding.channel === null ? "Any channel" : `Ch ${binding.channel + 1}`} · ${binding.device ? (midi.devices.find((d) => d.id === binding.device)?.name ?? "Disconnected device") : "Any device"}`
                  : "Not mapped"}
              </p>
              {binding && target.continuous && (
                <div className="flex flex-wrap items-center gap-3 text-[10px] text-white/65">
                  <label>
                    From{" "}
                    <input
                      aria-label={`${target.label} minimum percent`}
                      className="w-12 rounded bg-white/10 p-1"
                      type="number"
                      min="0"
                      max="100"
                      value={Math.round(binding.min * 100)}
                      onChange={(e) =>
                        midiStore.update(target.id, {
                          min: Math.max(0, Math.min(100, Number(e.target.value))) / 100,
                        })
                      }
                    />
                    %
                  </label>
                  <label>
                    To{" "}
                    <input
                      aria-label={`${target.label} maximum percent`}
                      className="w-12 rounded bg-white/10 p-1"
                      type="number"
                      min="0"
                      max="100"
                      value={Math.round(binding.max * 100)}
                      onChange={(e) =>
                        midiStore.update(target.id, {
                          max: Math.max(0, Math.min(100, Number(e.target.value))) / 100,
                        })
                      }
                    />
                    %
                  </label>
                  {target.id !== "scene" && binding.type === "controlChange" && (
                    <label>
                      <input
                        type="checkbox"
                        checked={binding.pickup}
                        onChange={(e) => midiStore.update(target.id, { pickup: e.target.checked })}
                      />{" "}
                      Pick-up
                    </label>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-white/45">
        Reverse a control by setting From higher than To. Pick-up waits until your slider crosses
        the current effect value. CC buttons trigger when crossing halfway.
      </p>
      <button className={button} onClick={() => midiStore.reset()}>
        Restore factory mappings
      </button>
    </section>
  );
}
