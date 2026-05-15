import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { settingsStore, useSettings, useSlots, type Settings } from "./store";

const TOGGLE_STATS_PANEL_EVENT = "spectrum-aura:toggle-stats-panel";
const TOGGLE_SETTINGS_PANEL_EVENT = "spectrum-aura:toggle-settings-panel";
const TOGGLE_FULLSCREEN_EVENT = "spectrum-aura:toggle-fullscreen";
const STOP_AUDIO_EVENT = "spectrum-aura:stop-audio";

export function Shortcuts() {
  const slots = useSlots();
  const settings = useSettings();
  const [visible, setVisible] = useState(true);
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimerRef = useRef<number | null>(null);

  const fullscreenByView: Record<Settings["view"], keyof Settings> = {
    combo: "comboFullscreen",
    classic: "classicFullscreen",
    ripple: "rippleFullscreen",
    datastream: "datastreamFullscreen",
    nebula: "nebulaFullscreen",
    monolith: "monolithFullscreen",
    mandala: "mandalaFullscreen",
    terrain: "terrainFullscreen",
    obsidian: "obsidianFullscreen",
    torus: "torusFullscreen",
    soundwall: "soundwallFullscreen",
    geometrynebula: "geometrynebulaFullscreen",
  };
  const is3DMode = !settings[fullscreenByView[settings.view]];

  const showFlash = (msg: string) => {
    setFlash(msg);
    if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => setFlash(null), 1200);
  };

  useEffect(() => {
    return () => {
      if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current);
    };
  }, []);

  const doRandomize = () => {
    settingsStore.randomize();
    showFlash("Randomized");
  };
  const doToggleView = () => {
    const order = [
      "combo",
      "combo2d",
      "classic",
      "classic2d",
      "ripple",
      "ripple2d",
      "datastream",
      "datastream2d",
      "nebula",
      "nebula2d",
      "monolith",
      "monolith2d",
      "mandala",
      "mandala2d",
      "terrain",
      "terrain2d",
      "obsidian",
      "obsidian2d",
      "torus",
      "torus2d",
      "soundwall",
      "soundwall2d",
      "geometrynebula",
      "geometrynebula2d",
    ] as const;
    const labelByView: Record<Settings["view"], string> = {
      combo: "Combo",
      classic: "Classic",
      ripple: "Ripple",
      datastream: "Data-Stream",
      nebula: "Nebula",
      monolith: "Monolith",
      mandala: "Mandala",
      terrain: "Terrain",
      obsidian: "Obsidian",
      torus: "Torus",
      soundwall: "Sound-Wall",
      geometrynebula: "Geo Nebula",
    };
    const current = settingsStore.get();
    const fullKeyByView: Record<Settings["view"], keyof Settings> = {
      combo: "comboFullscreen",
      classic: "classicFullscreen",
      ripple: "rippleFullscreen",
      datastream: "datastreamFullscreen",
      nebula: "nebulaFullscreen",
      monolith: "monolithFullscreen",
      mandala: "mandalaFullscreen",
      terrain: "terrainFullscreen",
      obsidian: "obsidianFullscreen",
      torus: "torusFullscreen",
      soundwall: "soundwallFullscreen",
      geometrynebula: "geometrynebulaFullscreen",
    };
    const cur = current[fullKeyByView[current.view]]
      ? (`${current.view}2d` as (typeof order)[number])
      : (current.view as (typeof order)[number]);
    const next = order[(order.indexOf(cur) + 1) % order.length] ?? "combo";
    const is2d = next.endsWith("2d");
    const view = (is2d ? next.slice(0, -2) : next) as Settings["view"];
    if (view === "combo") settingsStore.set({ view, comboFullscreen: is2d });
    else if (view === "classic") settingsStore.set({ view, classicFullscreen: is2d });
    else if (view === "ripple") settingsStore.set({ view, rippleFullscreen: is2d });
    else if (view === "datastream") settingsStore.set({ view, datastreamFullscreen: is2d });
    else if (view === "nebula") settingsStore.set({ view, nebulaFullscreen: is2d });
    else if (view === "monolith") settingsStore.set({ view, monolithFullscreen: is2d });
    else if (view === "mandala") settingsStore.set({ view, mandalaFullscreen: is2d });
    else if (view === "terrain") settingsStore.set({ view, terrainFullscreen: is2d });
    else if (view === "obsidian") settingsStore.set({ view, obsidianFullscreen: is2d });
    else if (view === "torus") settingsStore.set({ view, torusFullscreen: is2d });
    else if (view === "soundwall") settingsStore.set({ view, soundwallFullscreen: is2d });
    else if (view === "geometrynebula") settingsStore.set({ view, geometrynebulaFullscreen: is2d });
    showFlash(`${labelByView[view]} ${is2d ? "2D" : "3D"}`);
  };
  const doFullscreen = () => {
    window.dispatchEvent(new Event(TOGGLE_FULLSCREEN_EVENT));
  };
  const doToggleSlotCycle = () => {
    const on = !settingsStore.get().slotCycleMode;
    if (on) {
      const hasAny = settingsStore.getSlots().some((slot) => !!slot);
      if (!hasAny) {
        showFlash("No saved slots");
        return;
      }
    }
    settingsStore.set({ slotCycleMode: on });
    showFlash(on ? "Save cycle ON" : "Save cycle OFF");
  };
  const doToggleStats = () => {
    window.dispatchEvent(new Event(TOGGLE_STATS_PANEL_EVENT));
    showFlash("Stats for nerds");
  };
  const doToggleSettings = () => {
    window.dispatchEvent(new Event(TOGGLE_SETTINGS_PANEL_EVENT));
    showFlash("Settings");
  };
  const doStopAudio = () => {
    window.dispatchEvent(new Event(STOP_AUDIO_EVENT));
    showFlash("Audio stopped");
  };
  const doToggleHints = () => setVisible((v) => !v);
  const doSlot = (i: number) => {
    const slot = settingsStore.getSlots()[i];
    if (slot) {
      settingsStore.loadSlot(i);
      showFlash(`Loaded ${slot.name}`);
    } else showFlash(`Slot ${i + 1} empty`);
  };
  const doSaveSlot = (i: number) => {
    settingsStore.saveSlot(i, `Slot ${i + 1}`);
    showFlash(`Saved to slot ${i + 1}`);
  };

  useEffect(() => {
    const slotIndexFromCode = (code: string): number | null => {
      const d = /^Digit([1-5])$/.exec(code)?.[1] ?? /^Numpad([1-5])$/.exec(code)?.[1];
      return d != null ? parseInt(d, 10) - 1 : null;
    };
    const slotIndexFromEvent = (e: KeyboardEvent): number | null => {
      const byCode = slotIndexFromCode(e.code);
      if (byCode !== null) return byCode;
      const byKey = /^([1-5])$/.exec(e.key)?.[1];
      return byKey != null ? parseInt(byKey, 10) - 1 : null;
    };
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (
        target?.closest("input, textarea, [contenteditable='true'], [role='textbox']") &&
        k !== "s"
      )
        return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const slotIdx = slotIndexFromEvent(e);
      if (slotIdx !== null) {
        if (e.shiftKey) doSaveSlot(slotIdx);
        else doSlot(slotIdx);
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      if (k === "r") {
        doRandomize();
        e.preventDefault();
        e.stopPropagation();
      } else if (k === "v") {
        doToggleView();
        e.preventDefault();
        e.stopPropagation();
      } else if (k === "a") {
        doToggleSlotCycle();
        e.preventDefault();
        e.stopPropagation();
      } else if (k === "f") {
        doFullscreen();
        e.preventDefault();
        e.stopPropagation();
      } else if (k === "s") {
        doToggleSettings();
        e.preventDefault();
        e.stopPropagation();
      } else if (k === "x") {
        doStopAudio();
        e.preventDefault();
        e.stopPropagation();
      } else if (k === "g") {
        doToggleHints();
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  void slots;

  type Hint = {
    key: string;
    label?: string;
    onClick: (ev: MouseEvent<HTMLButtonElement>) => void;
    title?: string;
    icon?: ReactNode;
  };
  const hints: Hint[] = [
    {
      key: "R",
      label: "Randomize",
      onClick: () => {
        doRandomize();
      },
    },
    {
      key: "V",
      label: "Cycle Visual",
      onClick: () => {
        doToggleView();
      },
    },
    {
      key: "X",
      label: "Source",
      onClick: () => {
        doStopAudio();
      },
    },
    {
      key: "F",
      label: "Fullscreen",
      onClick: () => {
        doFullscreen();
      },
    },
    {
      key: "N",
      label: "Stats",
      onClick: () => {
        doToggleStats();
      },
      title: "Stats for nerds",
    },
    {
      key: "G",
      label: "Hide hints",
      onClick: () => {
        doToggleHints();
      },
    },
  ];
  const settingsHint: Hint = {
    key: "S",
    label: "Settings",
    onClick: () => {
      doToggleSettings();
    },
  };
  const cycleSavesHint: Hint = {
    key: "A",
    label: "Auto Cycle Saves",
    onClick: () => {
      doToggleSlotCycle();
    },
  };
  const slotHints: Hint[] = [1, 2, 3, 4, 5].map((n) => ({
    key: String(n),
    label: "",
    onClick: (ev: MouseEvent<HTMLButtonElement>) => {
      if (ev.shiftKey) doSaveSlot(n - 1);
      else doSlot(n - 1);
    },
    title: `Click to load · Shift+click or Shift+${n} to save`,
  }));

  const Btn = ({ h }: { h: Hint }) => (
    <button
      type="button"
      onClick={h.onClick}
      title={h.title ?? `Press ${h.key}`}
      data-settings-shortcut={h.key === "S" ? "true" : undefined}
      className="pointer-events-auto flex items-center gap-1.5 rounded-full px-1.5 py-0.5 transition-colors hover:bg-white/10 hover:text-white/90"
    >
      <kbd className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-white/70 group-hover:border-white/40">
        {h.key}
      </kbd>
      {h.icon ? <span className="text-white/75">{h.icon}</span> : null}
      {h.label ? <span>{h.label}</span> : null}
    </button>
  );

  return (
    <>
      {flash && (
        <div className="pointer-events-none fixed left-1/2 top-6 z-[110] -translate-x-1/2 rounded-full border border-white/10 bg-black/70 px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-white/90 backdrop-blur">
          {flash}
        </div>
      )}
      {visible ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-3 z-[100] flex justify-center">
          <div className="flex flex-col items-center gap-1">
            {is3DMode && (
              <div className="rounded-full border border-white/5 bg-black/35 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-white/45 backdrop-blur opacity-70">
                3D: drag mouse to move camera
              </div>
            )}
            <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-full border border-white/5 bg-black/40 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-white/45 backdrop-blur opacity-70 hover:opacity-100 transition-opacity">
              {hints.map((h) => (
                <Btn key={h.key} h={h} />
              ))}
              <span className="mx-1 h-3 w-px bg-white/10" />
              <Btn h={cycleSavesHint} />
              <span className="ml-1 text-white/25 normal-case tracking-normal">Saves</span>
              {slotHints.map((h) => (
                <Btn key={h.key} h={h} />
              ))}
              <span className="ml-1 text-white/25 normal-case tracking-normal">⇧+1–5 save</span>
              <span className="mx-1 h-3 w-px bg-white/10" />
              <Btn h={settingsHint} />
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={doToggleHints}
          title="Show shortcuts (G)"
          className="pointer-events-auto fixed inset-x-0 bottom-1 z-[100] mx-auto block w-fit rounded-full border border-white/5 bg-black/30 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.3em] text-white/30 backdrop-blur hover:text-white/70"
        >
          shortcuts
        </button>
      )}
    </>
  );
}
