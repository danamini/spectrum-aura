import { midiClockInput } from "@spectrum-aura/engine/midi-clock";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installStorageMock } from "./helpers/test-helpers";
import { useMidiControl } from "../hooks/useMidiControl";
import { settingsStore } from "../store";
import { midiStore } from "../midi-store";

function Harness() {
  const status = useMidiControl();
  return <div>{status.error ?? status.inputs.join(",")}</div>;
}
describe("MIDI lifecycle and learning", () => {
  let root: Root;
  let host: HTMLDivElement;
  const input = (id: string) => ({
    id,
    name: id,
    state: "connected",
    onmidimessage: null as ((message: { data: Uint8Array; timeStamp?: number }) => void) | null,
  });
  let akai: ReturnType<typeof input>;
  let arturia: ReturnType<typeof input>;
  let access: { inputs: Map<string, ReturnType<typeof input>>; onstatechange: (() => void) | null };
  const send = async (port: ReturnType<typeof input>, bytes: number[]) => {
    await act(async () => port.onmidimessage?.({ data: new Uint8Array(bytes) }));
  };
  beforeEach(() => {
    installStorageMock();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    akai = input("APC64");
    arturia = input("MiniLab3");
    access = {
      inputs: new Map([
        [akai.id, akai],
        [arturia.id, arturia],
      ]),
      onstatechange: null,
    };
    Object.defineProperty(navigator, "requestMIDIAccess", {
      configurable: true,
      value: vi.fn().mockResolvedValue(access),
    });
    settingsStore.set({ midiEnabled: true, bloomStrength: 0.1 });
    midiStore.reset();
    midiStore.setInput("");
    midiStore.setSyncInput("");
    host = document.createElement("div");
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    delete (navigator as Partial<Navigator>).requestMIDIAccess;
    vi.unstubAllGlobals();
  });
  it("learns without applying the event, routes by device, and cleans up", async () => {
    await act(async () => root.render(<Harness />));
    expect(host.textContent).toContain("APC64,MiniLab3");
    midiStore.learn("bloom");
    await send(akai, [0xb0, 20, 127]);
    expect(settingsStore.get().bloomStrength).toBe(0.1);
    await send(arturia, [0xb0, 20, 127]);
    expect(settingsStore.get().bloomStrength).toBe(0.1);
    await send(akai, [0xb0, 20, 127]);
    expect(settingsStore.get().bloomStrength).toBe(0.25);
    await act(async () => settingsStore.set({ midiEnabled: false }));
    expect(akai.onmidimessage).toBeNull();
    expect(access.onstatechange).toBeNull();
  });
  it("handles unplug, reconnect, and selected-input filtering", async () => {
    await act(async () => root.render(<Harness />));
    midiStore.setInput("MiniLab3");
    await send(akai, [0xb0, 1, 127]);
    expect(settingsStore.get().bloomStrength).toBe(0.1);
    await send(arturia, [0xb0, 1, 127]);
    expect(settingsStore.get().bloomStrength).toBe(0.25);
    await act(async () => {
      arturia.state = "disconnected";
      access.onstatechange?.();
    });
    expect(host.textContent).toBe("APC64");
    expect(arturia.onmidimessage).toBeNull();
    await act(async () => {
      arturia.state = "connected";
      access.onstatechange?.();
    });
    expect(host.textContent).toContain("MiniLab3");
    expect(arturia.onmidimessage).not.toBeNull();
  });
  it("routes real-time clock independently of the performance input filter", async () => {
    await act(async () => root.render(<Harness />));
    midiStore.setInput("MiniLab3");
    midiStore.setSyncInput("APC64");
    const sync = (bytes: number[], timeStamp: number) =>
      akai.onmidimessage?.({ data: new Uint8Array(bytes), timeStamp });
    await act(async () => {
      sync([0xfa], 0);
      for (let i = 0; i <= 24; i++) sync([0xf8], (i * 500) / 24);
    });
    expect(midiClockInput.read(500).bpm).toBeCloseTo(120);
    expect(midiClockInput.read(500).running).toBe(true);
    expect(settingsStore.get().bloomStrength).toBe(0.1);
    await act(async () => settingsStore.set({ midiEnabled: false }));
    expect(midiClockInput.read(600).enabled).toBe(false);
  });
  it("reports denied permission", async () => {
    vi.mocked(navigator.requestMIDIAccess).mockRejectedValue(new Error("denied"));
    await act(async () => root.render(<Harness />));
    expect(host.textContent).toBe("MIDI access was denied");
  });
});
