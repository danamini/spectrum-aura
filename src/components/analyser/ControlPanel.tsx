import * as React from "react";
import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

import { Label } from "@/components/ui/label";
import { Bn, Disclosure, FxSection, Row, S, Sw, ToggleRow } from "./control-panel/primitives";
import { ViewSettings } from "./control-panel/ViewSettings";
import {
  ChevronDown,
  Play,
  Plus,
  Save,
  Shuffle,
  SkipBack,
  SkipForward,
  Trash2,
} from "lucide-react";
import {
  WEBXR_BACKGROUND_EVENT,
  WEBXR_STATE_EVENT,
  probeWebXrSupport,
  requestWebXrToggle,
  type WebXrState,
} from "@spectrum-aura/engine/xr";
import { TempoReadout } from "./TempoReadout";
import { usePresetActions } from "./hooks/usePresetActions";
import { useMidiControl } from "./hooks/useMidiControl";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  EMPTY_LIVE_TEMPO,
  LIVE_TEMPO_EVENT,
  type LiveTempoState,
} from "@spectrum-aura/engine/live-tempo";
import {
  BLOOM_STRENGTH_MAX_NORMAL,
  DEFAULT_FX_PIPELINE_ORDER,
  FX_PIPELINE,
  PALETTES,
  PRESETS,
  RETRO_SYSTEMS,
  settingsStore,
  useSettings,
  type FxLockId,
  type FxPassId,
  type SavedSlot,
  type Settings,
} from "./store";
import { getVisualDefinition, VISUALS } from "@spectrum-aura/engine/visuals";

const TOGGLE_SETTINGS_PANEL_EVENT = "spectrum-aura:toggle-settings-panel";
const SETTINGS_PANEL_STATE_EVENT = "spectrum-aura:settings-panel-state";

/** Which settings flag lights each pipeline row's "enabled" dot (SMAA has no
 * user flag — it is always on, so it has no entry here). */
const FX_PASS_ENABLED_FLAGS: Partial<Record<FxPassId, keyof Settings>> = {
  bloom: "bloom",
  godRays: "godRays",
  lensFlare: "lensFlare",
  assetOverlay: "assetOverlayFx",
  dof: "dof",
  chroma: "chroma",
  tiltShift: "tiltShift",
  kaleidoscope: "kaleidoscope",
  mirror: "mirrorFx",
  crt: "crtFx",
  projectorFilm: "projectorFilmFx",
  radialBlur: "radialBlur",
  pixelate: "pixelate",
  grain: "grain",
  glitch: "glitch",
  grading: "grading",
  sobel: "sobelMode",
  vignette: "vignette",
  retro: "retroFx",
  ascii: "asciiFx",
};

/** One-line save-slot summary: view · palette · standout FX. */
function describeSlot(slot: SavedSlot): string {
  const st = slot.settings;
  const view = getVisualDefinition(st.view)?.settingsLabel?.replace(/\s*settings$/i, "") ?? st.view;
  const palette = PALETTES[st.paletteIndex]?.name;
  const fx: string[] = [];
  if (st.retroFx) {
    fx.push(RETRO_SYSTEMS.find((sys) => sys.id === st.retroSystem)?.label ?? "Retro");
  }
  if (st.asciiFx) fx.push("ASCII");
  if (st.crtFx) fx.push("CRT");
  if (st.projectorFilmFx) fx.push("Film");
  if (st.kaleidoscope) fx.push("Kaleido");
  if (st.mirrorFx) fx.push("Mirror");
  if (st.pixelate) fx.push("Pixelate");
  if (st.sobelMode) fx.push("Sobel");
  if (st.glitch) fx.push("Glitch");
  if (st.bloomExtreme) fx.push("Bloom+");
  return [view, palette, ...fx.slice(0, 3)].filter(Boolean).join(" · ");
}

const UI_KEY = "analyser-ui-v1";
type UIState = { viewSettingsOpen: boolean; activeTab: string };
const loadUI = (): UIState => {
  const fallback: UIState = { viewSettingsOpen: true, activeTab: "post" };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(UI_KEY);
    if (raw) return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
  return fallback;
};

export function ControlPanel() {
  const s = useSettings();
  const preset = usePresetActions();
  const isMobile = useIsMobile();
  const midi = useMidiControl();
  const [open, setOpen] = useState(false);
  // Standalone pop-out: a flyout tab opened straight from the shortcut bar
  // without the full controls drawer — Post FX / Scene / Saves / Audio dock
  // to the screen edge on their own.
  const [standalone, setStandalone] = useState(false);
  const [flyoutVisible, setFlyoutVisible] = useState(false);
  const [xrState, setXrState] = useState<WebXrState>({
    available: false,
    active: false,
    pending: false,
    error: null,
    backgroundHidden: false,
  });
  const [ui, setUi] = useState<UIState>(loadUI);
  const uiRef = React.useRef(ui);
  uiRef.current = ui;
  const openRef = React.useRef(open);
  openRef.current = open;
  const standaloneRef = React.useRef(standalone);
  standaloneRef.current = standalone;
  const [liveTempo, setLiveTempo] = useState<LiveTempoState>(EMPTY_LIVE_TEMPO);
  const flyoutPanelRef = React.useRef<HTMLDivElement | null>(null);
  const updateUi = (patch: Partial<UIState>) => {
    setUi((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(UI_KEY, JSON.stringify(next));
      } catch {
        return next;
      }
      return next;
    });
  };
  const viewSettingsOpen = ui.viewSettingsOpen;
  const setViewSettingsOpen = (v: boolean | ((o: boolean) => boolean)) =>
    updateUi({ viewSettingsOpen: typeof v === "function" ? v(ui.viewSettingsOpen) : v });
  const blurFlyoutFocus = () => {
    const panel = flyoutPanelRef.current;
    const activeEl = typeof document !== "undefined" ? document.activeElement : null;
    if (panel && activeEl instanceof HTMLElement && panel.contains(activeEl)) {
      activeEl.blur();
    }
  };
  const closeFlyout = () => {
    blurFlyoutFocus();
    setStandalone(false);
    updateUi({ activeTab: "" });
  };
  React.useEffect(() => {
    if (!ui.activeTab) {
      blurFlyoutFocus();
    }
  }, [ui.activeTab]);
  React.useEffect(() => {
    if (!open && !standalone) {
      setFlyoutVisible(false);
      return;
    }
    // Standalone pop-outs appear immediately; beside the drawer the flyout
    // waits for the sheet's slide-in.
    const id = window.setTimeout(() => setFlyoutVisible(true), open ? 220 : 30);
    return () => window.clearTimeout(id);
  }, [open, standalone]);
  // Broadcast open state so the shortcut bar can get out of the way — the
  // drawer/pop-outs cover a lot of screen and overlapping windows read as
  // clutter.
  React.useEffect(() => {
    window.dispatchEvent(
      new CustomEvent(SETTINGS_PANEL_STATE_EVENT, { detail: { open: open || standalone } }),
    );
  }, [open, standalone]);
  const set = (patch: Partial<Settings>) => settingsStore.set(patch);
  const pinnedIn = (ids: FxLockId[]) => ids.filter((id) => s.fxLocks.includes(id)).length;

  const hasViewSettings = true;
  const currentVisual = getVisualDefinition(s.view);
  const viewLabel = currentVisual?.settingsLabel ?? `${s.view} settings`;
  const viewOptions = VISUALS;
  const fullscreenKey = currentVisual?.fullscreenKey as keyof Settings | undefined;
  const is2d = fullscreenKey ? Boolean(s[fullscreenKey]) : false;
  const wireframeKey = currentVisual?.wireframeKey as keyof Settings | undefined;
  const hasGlobalWireframe = Boolean(wireframeKey);
  const globalWireframeEnabled = wireframeKey ? Boolean(s[wireframeKey]) : false;
  const setCurrentViewWireframe = (value: boolean) => {
    if (!wireframeKey) return;
    set({ [wireframeKey]: value } as Partial<Settings>);
  };
  const setCurrentViewFullscreen = (value: boolean) => {
    if (!fullscreenKey) return;
    set({ [fullscreenKey]: value } as Partial<Settings>);
  };

  React.useEffect(() => {
    let alive = true;
    void probeWebXrSupport().then((available) => {
      if (!alive) return;
      setXrState((prev) => ({ ...prev, available }));
    });

    const onWebXrState = (event: Event) => {
      const detail = (event as CustomEvent<WebXrState>).detail;
      if (!detail) return;
      setXrState(detail);
      if (detail.active) {
        setOpen(true);
      }
      if (!detail.active) {
        setOpen(false);
      }
    };

    window.addEventListener(WEBXR_STATE_EVENT, onWebXrState);
    const onBackgroundEvent = (event: Event) => {
      const hidden = Boolean((event as CustomEvent<boolean>).detail);
      setXrState((prev) => ({ ...prev, backgroundHidden: hidden }));
    };
    window.addEventListener(WEBXR_BACKGROUND_EVENT, onBackgroundEvent);
    return () => {
      alive = false;
      window.removeEventListener(WEBXR_STATE_EVENT, onWebXrState);
      window.removeEventListener(WEBXR_BACKGROUND_EVENT, onBackgroundEvent);
    };
  }, []);

  React.useEffect(() => {
    // Plain event = toggle the controls drawer. With a `tab` detail
    // (shortcut-bar titles / Settings button): while the drawer is open the
    // flyout docks beside it as before; with the drawer closed the tab opens
    // as a STANDALONE pop-out on the screen edge. Repeating the same tab
    // closes it.
    const onToggleSettingsPanel = (event: Event) => {
      const tab = (event as CustomEvent<{ tab?: UIState["activeTab"] } | undefined>).detail?.tab;
      if (!tab || !["audio", "scene", "post", "saves"].includes(tab)) {
        setStandalone(false);
        setOpen((v) => !v);
        return;
      }
      if (openRef.current) {
        if (uiRef.current.activeTab === tab) {
          setOpen(false);
          return;
        }
        updateUi({ activeTab: tab });
        return;
      }
      if (standaloneRef.current && uiRef.current.activeTab === tab) {
        setStandalone(false);
        return;
      }
      updateUi({ activeTab: tab });
      setStandalone(true);
    };
    window.addEventListener(TOGGLE_SETTINGS_PANEL_EVENT, onToggleSettingsPanel);
    return () => window.removeEventListener(TOGGLE_SETTINGS_PANEL_EVENT, onToggleSettingsPanel);
  }, []);

  // Escape closes panels progressively: an open flyout/pop-out first, then
  // the drawer on the next press. (Radix only handles Esc while focus is
  // inside the sheet; this covers pop-outs and unfocused states.)
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (standaloneRef.current || (openRef.current && uiRef.current.activeTab)) {
        closeFlyout();
        return;
      }
      if (openRef.current) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    const onLiveTempo = (event: Event) => {
      const detail = (event as CustomEvent<LiveTempoState>).detail;
      if (!detail) return;
      setLiveTempo(detail);
    };
    window.addEventListener(LIVE_TEMPO_EVENT, onLiveTempo);
    return () => window.removeEventListener(LIVE_TEMPO_EVENT, onLiveTempo);
  }, []);

  const xrOverlay = xrState.active ? (
    <div className="pointer-events-none fixed left-4 top-4 z-50 flex max-w-[280px] items-start">
      <div className="pointer-events-auto rounded-md border border-emerald-400/30 bg-black/80 px-3 py-2 text-white shadow-[0_0_24px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-emerald-300/80">
          WebXR active
        </div>
        <div className="mt-1 text-[11px] text-white/60">
          Quest Browser hides desktop overlays in immersive VR. Use the in-headset XR HUD.
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Bn variant="primary" onClick={requestWebXrToggle} disabled={xrState.pending}>
            Exit WebXR
          </Bn>
        </div>
        <div className="mt-2 text-[10px] text-white/55">
          Left trigger switches HUD page. Right trigger changes view. Hold both grips to exit.
        </div>
        {xrState.error && <div className="mt-2 text-[10px] text-rose-300/80">{xrState.error}</div>}
      </div>
    </div>
  ) : null;

  return (
    <>
      {xrOverlay}
      <Sheet
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (v) setStandalone(false);
        }}
        modal={false}
      >
        <SheetContent
          onInteractOutside={(e) => {
            const t = e.target as HTMLElement | null;
            if (
              t &&
              (t.closest("[data-analyser-flyout]") || t.closest("[data-settings-shortcut='true']"))
            )
              e.preventDefault();
          }}
          className={`analyser-scroll w-full overflow-y-auto bg-black/85 backdrop-blur-xl border-white/10 text-white text-[12px] md:w-[380px] md:max-w-[380px] ${isMobile ? "z-[102]" : ""}`}
        >
          <SheetHeader>
            <SheetTitle className="font-mono text-[11px] uppercase tracking-[0.3em] text-white/70">
              Controls
            </SheetTitle>
            <SheetDescription className="sr-only">
              Visualizer settings: view selection, audio, scene, post FX, and saved presets.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-4 pb-10">
            <Row label="View">
              <div className="grid grid-cols-2 gap-2">
                {viewOptions.map((v) => (
                  <Bn key={v.id} active={s.view === v.id} onClick={() => set({ view: v.id })}>
                    {v.label}
                  </Bn>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <Bn active={!is2d} onClick={() => setCurrentViewFullscreen(false)}>
                  3D
                </Bn>
                <Bn active={is2d} onClick={() => setCurrentViewFullscreen(true)}>
                  2D
                </Bn>
              </div>
              {xrState.available && (
                <div className="mt-2 rounded-md border border-cyan-400/20 bg-cyan-400/[0.04] px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <Label className="text-[11px]">WebXR / Meta Quest</Label>
                      <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-cyan-200/70 mt-0.5">
                        Immersive VR available
                      </div>
                      <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.16em] text-amber-200/75">
                        XR support is alpha
                      </div>
                    </div>
                    <Bn variant="primary" onClick={requestWebXrToggle} disabled={xrState.pending}>
                      Enter VR
                    </Bn>
                  </div>
                  <div className="mt-2 rounded-md border border-white/10 bg-black/20 px-3 py-2 text-[10px] text-white/55">
                    Passthrough is not supported by Quest Browser in immersive-vr, so transparent
                    background has no visible effect here.
                  </div>
                  {xrState.error && (
                    <div className="mt-2 text-[10px] text-rose-300/80">{xrState.error}</div>
                  )}
                </div>
              )}
              {!xrState.available && (
                <div className="mt-2 rounded-md border border-white/10 bg-white/[0.02] px-3 py-2 font-mono text-[9px] uppercase tracking-[0.16em] text-white/35">
                  WebXR unavailable in this browser
                </div>
              )}
              <div className="flex items-center justify-between mt-2 rounded-md border border-white/10 bg-white/[0.02] px-3 py-2.5">
                <div>
                  <Label className="text-[11px]">Wireframe</Label>
                  {!hasGlobalWireframe && (
                    <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/35 mt-0.5">
                      Not available for this view
                    </div>
                  )}
                </div>
                <Sw
                  checked={globalWireframeEnabled}
                  onCheckedChange={setCurrentViewWireframe}
                  disabled={!hasGlobalWireframe}
                />
              </div>
            </Row>
            <p className="px-1 font-mono text-[9px] leading-relaxed text-white/35">
              Auto view cycling and Dynamic Mode moved to the Scene panel (bar → Tools → Scene, or
              the rail).
            </p>

            {hasViewSettings && (
              <div className="rounded-md border border-white/10 bg-white/[0.03]">
                <button
                  onClick={() => setViewSettingsOpen((o) => !o)}
                  className="flex w-full items-center justify-between px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-white/60 hover:text-white"
                >
                  <span>{viewLabel}</span>
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform ${viewSettingsOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {viewSettingsOpen && <ViewSettings s={s} set={set} />}
              </div>
            )}
          </div>
        </SheetContent>

        {/* Tab strip + slide-out panels. Beside the open sheet the flyout
            docks at the sheet's edge with the rail; opened standalone from
            the shortcut bar it docks to the screen edge without the rail.
            Mobile gets a bottom tab bar + full-screen panel. */}
        {(open || standalone) && (
          <>
            {/* Tab strip — vertical rail beside the sheet on desktop, bottom bar on mobile */}
            <div
              data-analyser-flyout
              hidden={!open && !isMobile}
              className={
                (isMobile
                  ? "fixed inset-x-0 bottom-0 z-[110] flex flex-row gap-1 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] "
                  : "fixed right-[380px] top-1/2 z-[60] -translate-y-1/2 flex flex-col gap-1 ") +
                "transition-all duration-[220ms] ease-out " +
                (flyoutVisible
                  ? "translate-x-0 opacity-100"
                  : (isMobile ? "translate-y-4" : "translate-x-4") +
                    " opacity-0 pointer-events-none")
              }
            >
              {(
                [
                  { id: "audio", label: "Audio" },
                  { id: "scene", label: "Scene" },
                  { id: "post", label: "Post FX" },
                  { id: "saves", label: "Saves" },
                ] as const
              ).map((t) => {
                const active = ui.activeTab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => updateUi({ activeTab: active ? "" : t.id })}
                    className={
                      (isMobile
                        ? "flex-1 h-11 rounded-md border backdrop-blur-xl transition-all flex items-center justify-center "
                        : "group h-24 w-9 rounded-l-md border border-r-0 backdrop-blur-xl transition-all flex items-center justify-center ") +
                      (active
                        ? "bg-emerald-400 text-black border-emerald-300/60 shadow-[0_0_14px_rgba(52,211,153,0.55)]"
                        : "bg-black/70 text-white/70 border-white/10 hover:text-white hover:bg-black/85")
                    }
                    title={t.label}
                  >
                    <span
                      className="font-mono text-[10px] uppercase tracking-[0.2em]"
                      style={
                        isMobile
                          ? undefined
                          : { writingMode: "vertical-rl", transform: "rotate(180deg)" }
                      }
                    >
                      {t.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Slide-out content panel — beside the tab strip on desktop, full-screen on mobile */}
            <div
              data-analyser-flyout
              ref={flyoutPanelRef}
              aria-hidden={!ui.activeTab}
              inert={!ui.activeTab}
              className={
                "analyser-scroll fixed overflow-y-auto bg-black/85 backdrop-blur-xl text-white text-[12px] " +
                (isMobile
                  ? "inset-0 z-[105] h-screen w-full border-white/10 "
                  : open
                    ? "right-[416px] top-0 z-[55] h-screen w-[min(720px,calc(100vw-460px))] border-l border-r border-white/10 "
                    : "right-0 top-0 z-[90] h-screen w-[min(720px,calc(100vw-48px))] border-l border-white/10 ") +
                "transition-all duration-300 ease-out " +
                (ui.activeTab && flyoutVisible
                  ? "translate-x-0 translate-y-0 opacity-100"
                  : (isMobile ? "translate-y-6" : "translate-x-[calc(100%+80px)]") +
                    " opacity-0 pointer-events-none")
              }
            >
              <div className={`@container p-4 space-y-4 ${isMobile ? "pb-24" : "pb-12"}`}>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-white/70">
                    {ui.activeTab === "audio"
                      ? "Audio"
                      : ui.activeTab === "scene"
                        ? "Scene"
                        : ui.activeTab === "post"
                          ? "Post FX"
                          : ui.activeTab === "saves"
                            ? "Saves"
                            : ""}
                  </span>
                  <button
                    onClick={closeFlyout}
                    className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/50 hover:text-white"
                  >
                    close →
                  </button>
                </div>

                {ui.activeTab === "audio" && (
                  <div className="space-y-4">
                    <ToggleRow
                      label="Low-latency audio"
                      enabled={s.latencyOptimized}
                      onToggle={(v) => set({ latencyOptimized: v })}
                    />
                    <Row label="Smoothing">
                      <S
                        label=""
                        value={s.smoothing}
                        min={0}
                        max={0.99}
                        step={0.01}
                        onChange={(v) => set({ smoothing: v })}
                      />
                    </Row>
                    <Row label="Gain">
                      <S
                        label=""
                        value={s.gain}
                        min={0}
                        max={4}
                        step={0.05}
                        onChange={(v) => set({ gain: v })}
                      />
                    </Row>
                    <Row label="Beat sensitivity">
                      <S
                        label=""
                        value={s.beatSensitivity}
                        min={1}
                        max={3}
                        step={0.05}
                        onChange={(v) => set({ beatSensitivity: v })}
                      />
                    </Row>
                    <Row label="FFT size">
                      <div className="flex gap-1.5">
                        {[512, 1024, 2048, 4096].map((n) => (
                          <Bn
                            key={n}
                            active={s.fftSize === n}
                            onClick={() => set({ fftSize: n as Settings["fftSize"] })}
                            className="flex-1"
                          >
                            {n}
                          </Bn>
                        ))}
                      </div>
                    </Row>
                    <ToggleRow
                      label="Show BPM & bar grid"
                      enabled={s.showBPM}
                      onToggle={(v) => set({ showBPM: v })}
                    />
                    <p className="font-mono text-[9px] leading-relaxed text-white/35">
                      Shortcut: <span className="text-emerald-300/80">M</span> · tap{" "}
                      <span className="text-white/50">T</span> on beats,{" "}
                      <span className="text-white/50">⇧T</span> on downbeat.
                    </p>
                    {s.showBPM && <TempoReadout variant="panel" tempo={liveTempo} />}
                    <ToggleRow
                      label="Show latency HUD"
                      enabled={s.showLatency}
                      onToggle={(v) => set({ showLatency: v })}
                    />
                    <p className="px-1 font-mono text-[9px] leading-relaxed text-white/35">
                      Shortcut: <span className="text-emerald-300/80">L</span>
                    </p>
                    <ToggleRow
                      label="MIDI control"
                      enabled={s.midiEnabled}
                      onToggle={(v) => set({ midiEnabled: v })}
                    >
                      {midi.error && (
                        <p className="px-1 font-mono text-[9px] leading-relaxed text-amber-200/70">
                          {midi.error}
                        </p>
                      )}
                      {midi.active && (
                        <p className="px-1 font-mono text-[9px] leading-relaxed text-white/50">
                          {midi.inputs.length > 0
                            ? `Inputs: ${midi.inputs.join(", ")}`
                            : "No MIDI inputs connected — plug in a controller"}
                          {midi.lastAction ? ` · last: ${midi.lastAction}` : ""}
                        </p>
                      )}
                      <p className="px-1 font-mono text-[9px] leading-relaxed text-white/35">
                        Notes C1/D1 tap beat/downbeat, E1 random visual, F1 randomize FX, C2+ load
                        saves 1–10. Knobs: CC1 bloom, CC7 exposure, CC71 chroma, CC74 hue, CC91
                        grain, CC93 vignette.
                      </p>
                    </ToggleRow>
                  </div>
                )}

                {ui.activeTab === "scene" && (
                  <div className="space-y-4">
                    <Row label="Motion & auto-pilot">
                      <ToggleRow
                        label="Music-reactive view cycle"
                        enabled={s.viewCycleMode}
                        onToggle={(v) => set({ viewCycleMode: v })}
                      >
                        <p className="font-mono text-[9px] leading-relaxed text-white/35">
                          Randomly switches visuals every 4 bars (16 beats in 4/4). Shortcut: C. Tap{" "}
                          <span className="text-white/50">T</span> on beats to sync;{" "}
                          <span className="text-white/50">⇧T</span> on downbeat for bar 1.
                        </p>
                      </ToggleRow>
                      <ToggleRow
                        label="Randomize FX on view switch"
                        enabled={s.viewCycleRandomize}
                        onToggle={(v) => set({ viewCycleRandomize: v })}
                      >
                        <p className="font-mono text-[9px] leading-relaxed text-white/35">
                          Applies randomize when the view cycle picks a new visual.
                        </p>
                      </ToggleRow>
                      <ToggleRow
                        label="Dynamic mode"
                        enabled={s.evolveEnabled}
                        onToggle={(v) => set({ evolveEnabled: v })}
                      >
                        <S
                          label="Drift amount"
                          value={s.evolveAmount}
                          min={0}
                          max={1}
                          step={0.05}
                          onChange={(v) => set({ evolveAmount: v })}
                        />
                        <p className="font-mono text-[9px] leading-relaxed text-white/35">
                          Slowly drifts a few impactful settings for the current view over musical
                          phrases, as a bounded offset around your own values — turn off to return
                          to exactly what you set. Unlike view cycle, the view itself never changes.
                        </p>
                      </ToggleRow>
                    </Row>
                    <Row label="Palette">
                      <div className="grid grid-cols-2 gap-2">
                        {PALETTES.map((p, i) => (
                          <button
                            key={p.name}
                            onClick={() => set({ paletteIndex: i })}
                            className={`flex items-center gap-2 rounded-md border p-2 text-left text-xs transition ${
                              s.paletteIndex === i
                                ? "border-emerald-300/60 bg-emerald-400/10 shadow-[0_0_12px_rgba(52,211,153,0.35)]"
                                : "border-white/10 hover:border-white/30"
                            }`}
                          >
                            <div className="flex">
                              {p.colors.map((c) => (
                                <div key={c} className="h-4 w-4" style={{ background: c }} />
                              ))}
                            </div>
                            <span>{p.name}</span>
                          </button>
                        ))}
                      </div>
                    </Row>
                    <Row label="Background colour">
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={s.bgColor}
                          onChange={(e) => set({ bgColor: e.target.value })}
                          className="h-8 w-10 cursor-pointer rounded border border-white/15 bg-transparent"
                        />
                        <div className="flex flex-wrap gap-1">
                          {["#05060a", "#000000", "#0a0010", "#000a10", "#0a0800", "#1a0a00"].map(
                            (c) => (
                              <button
                                key={c}
                                onClick={() => set({ bgColor: c })}
                                className={`h-6 w-6 rounded border transition ${s.bgColor.toLowerCase() === c ? "border-white scale-110" : "border-white/20 hover:border-white/40"}`}
                                style={{
                                  background: c,
                                  boxShadow:
                                    s.bgColor.toLowerCase() === c ? `0 0 10px ${c}aa` : undefined,
                                }}
                                aria-label={c}
                              />
                            ),
                          )}
                        </div>
                      </div>
                    </Row>
                    <ToggleRow
                      label="Cinematic camera drift"
                      enabled={s.cameraDrift}
                      onToggle={(v) => set({ cameraDrift: v })}
                    >
                      <S
                        label="Drift amount"
                        value={s.cameraDriftAmount}
                        min={0}
                        max={2}
                        step={0.05}
                        onChange={(v) => set({ cameraDriftAmount: v })}
                      />
                    </ToggleRow>
                    <ToggleRow
                      label="Beat-reactive bounce"
                      enabled={s.cameraBeat}
                      onToggle={(v) => set({ cameraBeat: v })}
                    >
                      <S
                        label="Bounce strength"
                        value={s.cameraBeatAmount}
                        min={0}
                        max={3}
                        step={0.05}
                        onChange={(v) => set({ cameraBeatAmount: v })}
                      />
                    </ToggleRow>
                    <ToggleRow
                      label="Mouse camera (drag / scroll)"
                      enabled={s.cameraMouse}
                      onToggle={(v) => set({ cameraMouse: v })}
                    />
                    <ToggleRow
                      label="Performance mode (low latency)"
                      enabled={s.performance}
                      onToggle={(v) => set({ performance: v })}
                    />
                    <p className="px-1 font-mono text-[9px] leading-relaxed text-white/35">
                      Caps pixel ratio (0.85×), skips post-FX pipeline, disables heavy GPU passes,
                      and lowers ring/line counts for faster audio→screen updates.
                    </p>
                  </div>
                )}

                {ui.activeTab === "post" && (
                  <div className="space-y-3">
                    {s.performance && (
                      <div className="rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-2.5">
                        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-amber-200/90">
                          Performance Mode is bypassing all post FX
                        </p>
                        <div className="mt-1.5 flex items-center justify-between gap-2">
                          <p className="font-mono text-[9px] leading-relaxed text-amber-200/60">
                            Nothing below has any effect while it's on (Scene tab).
                          </p>
                          <Bn variant="outline" onClick={() => set({ performance: false })}>
                            Turn off
                          </Bn>
                        </div>
                      </div>
                    )}
                    <ToggleRow
                      label="Post FX pipeline"
                      enabled={s.postFxEnabled}
                      onToggle={(v) => set({ postFxEnabled: v })}
                    />
                    <div className="flex flex-wrap gap-1.5">
                      <Bn variant="primary" onClick={() => settingsStore.randomize()}>
                        <Shuffle className="mr-1 h-3 w-3" /> Randomize
                      </Bn>
                      <Bn variant="ghost" onClick={() => settingsStore.reset()}>
                        Reset
                      </Bn>
                    </div>
                    <div className="flex items-center justify-between rounded-md border border-white/10 bg-white/[0.02] px-3 py-2.5">
                      <div>
                        <Label className="text-[11px]">Randomize view settings</Label>
                        <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/35 mt-0.5">
                          off = post FX only
                        </div>
                      </div>
                      <Sw
                        checked={s.randomizeViewSettings}
                        onCheckedChange={(v) => set({ randomizeViewSettings: v })}
                      />
                    </div>
                    <Disclosure label={`Presets${s.activePreset ? ` · ${s.activePreset}` : ""}`}>
                      <div className="grid grid-cols-1 gap-1.5 @[420px]:grid-cols-2 @[640px]:grid-cols-3">
                        {Object.keys(PRESETS).map((name) => {
                          const palette =
                            PALETTES[PRESETS[name as keyof typeof PRESETS]?.paletteIndex ?? 0]
                              ?.colors ?? [];
                          return (
                            <Bn
                              key={name}
                              active={s.activePreset === name}
                              variant="default"
                              className="justify-start"
                              onClick={() =>
                                settingsStore.applyPreset(name as keyof typeof PRESETS)
                              }
                            >
                              <span className="mr-1.5 flex h-3 w-8 shrink-0 overflow-hidden rounded-sm border border-white/25">
                                {palette.slice(0, 4).map((color, index) => (
                                  <span
                                    key={index}
                                    className="h-full flex-1"
                                    style={{ background: color }}
                                  />
                                ))}
                              </span>
                              <span className="truncate">{name}</span>
                            </Bn>
                          );
                        })}
                      </div>
                    </Disclosure>
                    <p className="px-1 font-mono text-[9px] leading-relaxed text-white/35">
                      Effects are grouped below — headers show how many are active. Pin an effect
                      (📌 on its row) and nothing changes it — not Randomize, presets, loading
                      saves, or view cycling — until you unpin. Saved looks live in the Saves tab.
                    </p>
                    <div className="grid grid-cols-1 items-start gap-3 @[540px]:grid-cols-2">
                      <FxSection
                        id="glow"
                        label="Glow · Colour · Tone"
                        pinned={pinnedIn(["bloom", "chroma", "grain", "vignette", "grading"])}
                        count={
                          [s.bloom, s.chroma, s.grain, s.vignette, s.grading].filter(Boolean).length
                        }
                      >
                        <ToggleRow
                          lockId="bloom"
                          label="Bloom"
                          enabled={s.bloom}
                          onToggle={(v) => set({ bloom: v })}
                        >
                          <div className="flex items-center justify-between rounded-md border border-white/10 bg-white/[0.02] px-2 py-2">
                            <Label className="text-[11px] leading-snug">
                              Extreme bloom
                              <span className="mt-0.5 block font-mono text-[9px] uppercase tracking-wider text-white/35">
                                Strength above {BLOOM_STRENGTH_MAX_NORMAL.toFixed(1)} (very bright)
                              </span>
                            </Label>
                            <Sw
                              checked={s.bloomExtreme}
                              onCheckedChange={(on) => {
                                if (on) set({ bloomExtreme: true });
                                else {
                                  set({
                                    bloomExtreme: false,
                                    bloomStrength: Math.min(
                                      s.bloomStrength,
                                      BLOOM_STRENGTH_MAX_NORMAL,
                                    ),
                                  });
                                }
                              }}
                            />
                          </div>
                          <S
                            label="Strength"
                            value={s.bloomStrength}
                            min={0}
                            max={s.bloomExtreme ? 3 : BLOOM_STRENGTH_MAX_NORMAL}
                            step={0.02}
                            onChange={(v) =>
                              set({
                                bloomStrength: s.bloomExtreme
                                  ? v
                                  : Math.min(BLOOM_STRENGTH_MAX_NORMAL, v),
                              })
                            }
                          />
                          <S
                            label="Radius"
                            value={s.bloomRadius}
                            min={0}
                            max={1.5}
                            step={0.05}
                            onChange={(v) => set({ bloomRadius: v })}
                          />
                          <S
                            label="Threshold"
                            value={s.bloomThreshold}
                            min={0}
                            max={1}
                            step={0.01}
                            onChange={(v) => set({ bloomThreshold: v })}
                          />
                        </ToggleRow>
                        <ToggleRow
                          lockId="chroma"
                          label="Chromatic aberration"
                          enabled={s.chroma}
                          onToggle={(v) => set({ chroma: v })}
                        >
                          <S
                            label="Amount"
                            value={s.chromaAmount}
                            min={0}
                            max={0.02}
                            step={0.0005}
                            onChange={(v) => set({ chromaAmount: v })}
                          />
                        </ToggleRow>
                        <ToggleRow
                          lockId="grain"
                          label="Film grain"
                          enabled={s.grain}
                          onToggle={(v) => set({ grain: v })}
                        >
                          <S
                            label="Amount"
                            value={s.grainAmount}
                            min={0}
                            max={1}
                            step={0.05}
                            onChange={(v) => set({ grainAmount: v })}
                          />
                        </ToggleRow>
                        <ToggleRow
                          lockId="vignette"
                          label="Vignette"
                          enabled={s.vignette}
                          onToggle={(v) => set({ vignette: v })}
                        >
                          <S
                            label="Amount"
                            value={s.vignetteAmount}
                            min={0.5}
                            max={2}
                            step={0.05}
                            onChange={(v) => set({ vignetteAmount: v })}
                          />
                        </ToggleRow>
                        <ToggleRow
                          lockId="grading"
                          label="Color grading"
                          enabled={s.grading}
                          onToggle={(v) => set({ grading: v })}
                        >
                          <S
                            label="Exposure"
                            value={s.exposure}
                            min={0.3}
                            max={2.5}
                            step={0.05}
                            onChange={(v) => set({ exposure: v })}
                          />
                          <S
                            label="Contrast"
                            value={s.contrast}
                            min={0.5}
                            max={2}
                            step={0.05}
                            onChange={(v) => set({ contrast: v })}
                          />
                          <S
                            label="Saturation"
                            value={s.saturation}
                            min={0}
                            max={2}
                            step={0.05}
                            onChange={(v) => set({ saturation: v })}
                          />
                          <S
                            label="Hue"
                            value={s.hue}
                            min={-0.5}
                            max={0.5}
                            step={0.01}
                            onChange={(v) => set({ hue: v })}
                          />
                        </ToggleRow>
                      </FxSection>
                      <FxSection
                        id="camera"
                        label="Camera & Motion"
                        pinned={pinnedIn([
                          "dof",
                          "motionTrails",
                          "radialBlur",
                          "tiltShift",
                          "ssao",
                        ])}
                        count={
                          [s.dof, s.motionTrails, s.radialBlur, s.tiltShift, s.ssao].filter(Boolean)
                            .length
                        }
                      >
                        <ToggleRow
                          lockId="dof"
                          label="Depth of field"
                          enabled={s.dof}
                          onToggle={(v) => set({ dof: v })}
                        >
                          <S
                            label="Focus"
                            value={s.dofFocus}
                            min={1}
                            max={20}
                            step={0.1}
                            onChange={(v) => set({ dofFocus: v })}
                          />
                          <S
                            label="Aperture"
                            value={s.dofAperture}
                            min={0}
                            max={0.005}
                            step={0.0001}
                            onChange={(v) => set({ dofAperture: v })}
                          />
                          <S
                            label="Max blur"
                            value={s.dofMaxBlur}
                            min={0}
                            max={0.05}
                            step={0.001}
                            onChange={(v) => set({ dofMaxBlur: v })}
                          />
                        </ToggleRow>
                        <ToggleRow
                          lockId="motionTrails"
                          label="Motion trails"
                          enabled={s.motionTrails}
                          onToggle={(v) => set({ motionTrails: v })}
                        >
                          <S
                            label="Decay"
                            value={s.trailDecay}
                            min={0.75}
                            max={0.99}
                            step={0.005}
                            onChange={(v) => set({ trailDecay: v })}
                          />
                          <S
                            label="Inject"
                            value={s.trailInject}
                            min={0.5}
                            max={2.25}
                            step={0.05}
                            onChange={(v) => set({ trailInject: v })}
                          />
                          <S
                            label="Threshold"
                            value={s.trailThreshold}
                            min={0}
                            max={1}
                            step={0.01}
                            onChange={(v) => set({ trailThreshold: v })}
                          />
                        </ToggleRow>
                        <ToggleRow
                          lockId="radialBlur"
                          label="Radial blur"
                          enabled={s.radialBlur}
                          onToggle={(v) => set({ radialBlur: v })}
                        >
                          <S
                            label="Base"
                            value={s.radialBase}
                            min={0}
                            max={1}
                            step={0.01}
                            onChange={(v) => set({ radialBase: v })}
                          />
                          <S
                            label="Kick amount"
                            value={s.radialKickAmount}
                            min={0}
                            max={2}
                            step={0.05}
                            onChange={(v) => set({ radialKickAmount: v })}
                          />
                          <S
                            label="Zoom"
                            value={s.radialZoom}
                            min={0.05}
                            max={1.2}
                            step={0.05}
                            onChange={(v) => set({ radialZoom: v })}
                          />
                        </ToggleRow>
                        <ToggleRow
                          lockId="tiltShift"
                          label="Tilt-shift"
                          enabled={s.tiltShift}
                          onToggle={(v) => set({ tiltShift: v })}
                        >
                          <S
                            label="Amount"
                            value={s.tiltAmount}
                            min={0}
                            max={4}
                            step={0.1}
                            onChange={(v) => set({ tiltAmount: v })}
                          />
                        </ToggleRow>
                        <ToggleRow
                          lockId="ssao"
                          label="SSAO"
                          enabled={s.ssao}
                          onToggle={(v) => set({ ssao: v })}
                        >
                          <S
                            label="Radius"
                            value={s.ssaoRadius}
                            min={2}
                            max={14}
                            step={0.5}
                            onChange={(v) => set({ ssaoRadius: v })}
                          />
                          <S
                            label="Distance"
                            value={s.ssaoDistance}
                            min={0.01}
                            max={0.2}
                            step={0.005}
                            onChange={(v) => set({ ssaoDistance: v })}
                          />
                          <S
                            label="Intensity"
                            value={s.ssaoIntensity}
                            min={0}
                            max={1}
                            step={0.05}
                            onChange={(v) => set({ ssaoIntensity: v })}
                          />
                        </ToggleRow>
                      </FxSection>
                      <FxSection
                        id="light"
                        label="Light Rays & Flares"
                        pinned={pinnedIn(["godRays", "lensFlare"])}
                        count={[s.godRays, s.lensFlare].filter(Boolean).length}
                      >
                        <ToggleRow
                          lockId="godRays"
                          label="God rays"
                          enabled={s.godRays}
                          onToggle={(v) => set({ godRays: v })}
                        >
                          <S
                            label="Amount"
                            value={s.godRaysAmount}
                            min={0}
                            max={2}
                            step={0.05}
                            onChange={(v) => set({ godRaysAmount: v })}
                          />
                        </ToggleRow>
                        <ToggleRow
                          lockId="lensFlare"
                          label="Lens flare"
                          enabled={s.lensFlare}
                          onToggle={(v) => set({ lensFlare: v })}
                        >
                          <S
                            label="Amount"
                            value={s.lensFlareAmount}
                            min={0}
                            max={2}
                            step={0.05}
                            onChange={(v) => set({ lensFlareAmount: v })}
                          />
                        </ToggleRow>
                      </FxSection>
                      <FxSection
                        id="geometry"
                        label="Geometry & Stylize"
                        pinned={pinnedIn(["kaleidoscope", "mirror", "pixelate", "sobel"])}
                        count={
                          [s.kaleidoscope, s.mirrorFx, s.pixelate, s.sobelMode].filter(Boolean)
                            .length
                        }
                      >
                        <ToggleRow
                          lockId="kaleidoscope"
                          label="Kaleidoscope"
                          enabled={s.kaleidoscope}
                          onToggle={(v) => set({ kaleidoscope: v })}
                        >
                          <S
                            label="Sides"
                            value={s.kaleidoscopeSides}
                            min={2}
                            max={24}
                            step={1}
                            onChange={(v) => set({ kaleidoscopeSides: Math.round(v) })}
                          />
                          <S
                            label="Angle"
                            value={s.kaleidoscopeAngle}
                            min={-3.14}
                            max={3.14}
                            step={0.01}
                            onChange={(v) => set({ kaleidoscopeAngle: v })}
                          />
                        </ToggleRow>
                        <ToggleRow
                          lockId="mirror"
                          label="Mirror"
                          enabled={s.mirrorFx}
                          onToggle={(v) => set({ mirrorFx: v })}
                        >
                          <div className="grid grid-cols-3 gap-2">
                            {(
                              [
                                ["horizontal", "Horizontal"],
                                ["vertical", "Vertical"],
                                ["quad", "Quad"],
                              ] as const
                            ).map(([mode, label]) => (
                              <Bn
                                key={mode}
                                active={s.mirrorMode === mode}
                                variant={s.mirrorMode === mode ? "default" : "outline"}
                                onClick={() => set({ mirrorMode: mode })}
                              >
                                {label}
                              </Bn>
                            ))}
                          </div>
                          <S
                            label="Offset"
                            value={s.mirrorOffset}
                            min={-0.45}
                            max={0.45}
                            step={0.01}
                            onChange={(v) => set({ mirrorOffset: v })}
                          />
                        </ToggleRow>
                        <ToggleRow
                          lockId="pixelate"
                          label="Pixelate"
                          enabled={s.pixelate}
                          onToggle={(v) => set({ pixelate: v })}
                        >
                          <S
                            label="Pixel size"
                            value={s.pixelSize}
                            min={1}
                            max={32}
                            step={1}
                            onChange={(v) => set({ pixelSize: v })}
                          />
                        </ToggleRow>
                        <ToggleRow
                          lockId="sobel"
                          label="Blueprint sobel"
                          enabled={s.sobelMode}
                          onToggle={(v) => set({ sobelMode: v })}
                        >
                          <S
                            label="Edge strength"
                            value={s.sobelStrength}
                            min={0.25}
                            max={4}
                            step={0.05}
                            onChange={(v) => set({ sobelStrength: v })}
                          />
                          <S
                            label="Threshold"
                            value={s.sobelThreshold}
                            min={0.01}
                            max={1}
                            step={0.01}
                            onChange={(v) => set({ sobelThreshold: v })}
                          />
                          <S
                            label="Fill mix"
                            value={s.sobelFillMix}
                            min={0}
                            max={1}
                            step={0.01}
                            onChange={(v) => set({ sobelFillMix: v })}
                          />
                        </ToggleRow>
                      </FxSection>
                      <FxSection
                        id="retro"
                        label="Retro Displays"
                        pinned={pinnedIn(["retro", "ascii", "crt", "projectorFilm", "glitch"])}
                        count={
                          [s.retroFx, s.asciiFx, s.crtFx, s.projectorFilmFx, s.glitch].filter(
                            Boolean,
                          ).length
                        }
                      >
                        <ToggleRow
                          lockId="retro"
                          label="Retro system"
                          enabled={s.retroFx}
                          onToggle={(v) => set({ retroFx: v })}
                        >
                          <div className="grid grid-cols-2 gap-2">
                            {RETRO_SYSTEMS.map(({ id, label }) => (
                              <Bn
                                key={id}
                                active={s.retroSystem === id}
                                variant={s.retroSystem === id ? "default" : "outline"}
                                onClick={() => set({ retroSystem: id })}
                              >
                                {label}
                              </Bn>
                            ))}
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            {(
                              [
                                ["pixels", "Hi-res"],
                                ["text", "Text font"],
                                ["blocks", "Low-res blocks"],
                              ] as const
                            ).map(([mode, label]) => (
                              <Bn
                                key={mode}
                                active={s.retroMode === mode}
                                variant={s.retroMode === mode ? "default" : "outline"}
                                onClick={() => set({ retroMode: mode })}
                              >
                                {label}
                              </Bn>
                            ))}
                          </div>
                          <S
                            label="Dither"
                            value={s.retroDither}
                            min={0}
                            max={1}
                            step={0.01}
                            onChange={(v) => set({ retroDither: v })}
                          />
                          <Row label="Hardware border">
                            <Sw
                              checked={s.retroBorder}
                              onCheckedChange={(v) => set({ retroBorder: v })}
                            />
                          </Row>
                        </ToggleRow>
                        <ToggleRow
                          lockId="ascii"
                          label="ASCII"
                          enabled={s.asciiFx}
                          onToggle={(v) => set({ asciiFx: v })}
                        >
                          <S
                            label="Cell size"
                            value={s.asciiCellSize}
                            min={4}
                            max={32}
                            step={1}
                            onChange={(v) => set({ asciiCellSize: Math.round(v) })}
                          />
                          <div className="grid grid-cols-2 gap-2">
                            {(
                              [
                                [true, "Colour"],
                                [false, "Mono"],
                              ] as const
                            ).map(([colored, label]) => (
                              <Bn
                                key={label}
                                active={s.asciiColored === colored}
                                variant={s.asciiColored === colored ? "default" : "outline"}
                                onClick={() => set({ asciiColored: colored })}
                              >
                                {label}
                              </Bn>
                            ))}
                          </div>
                        </ToggleRow>
                        <ToggleRow
                          lockId="crt"
                          label="CRT"
                          enabled={s.crtFx}
                          onToggle={(v) => set({ crtFx: v })}
                        >
                          <S
                            label="Scanlines"
                            value={s.crtScanlineIntensity}
                            min={0}
                            max={1}
                            step={0.01}
                            onChange={(v) => set({ crtScanlineIntensity: v })}
                          />
                          <S
                            label="Curvature"
                            value={s.crtCurvature}
                            min={0}
                            max={0.1}
                            step={0.01}
                            onChange={(v) => set({ crtCurvature: v })}
                          />
                          <S
                            label="Vignette"
                            value={s.crtVignette}
                            min={0}
                            max={1}
                            step={0.01}
                            onChange={(v) => set({ crtVignette: v })}
                          />
                        </ToggleRow>
                        <ToggleRow
                          lockId="projectorFilm"
                          label="Projector film"
                          enabled={s.projectorFilmFx}
                          onToggle={(v) => set({ projectorFilmFx: v })}
                        >
                          <S
                            label="Artifact amount"
                            value={s.projectorFilmAmount}
                            min={0}
                            max={1.5}
                            step={0.01}
                            onChange={(v) => set({ projectorFilmAmount: v })}
                          />
                          <S
                            label="Frame jitter"
                            value={s.projectorFilmJitter}
                            min={0}
                            max={1}
                            step={0.01}
                            onChange={(v) => set({ projectorFilmJitter: v })}
                          />
                          <S
                            label="Lamp flicker"
                            value={s.projectorFilmFlicker}
                            min={0}
                            max={1}
                            step={0.01}
                            onChange={(v) => set({ projectorFilmFlicker: v })}
                          />
                        </ToggleRow>
                        <ToggleRow
                          lockId="glitch"
                          label="Glitch"
                          enabled={s.glitch}
                          onToggle={(v) => set({ glitch: v })}
                        >
                          <S
                            label="Intensity"
                            value={s.glitchIntensity}
                            min={0}
                            max={1}
                            step={0.05}
                            onChange={(v) => set({ glitchIntensity: v })}
                          />
                          <div className="flex items-center justify-between">
                            <Label className="text-xs">Wild mode</Label>
                            <Sw
                              checked={s.glitchWild}
                              onCheckedChange={(v) => set({ glitchWild: v })}
                            />
                          </div>
                        </ToggleRow>
                      </FxSection>
                      <FxSection
                        id="overlays"
                        label="Overlays"
                        pinned={pinnedIn(["assetOverlay", "textOverlay"])}
                        count={[s.assetOverlayFx, s.textOverlayEnabled].filter(Boolean).length}
                      >
                        <ToggleRow
                          lockId="assetOverlay"
                          label="Asset overlay"
                          enabled={s.assetOverlayFx}
                          onToggle={(v) => set({ assetOverlayFx: v })}
                        >
                          <S
                            label="Amount"
                            value={s.assetOverlayAmount}
                            min={0}
                            max={2}
                            step={0.05}
                            onChange={(v) => set({ assetOverlayAmount: v })}
                          />
                          <S
                            label="Scroll speed"
                            value={s.assetOverlaySpeed}
                            min={0.1}
                            max={3}
                            step={0.05}
                            onChange={(v) => set({ assetOverlaySpeed: v })}
                          />
                          <div className="flex items-center justify-between">
                            <Label className="text-[11px] leading-snug">
                              2D drawing pack
                              <span className="mt-0.5 block font-mono text-[9px] uppercase tracking-wider text-white/35">
                                bold drawn assets — off = subtle line-art only
                              </span>
                            </Label>
                            <Sw
                              checked={s.assetOverlayLocalPack}
                              onCheckedChange={(v) => set({ assetOverlayLocalPack: v })}
                            />
                          </div>
                          <Label className="text-[11px] text-white/60">Local pack bias</Label>
                          <div className="grid grid-cols-2 gap-2">
                            {(
                              [
                                ["mixed", "Mixed"],
                                ["technical", "Technical"],
                                ["organic", "Organic"],
                                ["chaotic", "Chaotic"],
                              ] as const
                            ).map(([bias, label]) => (
                              <Bn
                                key={bias}
                                active={s.assetOverlayBias === bias}
                                variant={s.assetOverlayBias === bias ? "default" : "outline"}
                                onClick={() => set({ assetOverlayBias: bias })}
                              >
                                {label}
                              </Bn>
                            ))}
                          </div>
                          <div className="flex items-center justify-between">
                            <Label className="text-[11px]">Add Wikimedia Commons</Label>
                            <Sw
                              checked={s.assetOverlayCommonsEnabled}
                              onCheckedChange={(v) => set({ assetOverlayCommonsEnabled: v })}
                            />
                          </div>
                          {s.assetOverlayCommonsEnabled && (
                            <Label className="text-[11px] text-white/60">
                              Commons search topic
                            </Label>
                          )}
                          {s.assetOverlayCommonsEnabled && (
                            <div className="grid grid-cols-3 gap-2">
                              {(
                                [
                                  ["abstract", "Patterns"],
                                  ["technical", "Diagrams"],
                                  ["organic", "Botanical"],
                                ] as const
                              ).map(([topic, label]) => (
                                <Bn
                                  key={topic}
                                  active={s.assetOverlayCommonsTopic === topic}
                                  variant={
                                    s.assetOverlayCommonsTopic === topic ? "default" : "outline"
                                  }
                                  onClick={() => set({ assetOverlayCommonsTopic: topic })}
                                >
                                  {label}
                                </Bn>
                              ))}
                            </div>
                          )}
                          <div className="rounded-md border border-white/10 bg-white/[0.02] px-3 py-2">
                            <p className="text-[10px] leading-relaxed text-white/60">
                              Pulls from a larger local SVG overlay pack and shuffles across
                              distinct families: grids, scanlines, circuit, halftone, chevrons,
                              rings, starburst, and more. Bias steers the picker toward cleaner
                              technical, softer organic, or rougher chaotic combinations.
                            </p>
                            <p className="mt-1 text-[10px] leading-relaxed text-white/45">
                              Wikimedia Commons is optional and only loads when enabled — the topic
                              picks what it searches for (pattern art, circuit diagrams, or
                              botanical plates). Current asset attribution is shown in Stats for
                              nerds.
                            </p>
                          </div>
                        </ToggleRow>
                        <ToggleRow
                          lockId="textOverlay"
                          label="Demo-scene text overlay"
                          enabled={s.textOverlayEnabled}
                          onToggle={(v) => set({ textOverlayEnabled: v })}
                        >
                          <div className="grid grid-cols-2 gap-2">
                            {(
                              [
                                ["public-domain", "Public Domain"],
                                ["bofh", "BOFH API"],
                              ] as const
                            ).map(([source, label]) => (
                              <Bn
                                key={source}
                                active={s.textOverlaySource === source}
                                variant={s.textOverlaySource === source ? "default" : "outline"}
                                onClick={() => set({ textOverlaySource: source })}
                              >
                                {label}
                              </Bn>
                            ))}
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            {(
                              [
                                ["bounce", "Bounce"],
                                ["scroller", "Scroller"],
                                ["stack", "Stack"],
                                ["orbit", "Orbit"],
                              ] as const
                            ).map(([style, label]) => (
                              <Bn
                                key={style}
                                active={s.textOverlayStyle === style}
                                variant={s.textOverlayStyle === style ? "default" : "outline"}
                                onClick={() => set({ textOverlayStyle: style })}
                              >
                                {label}
                              </Bn>
                            ))}
                          </div>
                          <S
                            label="Intensity"
                            value={s.textOverlayIntensity}
                            min={0}
                            max={2}
                            step={0.05}
                            onChange={(v) => set({ textOverlayIntensity: v })}
                          />
                          <S
                            label="Phrase interval (sec)"
                            value={s.textOverlayPhraseInterval}
                            min={3}
                            max={20}
                            step={0.5}
                            onChange={(v) => set({ textOverlayPhraseInterval: v })}
                          />
                          <div className="flex items-center justify-between">
                            <Label className="text-[11px]">All caps</Label>
                            <Sw
                              checked={s.textOverlayAllCaps}
                              onCheckedChange={(v) => set({ textOverlayAllCaps: v })}
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <Label className="text-[11px]">Scramble in/out</Label>
                            <Sw
                              checked={s.textOverlayScramble}
                              onCheckedChange={(v) => set({ textOverlayScramble: v })}
                            />
                          </div>
                          <div className="rounded-md border border-white/10 bg-white/[0.02] px-3 py-2">
                            <Label className="text-[11px]">Phrase source</Label>
                            <p className="mt-1 text-[10px] leading-relaxed text-white/60">
                              {s.textOverlaySource === "public-domain"
                                ? "Curated public-domain snippets are bundled locally with author, work, rights, and provenance metadata."
                                : "BOFH phrases come from bofh.bombeck.io in small batches and may require network; the fallback list stays available offline."}
                            </p>
                            <p className="mt-1 text-[10px] leading-relaxed text-white/45">
                              Current snippet attribution appears in Stats for nerds.
                            </p>
                          </div>
                        </ToggleRow>
                      </FxSection>
                    </div>
                    <Disclosure label="Pipeline order">
                      <p className="px-1 font-mono text-[9px] leading-relaxed text-white/35">
                        Passes run top to bottom; the scene render, SSAO, and motion trails always
                        run first. Order changes the look — try CRT after Retro system for scanlines
                        over the emulated screen, or Bloom after Pixelate for a glow per fat pixel.
                      </p>
                      <div className="space-y-1">
                        {s.fxPipelineOrder.map((id, index) => {
                          const label = FX_PIPELINE.find((pass) => pass.id === id)?.label ?? id;
                          const enabled = FX_PASS_ENABLED_FLAGS[id]
                            ? Boolean(s[FX_PASS_ENABLED_FLAGS[id] as keyof Settings])
                            : true;
                          const move = (delta: -1 | 1) => {
                            const next = [...s.fxPipelineOrder];
                            const target = index + delta;
                            if (target < 0 || target >= next.length) return;
                            [next[index], next[target]] = [next[target]!, next[index]!];
                            set({ fxPipelineOrder: next });
                          };
                          return (
                            <div
                              key={id}
                              className="flex items-center justify-between gap-2 rounded-md border border-white/10 bg-white/[0.02] px-2 py-1"
                            >
                              <span className="flex items-center gap-2 text-[11px]">
                                <span
                                  className={`h-1.5 w-1.5 rounded-full ${
                                    enabled
                                      ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]"
                                      : "bg-white/20"
                                  }`}
                                />
                                {label}
                              </span>
                              <span className="flex items-center gap-1">
                                <Bn
                                  variant="ghost"
                                  aria-label={`Move ${label} earlier`}
                                  disabled={index === 0}
                                  onClick={() => move(-1)}
                                >
                                  ↑
                                </Bn>
                                <Bn
                                  variant="ghost"
                                  aria-label={`Move ${label} later`}
                                  disabled={index === s.fxPipelineOrder.length - 1}
                                  onClick={() => move(1)}
                                >
                                  ↓
                                </Bn>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      <Bn
                        variant="outline"
                        onClick={() => set({ fxPipelineOrder: [...DEFAULT_FX_PIPELINE_ORDER] })}
                      >
                        Reset order
                      </Bn>
                    </Disclosure>
                  </div>
                )}

                {ui.activeTab === "saves" && (
                  <div className="space-y-3">
                    <p className="px-1 font-mono text-[9px] leading-relaxed text-white/35">
                      Captures every setting — view, post FX, and audio — as one saved look. Loaded
                      and saved from here, the shortcut bar, or number keys 1–5 all share the same
                      list.
                    </p>
                    <Row label="Save current setup">
                      <div className="flex flex-wrap gap-1.5">
                        <Bn variant="primary" onClick={() => preset.saveNew()}>
                          <Plus className="mr-1 h-3.5 w-3.5" /> New save
                        </Bn>
                        <Bn
                          variant="default"
                          onClick={() => preset.saveFocused()}
                          disabled={!preset.hasPresets}
                        >
                          <Save className="mr-1 h-3.5 w-3.5" /> Overwrite focused
                        </Bn>
                      </div>
                    </Row>
                    <Row label={`Saved locally (${preset.slots.length})`}>
                      {preset.hasPresets ? (
                        <div className="space-y-1.5">
                          {preset.slots.map((slot, index) => {
                            const isFocused = index === preset.activeIndex;
                            const meta = describeSlot(slot);
                            return (
                              <div
                                key={`${slot.name}-${index}`}
                                className={`flex items-center gap-2 rounded-md border px-2 py-1.5 transition-colors ${
                                  isFocused
                                    ? "border-emerald-300/40 bg-emerald-300/[0.07]"
                                    : "border-white/10 bg-white/[0.02]"
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={() => preset.focus(index)}
                                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                  aria-label={`Focus ${slot.name}`}
                                  aria-pressed={isFocused}
                                >
                                  <span className="shrink-0 font-mono text-[9px] text-white/35">
                                    {index + 1}
                                  </span>
                                  {slot.thumb ? (
                                    <img
                                      src={slot.thumb}
                                      alt=""
                                      className="h-9 w-16 shrink-0 rounded-sm border border-white/15 object-cover"
                                    />
                                  ) : (
                                    <span
                                      aria-hidden
                                      className="flex h-9 w-16 shrink-0 items-center justify-center rounded-sm border border-white/10 bg-gradient-to-br from-white/10 to-white/[0.02] font-mono text-[8px] uppercase tracking-wider text-white/25"
                                    >
                                      no img
                                    </span>
                                  )}
                                  <span className="min-w-0 flex-1">
                                    <span className="flex items-center gap-2">
                                      <span className="truncate text-[12px] text-white/85">
                                        {slot.name}
                                      </span>
                                      {isFocused && (
                                        <span className="shrink-0 rounded border border-emerald-300/30 bg-emerald-300/10 px-1 py-0.5 font-mono text-[8px] uppercase tracking-wider text-emerald-200/90">
                                          Focused
                                        </span>
                                      )}
                                    </span>
                                    <span className="mt-0.5 block truncate font-mono text-[9px] uppercase tracking-wider text-white/40">
                                      {meta}
                                    </span>
                                  </span>
                                </button>
                                <div className="flex shrink-0 items-center gap-1">
                                  <Bn
                                    variant="ghost"
                                    className="h-7 px-1.5"
                                    onClick={() => preset.loadAt(index)}
                                    title={`Load ${slot.name}`}
                                    aria-label={`Load ${slot.name}`}
                                  >
                                    <Play className="h-3.5 w-3.5" />
                                  </Bn>
                                  <Bn
                                    variant="ghost"
                                    className="h-7 px-1.5"
                                    onClick={() => preset.saveAt(index, slot.name)}
                                    title={`Overwrite ${slot.name}`}
                                    aria-label={`Overwrite ${slot.name}`}
                                  >
                                    <Save className="h-3.5 w-3.5" />
                                  </Bn>
                                  <Bn
                                    variant="ghost"
                                    className="h-7 px-1.5"
                                    onClick={() => preset.deleteAt(index)}
                                    title={`Delete ${slot.name}`}
                                    aria-label={`Delete ${slot.name}`}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Bn>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="font-mono text-[9px] leading-relaxed text-white/35">
                          No saves yet — capture your current setup above, or press{" "}
                          <span className="text-white/50">⇧1</span>–
                          <span className="text-white/50">⇧5</span> to save to a numbered slot.
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Bn
                          variant="default"
                          className="h-8 px-2"
                          onClick={() => preset.step(-1)}
                          disabled={!preset.hasPresets}
                        >
                          <SkipBack className="mr-1 h-3.5 w-3.5" /> Focus prev
                        </Bn>
                        <Bn
                          variant="default"
                          className="h-8 px-2"
                          onClick={() => preset.step(1)}
                          disabled={!preset.hasPresets}
                        >
                          <SkipForward className="mr-1 h-3.5 w-3.5" /> Focus next
                        </Bn>
                        <Bn
                          variant="default"
                          className="h-8 px-2"
                          onClick={() => preset.random()}
                          disabled={!preset.hasPresets}
                        >
                          <Shuffle className="mr-1 h-3.5 w-3.5" /> Focus random
                        </Bn>
                      </div>
                    </Row>
                    <ToggleRow
                      label="Cycle saves (auto-load each preset)"
                      enabled={s.slotCycleMode}
                      onToggle={(v) => set({ slotCycleMode: v })}
                    >
                      <S
                        label="Seconds per slot"
                        value={s.slotCycleSeconds}
                        min={10}
                        max={120}
                        step={1}
                        onChange={(v) => set({ slotCycleSeconds: v })}
                      />
                      <p className="font-mono text-[9px] leading-relaxed text-white/35">
                        Turning on loads the first saved preset immediately, then advances in list
                        order.
                      </p>
                    </ToggleRow>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </Sheet>
    </>
  );
}
