import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import {
  LayoutGrid,
  Maximize2,
  Mic,
  Play,
  Repeat,
  Save,
  Settings2,
  Shuffle,
  SkipBack,
  SkipForward,
  Trash2,
} from "lucide-react";
import { settingsStore, useSettings, useSlots, type Settings } from "./store";
import { dispatchBeatHint } from "./engine/beat-hint";
import { WEBXR_STATE_EVENT, requestWebXrToggle, type WebXrState } from "./engine/xr";
import { getVisualDefinition, VISUALS } from "./visuals";

const TOGGLE_STATS_PANEL_EVENT = "spectrum-aura:toggle-stats-panel";
const TOGGLE_SETTINGS_PANEL_EVENT = "spectrum-aura:toggle-settings-panel";
const TOGGLE_FULLSCREEN_EVENT = "spectrum-aura:toggle-fullscreen";
const STOP_AUDIO_EVENT = "spectrum-aura:stop-audio";

const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

function ShortcutTooltipContent({ children }: { children: ReactNode }) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={6}
        className="z-[160] overflow-hidden rounded-md border border-white/10 bg-white/10 backdrop-blur-lg px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.18em] text-white/90 shadow-[0_2px_16px_0_rgba(0,0,0,0.18)] animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2"
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

type Hint = {
  key: string;
  label?: string;
  onClick: (ev: MouseEvent<HTMLButtonElement>) => void;
  title?: string;
  tooltip?: ReactNode;
  icon?: ReactNode;
  active?: boolean;
  showKey?: boolean;
  ariaLabel?: string;
};

function TooltipBlock({ title, hint, detail }: { title: string; hint?: string; detail: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-[10px] text-white">
        <span className="text-white/55">&gt;&gt;</span>
        <span>{title}</span>
        {hint ? <span className="text-white/45">[{hint}]</span> : null}
      </div>
      <div className="pl-5 text-[9px] normal-case tracking-normal text-white/70">{detail}</div>
    </div>
  );
}

export function Shortcuts() {
  const slots = useSlots();
  const settings = useSettings();
  const [visible, setVisible] = useState(true);
  const [xrActive, setXrActive] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimerRef = useRef<number | null>(null);
  const saveCursorRef = useRef(0);

  const currentVisual = getVisualDefinition(settings.view);
  const fullscreenKey = currentVisual?.fullscreenKey as keyof Settings | undefined;
  const is3DMode = fullscreenKey ? !settings[fullscreenKey] : true;
  const visualLabel = currentVisual?.label ?? settings.view;
  const visualCount = VISUALS.length;
  const visualCountLabel = `${visualCount} visual${visualCount === 1 ? "" : "s"}`;

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

  useEffect(() => {
    if (slots.length === 0) {
      saveCursorRef.current = 0;
      return;
    }
    saveCursorRef.current = Math.min(saveCursorRef.current, slots.length - 1);
  }, [slots]);

  useEffect(() => {
    const onWebXrState = (event: Event) => {
      const detail = (event as CustomEvent<WebXrState>).detail;
      if (!detail) return;
      setXrActive(detail.active);
    };
    window.addEventListener(WEBXR_STATE_EVENT, onWebXrState);
    return () => window.removeEventListener(WEBXR_STATE_EVENT, onWebXrState);
  }, []);

  const doRandomize = () => {
    settingsStore.randomize();
    showFlash("Randomized");
  };
  const doToggleRandomizeInclude = () => {
    const next = !settingsStore.get().randomizeViewSettings;
    settingsStore.set({ randomizeViewSettings: next });
    showFlash(next ? "Randomize includes view" : "Randomize post FX only");
  };
  const doTogglePostFx = () => {
    const next = !settingsStore.get().postFxEnabled;
    settingsStore.set({ postFxEnabled: next });
    showFlash(next ? "Post FX ON" : "Post FX OFF");
  };
  const doBeatHint = (downbeat: boolean) => {
    dispatchBeatHint({ downbeat });
    showFlash(downbeat ? "Downbeat ⇧T" : "Beat tap T");
  };
  const doToggleView = (direction: 1 | -1 = 1) => {
    const order = VISUALS.flatMap((visual) =>
      visual.fullscreenKey ? [visual.id, `${visual.id}2d`] : [visual.id],
    );
    const current = settingsStore.get();
    const activeVisual = getVisualDefinition(current.view);
    const activeFullscreenKey = activeVisual?.fullscreenKey as keyof Settings | undefined;
    const cur =
      activeFullscreenKey && current[activeFullscreenKey] ? `${current.view}2d` : current.view;
    let nextIdx = order.indexOf(cur) + direction;
    if (nextIdx < 0) nextIdx = order.length - 1;
    if (nextIdx >= order.length) nextIdx = 0;
    const next = order[nextIdx] ?? VISUALS[0]?.id ?? "combo";
    const is2d = next.endsWith("2d");
    const view = (is2d ? next.slice(0, -2) : next) as Settings["view"];
    const visual = getVisualDefinition(view);
    const nextFullscreenKey = visual?.fullscreenKey as keyof Settings | undefined;
    settingsStore.set(
      nextFullscreenKey ? ({ view, [nextFullscreenKey]: is2d } as Partial<Settings>) : { view },
    );
    showFlash(`${visual?.label ?? view} ${is2d ? "2D" : "3D"}`);
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
  const doToggleViewCycle = () => {
    const on = !settingsStore.get().viewCycleMode;
    settingsStore.set({ viewCycleMode: on });
    showFlash(on ? "View cycle ON" : "View cycle OFF");
  };
  const doToggleStats = () => {
    window.dispatchEvent(new Event(TOGGLE_STATS_PANEL_EVENT));
    showFlash("Stats for nerds");
  };
  const doToggleLatency = () => {
    const next = !settingsStore.get().showLatency;
    settingsStore.set({ showLatency: next });
    showFlash(next ? "Latency HUD ON" : "Latency HUD OFF");
  };
  const doToggleBpmGrid = () => {
    const next = !settingsStore.get().showBPM;
    settingsStore.set({ showBPM: next });
    showFlash(next ? "BPM grid ON" : "BPM grid OFF");
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
  const loadSaveAtIndex = (index: number) => {
    const slot = settingsStore.getSlots()[index];
    if (!slot) {
      showFlash("No saved presets");
      return;
    }
    saveCursorRef.current = index;
    settingsStore.loadSlot(index);
    showFlash(`Loaded ${slot.name}`);
  };
  const doSlot = (i: number) => {
    const slot = settingsStore.getSlots()[i];
    if (slot) {
      loadSaveAtIndex(i);
    } else showFlash(`Save ${i + 1} not found`);
  };
  const doSaveSlot = (i: number) => {
    settingsStore.saveSlot(i, `Slot ${i + 1}`);
    saveCursorRef.current = i;
    showFlash(`Saved to slot ${i + 1}`);
  };
  const doSaveCurrent = () => {
    const nextIndex = settingsStore.getSlots().length;
    settingsStore.saveSlot(nextIndex, `Save ${nextIndex + 1}`);
    saveCursorRef.current = nextIndex;
    showFlash(`Saved as Save ${nextIndex + 1}`);
  };
  const doDeleteCurrentSave = () => {
    const list = settingsStore.getSlots();
    if (list.length === 0) {
      showFlash("No saved presets");
      return;
    }
    const current = list[saveCursorRef.current];
    settingsStore.clearSlot(saveCursorRef.current);
    if (list.length <= 1) saveCursorRef.current = 0;
    else saveCursorRef.current = Math.min(saveCursorRef.current, list.length - 2);
    showFlash(`Deleted ${current?.name ?? "save"}`);
  };
  const doCycleSave = (direction: 1 | -1) => {
    const list = settingsStore.getSlots();
    if (list.length === 0) {
      showFlash("No saved presets");
      return;
    }
    const next = (saveCursorRef.current + direction + list.length) % list.length;
    loadSaveAtIndex(next);
  };
  const doRandomSave = () => {
    const list = settingsStore.getSlots();
    if (list.length === 0) {
      showFlash("No saved presets");
      return;
    }
    const next =
      list.length === 1
        ? 0
        : (() => {
            let index = saveCursorRef.current;
            while (index === saveCursorRef.current) {
              index = Math.floor(Math.random() * list.length);
            }
            return index;
          })();
    loadSaveAtIndex(next);
  };

  const actionsRef = useRef({
    doRandomize,
    doToggleView,
    doToggleSlotCycle,
    doToggleViewCycle,
    doBeatHint,
    doCycleSave,
    doRandomSave,
    doFullscreen,
    doToggleSettings,
    doStopAudio,
    doToggleHints,
    doSaveSlot,
    doSlot,
  });
  actionsRef.current = {
    doRandomize,
    doToggleView,
    doToggleSlotCycle,
    doToggleViewCycle,
    doBeatHint,
    doCycleSave,
    doRandomSave,
    doFullscreen,
    doToggleSettings,
    doStopAudio,
    doToggleHints,
    doToggleLatency,
    doToggleBpmGrid,
    doSaveSlot,
    doSlot,
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
        if (e.shiftKey) actionsRef.current.doSaveSlot(slotIdx);
        else actionsRef.current.doSlot(slotIdx);
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      if (k === "r") {
        actionsRef.current.doRandomize();
        e.preventDefault();
        e.stopPropagation();
      } else if (k === "b") {
        actionsRef.current.doToggleView(-1);
        e.preventDefault();
        e.stopPropagation();
      } else if (k === "v") {
        actionsRef.current.doToggleView(1);
        e.preventDefault();
        e.stopPropagation();
      } else if (k === "a") {
        actionsRef.current.doToggleSlotCycle();
        e.preventDefault();
        e.stopPropagation();
      } else if (k === "c") {
        actionsRef.current.doToggleViewCycle();
        e.preventDefault();
        e.stopPropagation();
      } else if (k === "t") {
        actionsRef.current.doBeatHint(e.shiftKey);
        e.preventDefault();
        e.stopPropagation();
      } else if (e.key === "[") {
        actionsRef.current.doCycleSave(-1);
        e.preventDefault();
        e.stopPropagation();
      } else if (e.key === "]") {
        actionsRef.current.doCycleSave(1);
        e.preventDefault();
        e.stopPropagation();
      } else if (e.key === "\\") {
        actionsRef.current.doRandomSave();
        e.preventDefault();
        e.stopPropagation();
      } else if (k === "f") {
        actionsRef.current.doFullscreen();
        e.preventDefault();
        e.stopPropagation();
      } else if (k === "s") {
        actionsRef.current.doToggleSettings();
        e.preventDefault();
        e.stopPropagation();
      } else if (k === "x") {
        actionsRef.current.doStopAudio();
        e.preventDefault();
        e.stopPropagation();
      } else if (k === "g") {
        actionsRef.current.doToggleHints();
        e.preventDefault();
        e.stopPropagation();
      } else if (k === "l") {
        actionsRef.current.doToggleLatency();
        e.preventDefault();
        e.stopPropagation();
      } else if (k === "m") {
        actionsRef.current.doToggleBpmGrid();
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const prevVisualHint: Hint = {
    key: "B",
    label: "Prev Visual",
    icon: <SkipBack />,
    tooltip: (
      <TooltipBlock title="Prev Visual" hint="B" detail="Steps backward through the visual list." />
    ),
    onClick: () => {
      doToggleView(-1);
    },
  };
  const nextVisualHint: Hint = {
    key: "V",
    label: "Next Visual",
    icon: <SkipForward />,
    tooltip: (
      <TooltipBlock
        title="Next Visual"
        hint="V"
        detail="Steps forward through the visual list and keeps the current mode in motion."
      />
    ),
    onClick: () => {
      doToggleView(1);
    },
  };
  const hints: Hint[] = [
    {
      key: "R",
      label: "Randomize",
      icon: <Shuffle />,
      tooltip: (
        <TooltipBlock
          title="Randomize"
          hint="R"
          detail="Shuffles the current look using the active scope below."
        />
      ),
      onClick: () => {
        doRandomize();
      },
    },
    {
      key: "X",
      label: "Audio Source",
      icon: <Mic />,
      tooltip: (
        <TooltipBlock
          title="Audio Source"
          hint="X"
          detail="Stops the current input so you can pick mic, tab, or system audio again."
        />
      ),
      onClick: () => {
        doStopAudio();
      },
    },
    {
      key: "F",
      label: "Fullscreen",
      icon: <Maximize2 />,
      tooltip: (
        <TooltipBlock
          title="Fullscreen"
          hint="F"
          detail="Expands the analyser to fullscreen for a cleaner stage view."
        />
      ),
      onClick: () => {
        doFullscreen();
      },
    },
    {
      key: "N",
      label: "Stats",
      tooltip: (
        <TooltipBlock
          title="Stats"
          hint="N"
          detail="Opens the nerd panel with FPS, renderer, and audio diagnostics."
        />
      ),
      onClick: () => {
        doToggleStats();
      },
      title: "Stats for nerds",
    },
    {
      key: "L",
      label: "Latency",
      active: settings.showLatency,
      tooltip: (
        <TooltipBlock
          title="Latency HUD"
          hint="L"
          detail="Toggles the bottom-right audio→UI latency overlay."
        />
      ),
      onClick: () => {
        doToggleLatency();
      },
      title: "Toggle latency HUD",
    },
    {
      key: "M",
      label: "BPM Grid",
      icon: <LayoutGrid />,
      active: settings.showBPM,
      tooltip: (
        <TooltipBlock
          title="BPM & Bar Grid"
          hint="M"
          detail="Toggles the sync grid and BPM readout on canvas and in Audio settings."
        />
      ),
      onClick: () => {
        doToggleBpmGrid();
      },
      title: "Toggle BPM & bar grid",
    },
    {
      key: "G",
      label: "Hide hints",
      tooltip: (
        <TooltipBlock
          title="Hide Hints"
          hint="G"
          detail="Collapses the shortcut strip until you bring it back again."
        />
      ),
      onClick: () => {
        doToggleHints();
      },
    },
  ];
  const xrHint: Hint = {
    key: "VR",
    label: "Exit VR",
    tooltip: (
      <TooltipBlock
        title="Exit VR"
        detail="Leaves the immersive session and returns to the desktop controls."
      />
    ),
    onClick: () => {
      requestWebXrToggle();
    },
  };
  const settingsHint: Hint = {
    key: "S",
    label: "Settings",
    icon: <Settings2 />,
    tooltip: (
      <TooltipBlock
        title="Settings"
        hint="S"
        detail="Opens the full control drawer for visual, save, and FX tuning."
      />
    ),
    onClick: () => {
      doToggleSettings();
    },
  };
  const cycleSavesHint: Hint = {
    key: "A",
    label: "Play Saves",
    icon: <Play />,
    active: settings.slotCycleMode,
    tooltip: (
      <TooltipBlock
        title="Play Saves"
        hint="A"
        detail="Cycles through your saved looks in sequence using the current dwell timing."
      />
    ),
    onClick: () => {
      doToggleSlotCycle();
    },
  };
  const viewCycleHint: Hint = {
    key: "C",
    label: "View Cycle",
    icon: <Repeat />,
    active: settings.viewCycleMode,
    tooltip: (
      <TooltipBlock
        title="View Cycle"
        hint="C"
        detail="Randomly switches visuals every 4 bars (16 beats in 4/4)."
      />
    ),
    onClick: () => {
      doToggleViewCycle();
    },
  };
  const prevSaveHint: Hint = {
    key: "[",
    label: "Prev Save",
    icon: <SkipBack />,
    tooltip: (
      <TooltipBlock
        title="Prev Save"
        hint="["
        detail="Loads the previous save in your current list."
      />
    ),
    onClick: () => {
      doCycleSave(-1);
    },
  };
  const nextSaveHint: Hint = {
    key: "]",
    label: "Next Save",
    icon: <SkipForward />,
    tooltip: (
      <TooltipBlock title="Next Save" hint="]" detail="Loads the next save in your current list." />
    ),
    onClick: () => {
      doCycleSave(1);
    },
  };
  const randomSaveHint: Hint = {
    key: "\\",
    label: "Random Save",
    icon: <Shuffle />,
    tooltip: (
      <TooltipBlock
        title="Random Save"
        hint="\\"
        detail="Jumps to a random saved look without changing the save list itself."
      />
    ),
    onClick: () => {
      doRandomSave();
    },
  };
  const saveCurrentHint: Hint = {
    key: "",
    label: "Save",
    icon: <Save />,
    tooltip: (
      <TooltipBlock
        title="Save"
        detail="Captures the current setup as a new saved state at the end of the list."
      />
    ),
    onClick: () => {
      doSaveCurrent();
    },
    title: "Save current settings",
    showKey: false,
  };
  const deleteSaveHint: Hint = {
    key: "",
    label: "Delete",
    icon: <Trash2 />,
    tooltip: (
      <TooltipBlock
        title="Delete Save"
        detail="Removes the currently focused save from the list."
      />
    ),
    onClick: () => {
      doDeleteCurrentSave();
    },
    title: "Delete focused save",
    showKey: false,
  };

  const Btn = ({ h }: { h: Hint }) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={h.onClick}
          aria-label={h.ariaLabel ?? h.label ?? h.title ?? h.key}
          aria-pressed={h.active}
          data-settings-shortcut={h.key === "S" ? "true" : undefined}
          className={`pointer-events-auto flex items-center gap-1.5 rounded-full px-1.5 py-0.5 transition-colors [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:shrink-0 ${
            h.active
              ? "border border-emerald-300/40 bg-emerald-300/12 text-emerald-100 shadow-[0_0_12px_rgba(52,211,153,0.18)]"
              : "hover:bg-white/10 hover:text-white/90"
          }`}
        >
          {!xrActive && h.showKey !== false && (
            <kbd className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-white/70 group-hover:border-white/40">
              {h.key}
            </kbd>
          )}
          {h.icon ? <span className="text-white/75">{h.icon}</span> : null}
          {h.label ? <span>{h.label}</span> : null}
        </button>
      </TooltipTrigger>
      <ShortcutTooltipContent>
        {h.tooltip ?? h.title ?? (xrActive || h.showKey === false ? h.label : `Press ${h.key}`)}
      </ShortcutTooltipContent>
    </Tooltip>
  );

  const MiniToggle = ({
    label,
    active,
    onClick,
    title,
  }: {
    label: string;
    active: boolean;
    onClick: () => void;
    title: string;
  }) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onClick();
          }}
          aria-label={title}
          aria-pressed={active}
          className={`pointer-events-auto rounded-full border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] transition-colors ${
            active
              ? "border-emerald-300/40 bg-emerald-300/12 text-emerald-100"
              : "border-white/10 bg-white/[0.04] text-white/35 hover:text-white/65"
          }`}
        >
          {label}
        </button>
      </TooltipTrigger>
      <ShortcutTooltipContent>
        <TooltipBlock title={label.toUpperCase()} detail={title} hint={active ? "ON" : "OFF"} />
      </ShortcutTooltipContent>
    </Tooltip>
  );

  const saveCountLabel = `${slots.length} save${slots.length === 1 ? "" : "s"}`;

  return (
    <>
      {flash && (
        <div className="pointer-events-none fixed left-1/2 top-6 z-[110] -translate-x-1/2 rounded-full border border-white/10 bg-black/70 px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-white/90 backdrop-blur">
          {flash}
        </div>
      )}
      {visible ? (
        <div
          className={`pointer-events-none fixed inset-x-0 z-[100] flex justify-center ${xrActive ? "top-3" : "bottom-3"}`}
        >
          <TooltipProvider delayDuration={120}>
            <div className="flex w-fit max-w-[calc(100vw-1.5rem)] flex-col items-center gap-1">
              {/* High visual name, subtle */}
              <div className="mb-1 w-full text-center">
                <span className="font-mono text-[13px] font-semibold uppercase tracking-[0.22em] text-white/35 select-none">
                  {visualLabel}
                </span>
              </div>
              {xrActive && (
                <div className="rounded-full border border-emerald-300/25 bg-black/50 px-3 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-emerald-200/75 backdrop-blur">
                  XR: right A settings · right B stats · hold both grips exit
                </div>
              )}
              {is3DMode && !xrActive && (
                <div className="rounded-full border border-white/5 bg-black/35 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-white/45 backdrop-blur opacity-70">
                  3D: drag mouse to move camera
                </div>
              )}
              <div className="flex w-full flex-col items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-white/45 opacity-70 transition-opacity hover:opacity-100">
                <div className="w-full overflow-x-auto px-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <div className="mx-auto flex w-fit min-w-max items-center justify-center rounded-full border border-white/5 bg-black/40 px-3 py-1 backdrop-blur">
                    {xrActive && <Btn h={xrHint} />}
                    <div className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-white/8 bg-white/[0.03] px-1.5 py-0.5">
                      <span className="rounded bg-white/8 px-2 py-0.5 font-mono text-[10px] tracking-wider text-emerald-200/80 select-none">
                        {visualCountLabel}
                      </span>
                      <Btn h={prevVisualHint} />
                      <Btn h={hints[0]!} />
                      <Btn h={viewCycleHint} />
                      <MiniToggle
                        label="inc"
                        active={settings.randomizeViewSettings}
                        onClick={doToggleRandomizeInclude}
                        title={
                          settings.randomizeViewSettings
                            ? "Randomize includes view settings"
                            : "Randomize post FX only"
                        }
                      />
                      <MiniToggle
                        label="fx"
                        active={settings.postFxEnabled}
                        onClick={doTogglePostFx}
                        title={settings.postFxEnabled ? "Post FX enabled" : "Post FX disabled"}
                      />
                      <Btn h={nextVisualHint} />
                    </div>
                  </div>
                </div>
                <div className="w-full overflow-x-auto px-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <div className="mx-auto flex w-fit min-w-max items-center justify-center rounded-full border border-white/5 bg-black/40 px-3 py-1 backdrop-blur">
                    <div className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-white/8 bg-white/[0.03] px-1.5 py-0.5">
                      <span className="rounded bg-white/8 px-2 py-0.5 font-mono text-[10px] tracking-wider text-emerald-200/80 select-none">
                        {saveCountLabel}
                      </span>
                      <Btn h={prevSaveHint} />
                      <Btn h={cycleSavesHint} />
                      <Btn h={nextSaveHint} />
                      <Btn h={randomSaveHint} />
                      <Btn h={saveCurrentHint} />
                      <Btn h={deleteSaveHint} />
                    </div>
                  </div>
                </div>
                <div className="w-full overflow-x-auto px-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <div className="mx-auto flex w-fit min-w-max items-center justify-center rounded-full border border-white/5 bg-black/40 px-3 py-1 backdrop-blur">
                    <div className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-white/8 bg-white/[0.03] px-1.5 py-0.5">
                      <Btn h={hints[1]!} />
                      <Btn h={hints[2]!} />
                      <Btn h={hints[3]!} />
                      <Btn h={hints[4]!} />
                      <Btn h={settingsHint} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TooltipProvider>
        </div>
      ) : (
        <button
          type="button"
          onClick={doToggleHints}
          title={xrActive ? "Show shortcuts" : "Show shortcuts (G)"}
          className="pointer-events-auto fixed inset-x-0 bottom-1 z-[100] mx-auto block w-fit rounded-full border border-white/5 bg-black/30 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.3em] text-white/30 backdrop-blur hover:text-white/70"
        >
          shortcuts
        </button>
      )}
    </>
  );
}
