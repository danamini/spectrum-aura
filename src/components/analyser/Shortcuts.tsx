import { useEffect, useRef, useState, type MouseEvent } from "react";
import { settingsStore, useSlots } from "./store";

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  } catch (e) {
    console.error(e);
  }
}

export function Shortcuts() {
  const slots = useSlots();
  const [visible, setVisible] = useState(true);
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimerRef = useRef<number | null>(null);

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

  const doRandomize = () => { settingsStore.randomize(); showFlash("Randomized"); };
  const doToggleView = () => {
    const order = ["combo", "combo2d", "classic", "classic2d", "ripple", "ripple2d"] as const;
    const current = settingsStore.get();
    let cur: typeof order[number];
    if (current.view === "classic") {
      cur = current.classicFullscreen ? "classic2d" : "classic";
    } else if (current.view === "combo") {
      cur = current.comboFullscreen ? "combo2d" : "combo";
    } else if (current.view === "ripple") {
      cur = current.rippleFullscreen ? "ripple2d" : "ripple";
    } else {
      cur = "combo";
    }
    const next = order[(order.indexOf(cur) + 1) % order.length] ?? "combo";
    if (next === "combo")    { settingsStore.set({ view: "combo",    comboFullscreen: false });  showFlash("Combo 3D"); return; }
    if (next === "combo2d")  { settingsStore.set({ view: "combo",    comboFullscreen: true });   showFlash("Combo 2D"); return; }
    if (next === "classic")  { settingsStore.set({ view: "classic",  classicFullscreen: false }); showFlash("Classic 3D"); return; }
    if (next === "classic2d"){ settingsStore.set({ view: "classic",  classicFullscreen: true });  showFlash("Classic 2D"); return; }
    if (next === "ripple")   { settingsStore.set({ view: "ripple",   rippleFullscreen: false }); showFlash("Ripple 3D"); return; }
    if (next === "ripple2d") { settingsStore.set({ view: "ripple",   rippleFullscreen: true });  showFlash("Ripple 2D"); return; }
  };
  const doFullscreen = () => { toggleFullscreen(); };
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
    showFlash(on ? "Preset cycle ON" : "Preset cycle OFF");
  };
  const doToggleHints = () => setVisible((v) => !v);
  const doSlot = (i: number) => {
    const slot = settingsStore.getSlots()[i];
    if (slot) { settingsStore.loadSlot(i); showFlash(`Loaded ${slot.name}`); }
    else showFlash(`Slot ${i + 1} empty`);
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
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable='true'], [role='textbox']")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const slotIdx = slotIndexFromEvent(e);
      if (slotIdx !== null) {
        if (e.shiftKey) doSaveSlot(slotIdx);
        else doSlot(slotIdx);
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      const k = e.key.toLowerCase();
      if (k === "r") {
        doRandomize();
        e.preventDefault();
        e.stopPropagation();
      }
      else if (k === "v") {
        doToggleView();
        e.preventDefault();
        e.stopPropagation();
      }
      else if (k === "c") {
        doToggleSlotCycle();
        e.preventDefault();
        e.stopPropagation();
      }
      else if (k === "f") {
        doFullscreen();
        e.preventDefault();
        e.stopPropagation();
      }
      else if (k === "g") {
        doToggleHints();
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  void slots;

  type Hint = { key: string; label: string; onClick: (ev: MouseEvent<HTMLButtonElement>) => void; title?: string };
  const hints: Hint[] = [
    { key: "R", label: "Randomize", onClick: () => { doRandomize(); } },
    { key: "V", label: "Toggle view", onClick: () => { doToggleView(); } },
    { key: "C", label: "Cycle presets", onClick: () => { doToggleSlotCycle(); } },
    { key: "F", label: "Fullscreen", onClick: () => { doFullscreen(); } },
    { key: "G", label: "Hide hints", onClick: () => { doToggleHints(); } },
  ];
  const slotHints: Hint[] = [1, 2, 3, 4, 5].map((n) => ({
    key: String(n),
    label: slots[n - 1]?.name ?? "empty",
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
      className="pointer-events-auto flex items-center gap-1.5 rounded-full px-1.5 py-0.5 transition-colors hover:bg-white/10 hover:text-white/90"
    >
      <kbd className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-white/70 group-hover:border-white/40">
        {h.key}
      </kbd>
      <span>{h.label}</span>
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
          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-full border border-white/5 bg-black/40 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-white/45 backdrop-blur opacity-70 hover:opacity-100 transition-opacity">
            {hints.map((h) => <Btn key={h.key} h={h} />)}
            <span className="mx-1 h-3 w-px bg-white/10" />
            {slotHints.map((h) => <Btn key={h.key} h={h} />)}
            <span className="ml-1 text-white/25 normal-case tracking-normal">⇧+1–5 save</span>
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
