import { ShortcutTooltipContent } from "./ShortcutTooltipContent";
import { VISUAL_RESPONSE, normalizeVisualResponse } from "@spectrum-aura/engine/visual-response";
import { ResponseControl } from "./ResponseControl";
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import {
  Gauge,
  Keyboard,
  LayoutGrid,
  Search,
  Maximize2,
  Mic,
  MonitorSpeaker,
  Play,
  Pause,
  Check,
  Minimize2,
  Save,
  Settings2,
  Shuffle,
  SkipBack,
  SkipForward,
  Sparkles,
} from "lucide-react";
import { settingsStore, useSettings, type Settings } from "./store";
import { dispatchBeatHint } from "@spectrum-aura/engine/beat-hint";
import { WEBXR_STATE_EVENT, requestWebXrToggle, type WebXrState } from "@spectrum-aura/engine/xr";
import { getVisualDefinition, VISUALS } from "@spectrum-aura/engine/visuals";
import { usePresetActions } from "./hooks/usePresetActions";
import { HUD_GLASS } from "./theme";
import { LIVE_TEMPO_EVENT, type LiveTempoState } from "@spectrum-aura/engine/live-tempo";
import {
  LOOK_DIGITS,
  OPEN_HELP_EVENT,
  OPEN_PALETTE_EVENT,
  RUN_ACTION_EVENT,
  actionForKey,
  capFor,
  type ActionId,
} from "./keymap";
import { useDraggablePanel } from "./hooks/useDraggablePanel";

const TIP_KEY = "analyser-first-run-tip-v1";
const TOGGLE_STATS_PANEL_EVENT = "spectrum-aura:toggle-stats-panel";
const TOGGLE_SETTINGS_PANEL_EVENT = "spectrum-aura:toggle-settings-panel";
const SETTINGS_PANEL_STATE_EVENT = "spectrum-aura:settings-panel-state";
const FRAME_STATS_EVENT = "spectrum-aura:frame-stats";
const AUDIO_SOURCE_STATE_EVENT = "spectrum-aura:audio-source-state";

/** Always-visible FPS readout in the Tools cluster; clicking opens the full
 * Stats for nerds panel. Colour tracks render health. */
function FpsChip({ fps }: { fps: number | null }) {
  if (fps === null) return null;
  const rounded = Math.round(fps);
  const tone =
    rounded >= 50
      ? "text-emerald-300 border-emerald-300/30"
      : rounded >= 30
        ? "text-amber-300 border-amber-300/30"
        : "text-red-400 border-red-400/40";
  return (
    <output
      aria-label={`${rounded} frames per second`}
      title="Live rendering frame rate"
      className={`pointer-events-auto flex min-w-[3rem] flex-col items-center justify-center gap-0.5 rounded-md border bg-white/[0.04] px-1.5 py-1 transition-colors ${tone}`}
    >
      <span className="font-mono text-[13px] leading-none tabular-nums">{rounded}</span>
      <span className="text-[8px] leading-none tracking-[0.14em] text-white/40">FPS</span>
    </output>
  );
}
const TOGGLE_FULLSCREEN_EVENT = "spectrum-aura:toggle-fullscreen";
const STOP_AUDIO_EVENT = "spectrum-aura:stop-audio";

const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

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
  /** Small status line under the label (e.g. the live audio source). */
  sub?: string;
  subTone?: string;
  disabledReason?: string;
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

// Chunky two-line button: key + icon on top, label underneath. Reads as a
// real button (bordered card) instead of a run of inline text, while the
// kbd chip keeps the keyboard shortcut visible.
const Btn = ({ h, xrActive }: { h: Hint; xrActive: boolean }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <button
        type="button"
        onClick={(event) => {
          if (!h.disabledReason) h.onClick(event);
        }}
        aria-disabled={Boolean(h.disabledReason)}
        aria-label={h.ariaLabel ?? h.label ?? h.title ?? h.key}
        aria-pressed={h.active}
        data-settings-shortcut={h.key === "S" ? "true" : undefined}
        className={`pointer-events-auto flex min-w-[3.4rem] flex-col items-center justify-center gap-1 rounded-md border px-1.5 py-1 transition-colors [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:shrink-0 ${
          h.disabledReason
            ? "cursor-not-allowed border-white/5 bg-white/[0.02] text-white/25"
            : h.active
              ? "border-emerald-300/40 bg-emerald-300/12 text-emerald-100 shadow-[0_0_12px_rgba(52,211,153,0.18)]"
              : "border-white/10 bg-white/[0.04] hover:border-white/25 hover:bg-white/10 hover:text-white/90"
        }`}
      >
        <span className="flex items-center gap-1.5">
          {!xrActive && h.showKey !== false && (
            <kbd className="rounded border border-white/15 bg-white/5 px-1 py-0.5 font-mono text-[9px] leading-none text-white/70">
              {h.key}
            </kbd>
          )}
          {h.icon ? <span className="text-white/75">{h.icon}</span> : null}
        </span>
        {h.label ? (
          <span className="text-[9px] leading-none tracking-[0.12em]">{h.label}</span>
        ) : null}
        {h.sub ? (
          <span
            className={`text-[8px] leading-none tracking-[0.14em] ${h.subTone ?? "text-white/40"}`}
          >
            {h.sub}
          </span>
        ) : null}
      </button>
    </TooltipTrigger>
    <ShortcutTooltipContent>
      {h.disabledReason ? (
        <TooltipBlock title={h.label ?? "Unavailable"} detail={h.disabledReason} />
      ) : (
        (h.tooltip ?? h.title ?? (xrActive || h.showKey === false ? h.label : `Press ${h.key}`))
      )}
    </ShortcutTooltipContent>
  </Tooltip>
);

// Labeled cluster card: a vertical group title on the left edge, buttons in
// a row. Cards flex-wrap, so wide screens show one tidy strip and narrow
// screens stack the groups instead of horizontally scrolling. When
// onTitleClick is given, the title itself pops open the matching settings
// slide-out.
const Group = ({
  title,
  onTitleClick,
  titleHint,
  children,
}: {
  title: string;
  onTitleClick?: () => void;
  titleHint?: string;
  children: ReactNode;
}) => (
  <div
    className={`pointer-events-auto flex items-stretch gap-1.5 rounded-xl border border-white/15 px-2 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${HUD_GLASS}`}
  >
    {onTitleClick ? (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onTitleClick}
            aria-label={titleHint ?? title}
            className="flex rotate-180 items-center justify-center rounded-md bg-white/8 px-0.5 py-1 font-mono text-[8px] uppercase tracking-[0.18em] text-emerald-200/80 transition-colors select-none [writing-mode:vertical-rl] hover:bg-emerald-300/20 hover:text-emerald-100"
          >
            {title} ↗
          </button>
        </TooltipTrigger>
        <ShortcutTooltipContent>
          <TooltipBlock title={title.toUpperCase()} detail={titleHint ?? title} />
        </ShortcutTooltipContent>
      </Tooltip>
    ) : (
      <span className="flex rotate-180 items-center justify-center rounded-md bg-white/8 px-0.5 py-1 font-mono text-[8px] uppercase tracking-[0.18em] text-emerald-200/80 select-none [writing-mode:vertical-rl]">
        {title}
      </span>
    )}
    <div className="flex items-center gap-1">{children}</div>
  </div>
);

export function Shortcuts() {
  const preset = usePresetActions();
  const barDrag = useDraggablePanel("shortcut-bar");
  const slots = preset.slots;
  const currentSave = slots[preset.currentSaveIndex];
  const noOtherSave =
    slots.length === 0
      ? "Save a preset first."
      : "This is the only preset and it is already showing.";
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));
  const [statsOpen, setStatsOpen] = useState(false);
  useEffect(() => {
    const onFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    const onStats = (event: Event) =>
      setStatsOpen(Boolean((event as CustomEvent<{ open: boolean }>).detail.open));
    document.addEventListener("fullscreenchange", onFullscreen);
    window.addEventListener("spectrum-aura:stats-panel-state", onStats);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreen);
      window.removeEventListener("spectrum-aura:stats-panel-state", onStats);
    };
  }, []);
  const settings = useSettings();
  const [visible, setVisible] = useState(true);
  const [windowHovering, setWindowHovering] = useState(true);
  const [xrActive, setXrActive] = useState(false);
  // The settings drawer covers most of the screen; the bar yields to it
  // entirely instead of peeking out from underneath.
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => {
    const onPanelState = (event: Event) => {
      setSettingsOpen(Boolean((event as CustomEvent<{ open?: boolean }>).detail?.open));
    };
    window.addEventListener(SETTINGS_PANEL_STATE_EVENT, onPanelState);
    return () => window.removeEventListener(SETTINGS_PANEL_STATE_EVENT, onPanelState);
  }, []);
  // What's feeding the visuals right now — broadcast by Analyser on source
  // changes; ambient mode comes from settings. Shown on the Audio Source
  // button so the HUD always says where the signal comes from.
  const [audioSource, setAudioSource] = useState<"mic" | "system" | "none">("none");
  useEffect(() => {
    const onSourceState = (event: Event) => {
      const source = (event as CustomEvent<{ source?: "mic" | "system" | "none" }>).detail?.source;
      setAudioSource(source === "mic" || source === "system" ? source : "none");
    };
    window.addEventListener(AUDIO_SOURCE_STATE_EVENT, onSourceState);
    return () => window.removeEventListener(AUDIO_SOURCE_STATE_EVENT, onSourceState);
  }, []);
  const ambientOn = settings.ambientMode && audioSource === "none";
  const audioSourceSub =
    audioSource === "mic"
      ? "mic · live"
      : audioSource === "system"
        ? "system · live"
        : ambientOn
          ? "ambient"
          : "off";
  const sourceSub = settings.midiEnabled
    ? audioSourceSub === "off"
      ? "MIDI enabled"
      : `${audioSourceSub} + MIDI`
    : audioSourceSub;
  const sourceTone =
    audioSource !== "none"
      ? "text-emerald-300"
      : ambientOn
        ? "text-emerald-300/80"
        : "text-white/35";

  // Live render-health beacon from the engine loop (500ms cadence) — the
  // always-visible slice of Stats for nerds.
  const [liveFps, setLiveFps] = useState<number | null>(null);
  useEffect(() => {
    const onFrameStats = (event: Event) => {
      const fps = (event as CustomEvent<{ fps?: number }>).detail?.fps;
      setLiveFps(typeof fps === "number" ? fps : null);
    };
    window.addEventListener(FRAME_STATS_EVENT, onFrameStats);
    return () => window.removeEventListener(FRAME_STATS_EVENT, onFrameStats);
  }, []);
  const [flash, setFlash] = useState<string | null>(null);
  const [hudOpen, setHudOpen] = useState(false);
  // One line of orientation for a new visitor, gone for good once dismissed
  // or once either shortcut it names has been used.
  const [tip, setTip] = useState(() => {
    try {
      return localStorage.getItem(TIP_KEY) !== "seen";
    } catch {
      return false;
    }
  });
  const dismissTip = () => {
    setTip(false);
    try {
      localStorage.setItem(TIP_KEY, "seen");
    } catch {
      // Storage unavailable: the tip simply returns next visit.
    }
  };
  useEffect(() => {
    if (!tip) return;
    window.addEventListener(OPEN_HELP_EVENT, dismissTip);
    window.addEventListener(OPEN_PALETTE_EVENT, dismissTip);
    return () => {
      window.removeEventListener(OPEN_HELP_EVENT, dismissTip);
      window.removeEventListener(OPEN_PALETTE_EVENT, dismissTip);
    };
  }, [tip]);
  // On a touch screen there is no keyboard to teach, so key caps and the
  // cheat sheet are left out and the buttons carry the labels alone.
  const [touch] = useState(() => {
    if (typeof window.matchMedia !== "function") return false;
    // A coarse pointer, or a touch device with nothing that can hover. A
    // laptop with a touchscreen still has a mouse and keeps the full toolbar.
    return (
      window.matchMedia("(pointer: coarse)").matches ||
      (navigator.maxTouchPoints > 0 && window.matchMedia("(hover: none)").matches)
    );
  });
  const noKeys = xrActive || touch;
  // A phone held upright has room for one row: the six things done most,
  // with everything else a tap away in Settings.
  // Narrow (upright) or short (on its side): either way one row is all there is room for.
  const isSmall = () => window.innerWidth < 640 || window.innerHeight < 500;
  const [narrow, setNarrow] = useState(isSmall);
  useEffect(() => {
    const onResize = () => setNarrow(isSmall());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const compact = touch && narrow && !xrActive;
  // The tap button is offered only while tempo is not locked: once the clock
  // has the beat there is nothing to tap in.
  const [tempoLocked, setTempoLocked] = useState(false);
  useEffect(() => {
    const onTempo = (event: Event) => {
      const detail = (event as CustomEvent<LiveTempoState>).detail;
      setTempoLocked(Boolean(detail?.barTiming?.bpmLocked));
    };
    window.addEventListener(LIVE_TEMPO_EVENT, onTempo);
    return () => window.removeEventListener(LIVE_TEMPO_EVENT, onTempo);
  }, []);
  const flashTimerRef = useRef<number | null>(null);

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
    const onWebXrState = (event: Event) => {
      const detail = (event as CustomEvent<WebXrState>).detail;
      if (!detail) return;
      setXrActive(detail.active);
    };
    window.addEventListener(WEBXR_STATE_EVENT, onWebXrState);
    return () => window.removeEventListener(WEBXR_STATE_EVENT, onWebXrState);
  }, []);

  useEffect(() => {
    const onPointerMove = () => {
      setWindowHovering((current) => (current ? current : true));
    };
    const onMouseLeave = () => {
      setWindowHovering(false);
    };

    window.addEventListener("mousemove", onPointerMove, true);
    document.documentElement.addEventListener("mouseleave", onMouseLeave);
    return () => {
      window.removeEventListener("mousemove", onPointerMove, true);
      document.documentElement.removeEventListener("mouseleave", onMouseLeave);
    };
  }, []);

  const randomizeBlocked =
    !settings.randomizeViewSettings && (!settings.postFxEnabled || settings.performance || xrActive)
      ? "Post FX are bypassed. Enable FX or include view settings (INC) to see randomization."
      : undefined;
  const doAdjustResponse = (direction: 1 | -1) => {
    const current = settingsStore.get().visualResponse;
    const visualResponse = normalizeVisualResponse(
      Number((current * 2 ** (direction * VISUAL_RESPONSE.logStep)).toFixed(2)),
    );
    settingsStore.set({ visualResponse });
    showFlash(`Response ${visualResponse.toFixed(2)}×`);
  };
  const doRandomize = () => {
    if (randomizeBlocked) return;
    settingsStore.randomize();
    showFlash("Randomized");
  };
  const doTogglePostFx = () => {
    if (settingsStore.get().performance || xrActive) return;
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
    if (!document.fullscreenElement && document.fullscreenEnabled === false) return;
    window.dispatchEvent(new Event(TOGGLE_FULLSCREEN_EVENT));
  };
  const doToggleSlotCycle = () => {
    const on = !settingsStore.get().slotCycleMode;
    if (on) {
      const hasAny = settingsStore.getSlots().filter(Boolean).length > 1;
      if (!hasAny) {
        showFlash("Save at least two presets to play them");
        return;
      }
    }
    settingsStore.set({ slotCycleMode: on, ...(on ? { viewCycleMode: false } : {}) });
    showFlash(on ? "Playing presets" : "Presets paused");
  };
  const doToggleViewCycle = () => {
    const on = !settingsStore.get().viewCycleMode;
    settingsStore.set({ viewCycleMode: on, ...(on ? { slotCycleMode: false } : {}) });
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
  const doToggleDynamic = () => {
    const next = !settingsStore.get().evolveEnabled;
    settingsStore.set({ evolveEnabled: next });
    showFlash(next ? "Dynamic mode ON" : "Dynamic mode OFF");
  };
  const doHelp = () => window.dispatchEvent(new Event(OPEN_HELP_EVENT));
  const doPalette = () => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT));
  const doToggleSettings = (tab?: "view" | "audio" | "scene" | "post" | "saves" | "midi") => {
    window.dispatchEvent(
      tab
        ? new CustomEvent(TOGGLE_SETTINGS_PANEL_EVENT, { detail: { tab } })
        : new Event(TOGGLE_SETTINGS_PANEL_EVENT),
    );
  };
  const doStopAudio = () => {
    window.dispatchEvent(new Event(STOP_AUDIO_EVENT));
    showFlash("Choose audio source");
  };
  const doToggleHints = () => {
    setVisible((v) => {
      const next = !v;
      showFlash(next ? "Shortcuts ON" : "Shortcuts OFF");
      return next;
    });
  };

  // Publish the bar's rendered height so the corner HUDs (BPM bottom-left,
  // latency bottom-right) can sit above it instead of overlapping — the bar
  // wraps to different heights per viewport, so this must be measured.
  const barRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const root = document.documentElement;
    const clear = () => root.style.setProperty("--bottom-hud-clearance", "0px");
    const el = barRef.current;
    if (!visible || xrActive || settingsOpen || !el) {
      clear();
      return;
    }
    const update = () =>
      root.style.setProperty("--bottom-hud-clearance", `${el.offsetHeight + 8}px`);
    update();
    if (typeof ResizeObserver === "undefined") return clear;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      observer.disconnect();
      clear();
    };
  }, [visible, xrActive, settingsOpen]);
  const flashLoaded = (msg: string) => showFlash(msg);
  const doSlot = (i: number) => {
    const result = preset.loadAt(i);
    if (result.status === "ok") flashLoaded(`Loaded ${result.name}`);
    else showFlash(`No preset ${i + 1}`);
  };
  const doSaveSlot = (i: number) => {
    const result = preset.saveAt(i);
    showFlash(
      result.status === "missing"
        ? "Fill the earlier presets first"
        : result.status === "unchanged"
          ? "Already saved"
          : result.status === "ok"
            ? `Saved ${result.name}`
            : "Saved",
    );
  };
  const doSaveCurrent = () => {
    const result = preset.saveNew();
    showFlash(
      result.status === "unchanged"
        ? "Already saved"
        : `Saved as ${result.status === "ok" ? result.name : "save"}`,
    );
  };
  const doCycleSave = (direction: 1 | -1) => {
    if (!preset.canLoadAnother) return;
    const result = preset.step(direction, { load: true });
    if (result.status === "ok") flashLoaded(`Loaded ${result.name}`);
    else showFlash("No saved presets");
  };
  const doRandomSave = () => {
    if (!preset.canLoadAnother) return;
    const result = preset.random({ load: true });
    if (result.status === "ok") flashLoaded(`Loaded ${result.name}`);
    else showFlash("No saved presets");
  };

  const actions = {
    doAdjustResponse,
    doRandomize,
    doToggleView,
    doToggleSlotCycle,
    doToggleViewCycle,
    doToggleDynamic,
    doTogglePostFx,
    doBeatHint,
    doCycleSave,
    doRandomSave,
    doFullscreen,
    doToggleSettings,
    doStopAudio,
    doToggleHints,
    doToggleLatency,
    doToggleBpmGrid,
    doToggleStats,
    doHelp,
    doPalette,
    doSaveSlot,
    doSlot,
  };
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  useEffect(() => {
    const digit = new RegExp(`^[1-${LOOK_DIGITS}]$`);
    const digitCode = new RegExp(`^(?:Digit|Numpad)([1-${LOOK_DIGITS}])$`);
    /**
     * Which preset a key press means, and whether it loads or saves. Keyboard
     * layouts differ in what the digit row types: on AZERTY a digit needs
     * Shift, and on many layouts Shift+7 is "/". So a typed digit always
     * loads, and Shift plus a digit key saves only when the character it
     * types is not a shortcut of its own.
     */
    const slotKey = (e: KeyboardEvent): { index: number; save: boolean } | null => {
      if (digit.test(e.key)) {
        const numpad = e.code.startsWith("Numpad");
        return { index: parseInt(e.key, 10) - 1, save: e.shiftKey && numpad };
      }
      const byCode = digitCode.exec(e.code)?.[1];
      if (byCode && e.shiftKey && !actionForKey(e)) {
        return { index: parseInt(byCode, 10) - 1, save: true };
      }
      return null;
    };
    /** Every shortcut, the palette and the cheat sheet run actions through here. */
    const run = (action: ActionId) => {
      const a = actionsRef.current;
      switch (action) {
        case "prevView":
          return a.doToggleView(-1);
        case "nextView":
          return a.doToggleView(1);
        case "randomize":
          return a.doRandomize();
        case "viewCycle":
          return a.doToggleViewCycle();
        case "dynamicMode":
          return a.doToggleDynamic();
        case "prevLook":
          return a.doCycleSave(-1);
        case "nextLook":
          return a.doCycleSave(1);
        case "randomLook":
          return a.doRandomSave();
        case "playLooks":
          return a.doToggleSlotCycle();
        case "responseDown":
          return a.doAdjustResponse(-1);
        case "responseUp":
          return a.doAdjustResponse(1);
        case "tapBeat":
          return a.doBeatHint(false);
        case "tapDownbeat":
          return a.doBeatHint(true);
        case "fullscreen":
          return a.doFullscreen();
        case "hideControls":
          return a.doToggleHints();
        case "postFx":
          return a.doTogglePostFx();
        case "bpmGrid":
          return a.doToggleBpmGrid();
        case "latency":
          return a.doToggleLatency();
        case "stats":
          return a.doToggleStats();
        case "settings":
          return a.doToggleSettings();
        case "palette":
          return a.doPalette();
        case "help":
          return a.doHelp();
        case "inputSource":
          return a.doStopAudio();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // While the search palette or the key sheet is open, keys belong to it:
      // nothing may change the scene behind it. `?` still closes the sheet.
      const modal = document.querySelector("[data-blocks-shortcuts]");
      if (modal) {
        if (modal.getAttribute("data-blocks-shortcuts") === "sheet" && actionForKey(e) === "help") {
          run("help");
          e.preventDefault();
        }
        return;
      }
      const target = e.target instanceof HTMLElement ? e.target : null;
      // Typing never triggers a shortcut.
      if (
        target?.closest(
          "input:not([type='range']), textarea, select, [contenteditable='true'], [role='textbox']",
        )
      )
        return;
      // Sliders and switches keep their own keys; only S (settings) reaches through.
      const onControl = target?.closest("input, [role='slider'], [role='switch']");
      if (onControl && e.key.toLowerCase() !== "s") return;
      if (target?.closest("[data-own-arrow-keys]") && e.key.startsWith("Arrow")) return;
      // A focused button is pressed by Space and Enter, and an open panel scrolls with ↑ ↓.
      if ((e.key === " " || e.key === "Enter") && target?.closest("button, a, [role='button']"))
        return;
      if (
        (e.key === "ArrowUp" || e.key === "ArrowDown") &&
        target?.closest("[data-analyser-flyout]")
      )
        return;

      const slot = slotKey(e);
      if (slot) {
        if (slot.save) actionsRef.current.doSaveSlot(slot.index);
        else actionsRef.current.doSlot(slot.index);
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const action = actionForKey(e);
      if (!action) return;
      run(action);
      e.preventDefault();
      e.stopPropagation();
    };
    const onRunAction = (event: Event) => {
      const action = (event as CustomEvent<ActionId>).detail;
      if (action) run(action);
    };
    window.addEventListener(RUN_ACTION_EVENT, onRunAction);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener(RUN_ACTION_EVENT, onRunAction);
      window.removeEventListener("keydown", onKey, true);
    };
  }, []);

  const prevVisualHint: Hint = {
    key: capFor("prevView"),
    label: compact ? "Prev" : "Prev Visual",
    icon: <SkipBack />,
    tooltip: (
      <TooltipBlock
        title="Prev Visual"
        hint="← or B"
        detail="Steps backward through the visual list."
      />
    ),
    onClick: () => {
      doToggleView(-1);
    },
  };
  const nextVisualHint: Hint = {
    key: capFor("nextView"),
    label: compact ? "Next" : "Next Visual",
    icon: <SkipForward />,
    tooltip: (
      <TooltipBlock
        title="Next Visual"
        hint="→ or V"
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
      label: compact ? "Random" : "Randomize",
      disabledReason: randomizeBlocked,
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
      key: capFor("inputSource"),
      label: compact ? "Input" : "Input Source",
      icon: audioSource === "system" ? <MonitorSpeaker /> : ambientOn ? <Sparkles /> : <Mic />,
      active: audioSource !== "none" || ambientOn || settings.midiEnabled,
      sub: sourceSub,
      subTone: sourceTone,
      tooltip: (
        <TooltipBlock
          title="Input Source"
          hint="X"
          detail={`Current source: ${
            audioSource === "mic"
              ? "microphone"
              : audioSource === "system"
                ? "system audio"
                : ambientOn
                  ? "ambient mode (synthetic groove)"
                  : "none"
          }. Open the source picker${audioSource !== "none" ? " (stops current capture)" : ""}.`}
        />
      ),
      onClick: () => {
        doStopAudio();
      },
    },
    {
      key: "F",
      label: fullscreen ? "Exit Fullscreen" : "Fullscreen",
      disabledReason:
        !fullscreen && document.fullscreenEnabled === false
          ? "Fullscreen is unavailable in this browser."
          : undefined,
      active: fullscreen,
      icon: fullscreen ? <Minimize2 /> : <Maximize2 />,
      tooltip: (
        <TooltipBlock
          title="Fullscreen"
          hint="F"
          detail={
            fullscreen ? "Return to the browser window." : "Expand the analyser to fullscreen."
          }
        />
      ),
      onClick: () => {
        doFullscreen();
      },
    },
    {
      key: "N",
      label: "Stats",
      active: statsOpen,
      tooltip: (
        <TooltipBlock
          title="Stats"
          hint="N"
          detail={
            statsOpen
              ? "Close the diagnostics panel. Shift+N toggles full page."
              : "Open FPS, renderer and audio diagnostics. Shift+N opens full page."
          }
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
      key: capFor("hideControls"),
      label: "Hide",
      tooltip: (
        <TooltipBlock
          title="Hide Shortcuts"
          hint="G"
          detail="Collapses the shortcut strip. Press G again or click the shortcuts pill to restore."
        />
      ),
      onClick: () => {
        doToggleHints();
      },
    },
  ];
  const beatTapHint: Hint = {
    key: "T",
    label: "Beat Tap",
    tooltip: (
      <TooltipBlock
        title="Beat Tap"
        hint="T"
        detail="Tap on the beat to lock the sync grid. Shift+T sets the downbeat (1/16)."
      />
    ),
    onClick: () => {
      doBeatHint(false);
    },
    title: "Tap beat for manual sync",
  };
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
        detail="Opens the settings panel: view, effects, scene, audio, presets and MIDI."
      />
    ),
    onClick: () => {
      doToggleSettings();
    },
  };
  const searchHint: Hint = {
    key: capFor("palette"),
    label: "Search",
    icon: <Search />,
    tooltip: (
      <TooltipBlock
        title="Search everything"
        hint={`${capFor("palette")} or ⌘K`}
        detail="Find any view, saved preset, effect, setting or action by typing its name."
      />
    ),
    onClick: () => doPalette(),
  };
  const helpHint: Hint = {
    key: capFor("help"),
    label: "Keys",
    icon: <Keyboard />,
    tooltip: (
      <TooltipBlock
        title="Keyboard shortcuts"
        hint={capFor("help")}
        detail="Shows every shortcut on one sheet."
      />
    ),
    onClick: () => doHelp(),
  };
  const hudOn = settings.showBPM || settings.showLatency || statsOpen;
  const hudHint: Hint = {
    key: "",
    label: "Displays",
    icon: <Gauge />,
    showKey: false,
    active: hudOpen || hudOn,
    tooltip: (
      <TooltipBlock
        title="On-screen displays"
        detail="Tempo and bar grid, latency, frame rate and stats for nerds."
      />
    ),
    onClick: () => setHudOpen((open) => !open),
  };
  const cycleSavesHint: Hint = {
    key: capFor("playLooks"),
    label: compact
      ? settings.slotCycleMode
        ? "Pause"
        : "Play"
      : settings.slotCycleMode
        ? "Pause Presets"
        : "Play Presets",
    icon: settings.slotCycleMode ? <Pause /> : <Play />,
    disabledReason:
      !settings.slotCycleMode && slots.length < 2
        ? "Save at least two presets to cycle between them."
        : undefined,
    active: settings.slotCycleMode,
    tooltip: (
      <TooltipBlock
        title="Play Presets"
        hint="A"
        detail={
          settings.slotCycleMode
            ? "Pause on the current preset."
            : "Play your presets in order. Starting playback stops View Cycle."
        }
      />
    ),
    onClick: () => {
      doToggleSlotCycle();
    },
  };
  const prevSaveHint: Hint = {
    key: capFor("prevLook"),
    label: "Prev Preset",
    disabledReason: !preset.canLoadAnother ? noOtherSave : undefined,
    icon: <SkipBack />,
    tooltip: (
      <TooltipBlock
        title="Previous Preset"
        hint="[ or ⇧←"
        detail="Loads the previous preset in your list."
      />
    ),
    onClick: () => {
      doCycleSave(-1);
    },
  };
  const nextSaveHint: Hint = {
    key: capFor("nextLook"),
    label: "Next Preset",
    disabledReason: !preset.canLoadAnother ? noOtherSave : undefined,
    icon: <SkipForward />,
    tooltip: (
      <TooltipBlock
        title="Next Preset"
        hint="] or ⇧→"
        detail="Loads the next preset in your list."
      />
    ),
    onClick: () => {
      doCycleSave(1);
    },
  };
  const saveCurrentHint: Hint = {
    key: "",
    label: preset.canSaveNew ? "Save Preset" : "Saved",
    ariaLabel: "Save",
    disabledReason: currentSave
      ? `Already saved as ${currentSave.name}. Change the look to save a new version.`
      : undefined,
    icon: preset.canSaveNew ? <Save /> : <Check />,
    tooltip: (
      <TooltipBlock
        title="Save Preset"
        detail="Captures the current setup as a new saved state at the end of the list."
      />
    ),
    onClick: () => {
      doSaveCurrent();
    },
    title: "Save what is on screen as a preset",
    showKey: false,
  };

  const saveCountLabel = `${slots.length} preset${slots.length === 1 ? "" : "s"}`;

  return (
    <>
      {flash && (
        <div className="pointer-events-none fixed left-1/2 top-6 z-[110] -translate-x-1/2 rounded-full border border-white/10 bg-black/70 px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-white/90 backdrop-blur">
          {flash}
        </div>
      )}
      {visible && !settingsOpen ? (
        <div
          ref={barRef}
          className={`pointer-events-none fixed inset-x-0 z-[100] flex justify-center ${xrActive ? "top-3" : "bottom-3"}`}
        >
          <TooltipProvider delayDuration={120}>
            <div
              className="pointer-events-auto flex w-fit max-w-[calc(100vw-1.5rem)] flex-col items-center gap-1"
              {...barDrag.handleProps}
              style={barDrag.style}
            >
              {/* High visual name, subtle */}
              <div className="mb-1 w-full text-center">
                <span className="font-mono text-[13px] font-semibold uppercase tracking-[0.22em] text-white/35 select-none">
                  {visualLabel}
                </span>
              </div>
              <div className="font-mono text-[10px] text-white/55">
                {currentSave ? `Saved · ${currentSave.name}` : "Not saved as a preset"}
              </div>
              {xrActive && (
                <div className="rounded-full border border-emerald-300/25 bg-black/50 px-3 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-emerald-200/75 backdrop-blur">
                  XR: right A settings · right B stats · hold both grips exit
                </div>
              )}
              {tip && !noKeys && (
                <button
                  type="button"
                  onClick={dismissTip}
                  title="Dismiss"
                  className="pointer-events-auto rounded-full border border-emerald-300/25 bg-black/60 px-3 py-1 font-mono text-[10px] tracking-wide text-emerald-100/85 backdrop-blur hover:border-emerald-300/50"
                >
                  New here? Press{" "}
                  <kbd className="mx-0.5 rounded border border-white/20 px-1">?</kbd> for the keys,
                  or <kbd className="mx-0.5 rounded border border-white/20 px-1">/</kbd> to search
                  for anything. <span className="text-white/40">×</span>
                </button>
              )}
              {is3DMode && !xrActive && (
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">
                  {touch ? "3D: drag to move camera" : "3D: drag mouse to move camera"}
                </div>
              )}
              <div className="flex w-full max-w-[calc(100vw-1rem)] flex-wrap items-stretch justify-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-white/75">
                {compact ? (
                  <div className="pointer-events-auto flex w-[calc(100vw-1.5rem)] max-w-md items-stretch justify-between gap-1 rounded-xl border border-white/15 bg-black/55 px-1.5 py-1.5 backdrop-blur-xl [&>button]:min-w-0 [&>button]:flex-1 [&>button]:px-0.5 [&_span]:tracking-normal">
                    {audioSource === "none" && <Btn xrActive={noKeys} h={hints[1]!} />}
                    <Btn xrActive={noKeys} h={prevVisualHint} />
                    <Btn xrActive={noKeys} h={hints[0]!} />
                    <Btn xrActive={noKeys} h={nextVisualHint} />
                    <Btn xrActive={noKeys} h={cycleSavesHint} />
                    <Btn xrActive={noKeys} h={settingsHint} />
                    <Btn xrActive={noKeys} h={hints[6]!} />
                  </div>
                ) : (
                  <>
                    {xrActive && <Btn xrActive={noKeys} h={xrHint} />}
                    {/* Shown only when there is something to do: no input yet, or
                    a tempo that has not locked and can be tapped in. */}
                    {audioSource === "none" && <Btn xrActive={noKeys} h={hints[1]!} />}
                    <Group
                      title={visualCountLabel}
                      onTitleClick={() => doToggleSettings("view")}
                      titleHint="Open the view picker and this view's settings"
                    >
                      <Btn xrActive={noKeys} h={prevVisualHint} />
                      <Btn xrActive={noKeys} h={hints[0]!} />
                      <Btn xrActive={noKeys} h={nextVisualHint} />
                    </Group>
                    <Group
                      title={saveCountLabel}
                      onTitleClick={() => doToggleSettings("saves")}
                      titleHint="Open the presets"
                    >
                      <Btn xrActive={noKeys} h={prevSaveHint} />
                      <Btn xrActive={noKeys} h={cycleSavesHint} />
                      <Btn xrActive={noKeys} h={nextSaveHint} />
                      <Btn xrActive={noKeys} h={saveCurrentHint} />
                    </Group>
                    <ResponseControl showKeys={!noKeys} />
                    {audioSource !== "none" && !tempoLocked && (
                      <Btn xrActive={noKeys} h={beatTapHint} />
                    )}
                    <Group title="more" titleHint="Settings, search and displays">
                      <Btn xrActive={noKeys} h={settingsHint} />
                      <Btn xrActive={noKeys} h={searchHint} />
                      <Btn xrActive={noKeys} h={hints[2]!} />
                      <div className="relative flex">
                        <Btn xrActive={noKeys} h={hudHint} />
                        {hudOpen && (
                          <div
                            role="group"
                            aria-label="On-screen displays"
                            className="absolute bottom-full right-0 z-10 mb-2 flex gap-1 rounded-md border border-white/10 bg-black/85 p-1.5 backdrop-blur-xl"
                          >
                            <Btn xrActive={noKeys} h={hints[5]!} />
                            <Btn xrActive={noKeys} h={hints[4]!} />
                            <Btn xrActive={noKeys} h={hints[3]!} />
                            <FpsChip fps={liveFps} />
                          </div>
                        )}
                      </div>
                      {!touch && <Btn xrActive={noKeys} h={helpHint} />}
                      <Btn xrActive={noKeys} h={hints[6]!} />
                    </Group>
                  </>
                )}
              </div>
            </div>
          </TooltipProvider>
        </div>
      ) : settingsOpen ? null : (
        <button
          type="button"
          onClick={doToggleHints}
          title={xrActive ? "Show controls" : "Show controls (H)"}
          data-window-hovering={windowHovering ? "true" : "false"}
          className={`pointer-events-auto fixed inset-x-0 bottom-1 z-[100] mx-auto block w-fit rounded-full border bg-black/50 px-3 py-1 font-mono text-[9px] uppercase tracking-[0.22em] backdrop-blur transition-opacity duration-300 hover:border-white/20 hover:text-white/80 ${
            windowHovering
              ? "border-white/10 text-white/45 opacity-65"
              : "border-white/5 text-white/15 opacity-10"
          }`}
        >
          controls · h
        </button>
      )}
    </>
  );
}
