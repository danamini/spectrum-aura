import * as React from "react";
import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
  setWebXrBackgroundHidden,
  type WebXrState,
} from "./engine/xr";
import { BarTimingHud, ExperimentalBadge } from "./BarTimingHud";
import { EMPTY_LIVE_TEMPO, LIVE_TEMPO_EVENT, type LiveTempoState } from "./engine/live-tempo";
import {
  BLOOM_STRENGTH_MAX_NORMAL,
  PALETTES,
  PRESETS,
  settingsStore,
  useSettings,
  useSlots,
  type Settings,
} from "./store";
import { getVisualDefinition, VISUALS } from "./visuals";

const TOGGLE_SETTINGS_PANEL_EVENT = "spectrum-aura:toggle-settings-panel";

// Cooler, clearer toggle switch with explicit ON/OFF affordance
function Sw({
  checked,
  onCheckedChange,
  disabled = false,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Switch
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      className={
        "h-5 w-10 border border-white/15 " +
        "data-[state=checked]:bg-emerald-400 data-[state=checked]:border-emerald-300/60 data-[state=checked]:shadow-[0_0_10px_rgba(52,211,153,0.55)] " +
        "data-[state=unchecked]:bg-white/5"
      }
    />
  );
}

// Mono-styled button shared across the panel
type BnVariant = "default" | "outline" | "ghost" | "primary";
function Bn({
  active,
  variant = "outline",
  className = "",
  children,
  onClick,
  ...rest
}: {
  active?: boolean;
  variant?: BnVariant;
  className?: string;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const [ripples, setRipples] = React.useState<
    { id: number; x: number; y: number; size: number }[]
  >([]);
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2;
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;
    const id = Date.now() + Math.random();
    setRipples((r) => [...r, { id, x, y, size }]);
    setTimeout(() => setRipples((r) => r.filter((p) => p.id !== id)), 600);
    onClick?.(e);
  };
  const base =
    "relative overflow-hidden inline-flex items-center justify-center gap-1 rounded-md px-2.5 h-7 font-mono text-[10px] uppercase tracking-[0.18em] " +
    "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:opacity-40 disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0";
  let look = "";
  if (active) {
    look =
      "bg-emerald-400 text-black border border-emerald-300/60 shadow-[0_0_10px_rgba(52,211,153,0.45)] hover:bg-emerald-300";
  } else if (variant === "primary") {
    look = "bg-white text-black border border-white hover:bg-white/90";
  } else if (variant === "ghost") {
    look = "text-white/60 hover:text-white hover:bg-white/5 border border-transparent";
  } else if (variant === "default") {
    look = "bg-white/10 text-white/90 border border-white/15 hover:bg-white/15";
  } else {
    look = "bg-transparent text-white/70 border border-white/15 hover:bg-white/5 hover:text-white";
  }
  return (
    <button {...rest} onClick={handleClick} className={`${base} ${look} ${className}`}>
      {children}
      {ripples.map((r) => (
        <span
          key={r.id}
          className="pointer-events-none absolute rounded-full bg-white/40 animate-ripple"
          style={{ left: r.x, top: r.y, width: r.size, height: r.size }}
        />
      ))}
    </button>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">
        {label}
      </Label>
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  enabled,
  onToggle,
  children,
}: {
  label: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-md border p-3 space-y-3 transition-colors ${enabled ? "border-emerald-400/30 bg-emerald-400/[0.04]" : "border-white/5 bg-white/[0.02]"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <Label className="flex items-center gap-2 text-[11px] font-medium tracking-wide">
          <span
            className={`h-1.5 w-1.5 rounded-full ${enabled ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" : "bg-white/20"}`}
          />
          {label}
          <span
            className={`ml-1 font-mono text-[9px] uppercase tracking-wider ${enabled ? "text-emerald-300/80" : "text-white/30"}`}
          >
            {enabled ? "ON" : "OFF"}
          </span>
        </Label>
        <Sw checked={enabled} onCheckedChange={onToggle} />
      </div>
      {enabled && children}
    </div>
  );
}

function S({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between font-mono text-[10px] uppercase tracking-wider text-white/40">
        <span>{label}</span>
        <span className="tabular-nums text-white/70">
          {value.toFixed(step < 0.01 ? 4 : step < 0.1 ? 2 : 1)}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0])}
      />
    </div>
  );
}

const UI_KEY = "analyser-ui-v1";
type UIState = { viewSettingsOpen: boolean; activeTab: string; slotsOpen: boolean };
const loadUI = (): UIState => {
  const fallback: UIState = { viewSettingsOpen: true, activeTab: "post", slotsOpen: false };
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
  const slots = useSlots();
  const [open, setOpen] = useState(false);
  const [flyoutVisible, setFlyoutVisible] = useState(false);
  const [selectedSaveIndex, setSelectedSaveIndex] = useState(0);
  const [xrState, setXrState] = useState<WebXrState>({
    available: false,
    active: false,
    pending: false,
    error: null,
    backgroundHidden: false,
  });
  const [ui, setUi] = useState<UIState>(loadUI);
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
    updateUi({ activeTab: "" });
  };
  React.useEffect(() => {
    if (!ui.activeTab) {
      blurFlyoutFocus();
    }
  }, [ui.activeTab]);
  React.useEffect(() => {
    if (!open) {
      setFlyoutVisible(false);
      return;
    }
    const id = window.setTimeout(() => setFlyoutVisible(true), 220);
    return () => window.clearTimeout(id);
  }, [open]);
  const set = (patch: Partial<Settings>) => settingsStore.set(patch);
  const hasSavedPresets = slots.length > 0;
  const activeSaveIndex = hasSavedPresets ? Math.min(selectedSaveIndex, slots.length - 1) : 0;

  React.useEffect(() => {
    setSelectedSaveIndex((prev) => {
      if (slots.length === 0) return 0;
      return Math.min(prev, slots.length - 1);
    });
  }, [slots.length]);

  const loadSavedPreset = (index: number) => {
    if (index < 0 || index >= slots.length) return;
    settingsStore.loadSlot(index);
    setSelectedSaveIndex(index);
  };

  const loadFocusedPreset = () => {
    if (!hasSavedPresets) return;
    loadSavedPreset(activeSaveIndex);
  };

  const focusSavedPreset = (index: number) => {
    if (index < 0 || index >= slots.length) return;
    setSelectedSaveIndex(index);
  };

  const stepSavedPreset = (direction: 1 | -1) => {
    if (!hasSavedPresets) return;
    const next = (activeSaveIndex + direction + slots.length) % slots.length;
    focusSavedPreset(next);
  };

  const loadRandomSavedPreset = () => {
    if (!hasSavedPresets) return;
    const next =
      slots.length === 1
        ? 0
        : (() => {
            let index = activeSaveIndex;
            while (index === activeSaveIndex) {
              index = Math.floor(Math.random() * slots.length);
            }
            return index;
          })();
    focusSavedPreset(next);
  };

  const saveCurrentPreset = () => {
    const nextIndex = slots.length;
    settingsStore.saveSlot(nextIndex, `Save ${nextIndex + 1}`);
    setSelectedSaveIndex(nextIndex);
  };

  const saveFocusedPreset = () => {
    if (!hasSavedPresets) {
      saveCurrentPreset();
      return;
    }
    const focusedSave = slots[activeSaveIndex];
    settingsStore.saveSlot(activeSaveIndex, focusedSave?.name ?? `Save ${activeSaveIndex + 1}`);
  };

  const deleteSavedPreset = () => {
    if (!hasSavedPresets) return;
    settingsStore.clearSlot(activeSaveIndex);
  };

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
    const onToggleSettingsPanel = () => {
      setOpen((v) => !v);
    };
    window.addEventListener(TOGGLE_SETTINGS_PANEL_EVENT, onToggleSettingsPanel);
    return () => window.removeEventListener(TOGGLE_SETTINGS_PANEL_EVENT, onToggleSettingsPanel);
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
      <Sheet open={open} onOpenChange={setOpen} modal={false}>
        <SheetContent
          onInteractOutside={(e) => {
            const t = e.target as HTMLElement | null;
            if (
              t &&
              (t.closest("[data-analyser-flyout]") || t.closest("[data-settings-shortcut='true']"))
            )
              e.preventDefault();
          }}
          className="analyser-scroll w-[380px] overflow-y-auto bg-black/85 backdrop-blur-xl border-white/10 text-white text-[12px] sm:max-w-[380px]"
        >
          <SheetHeader>
            <SheetTitle className="font-mono text-[11px] uppercase tracking-[0.3em] text-white/70">
              Controls
            </SheetTitle>
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
              <ToggleRow
                label="Music-reactive view cycle"
                enabled={s.viewCycleMode}
                onToggle={(v) => set({ viewCycleMode: v })}
              >
                <p className="font-mono text-[9px] leading-relaxed text-white/35">
                  Randomly switches visuals every 4 bars (16 beats in 4/4). Shortcut: C.
                  Tap <span className="text-white/50">T</span> on beats to sync;{" "}
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
            </Row>

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
                {viewSettingsOpen && (
                  <div className="space-y-3 border-t border-white/10 p-3">
                    {s.view === "combo" && (
                      <>
                        <S
                          label="Auto-orbit speed (when mouse camera off)"
                          value={s.orbitSpeed}
                          min={0}
                          max={1}
                          step={0.02}
                          onChange={(v) => set({ orbitSpeed: v })}
                        />
                        <S
                          label="Sphere size"
                          value={s.comboSphereSize}
                          min={0.2}
                          max={3}
                          step={0.05}
                          onChange={(v) => set({ comboSphereSize: v })}
                        />
                        <S
                          label="Sphere bass punch"
                          value={s.comboSphereBassPunch}
                          min={0}
                          max={1.5}
                          step={0.05}
                          onChange={(v) => set({ comboSphereBassPunch: v })}
                        />
                        <S
                          label="Sphere spin speed"
                          value={s.comboSphereSpinSpeed}
                          min={-1.5}
                          max={1.5}
                          step={0.05}
                          onChange={(v) => set({ comboSphereSpinSpeed: v })}
                        />
                        <S
                          label="Sphere displacement"
                          value={s.sphereDisplacement}
                          min={0}
                          max={2}
                          step={0.05}
                          onChange={(v) => set({ sphereDisplacement: v })}
                        />
                        <S
                          label="Bar ring radius"
                          value={s.comboBarRadius}
                          min={2}
                          max={10}
                          step={0.1}
                          onChange={(v) => set({ comboBarRadius: v })}
                        />
                        <S
                          label="Bar height"
                          value={s.comboBarHeightScale}
                          min={0.1}
                          max={3}
                          step={0.05}
                          onChange={(v) => set({ comboBarHeightScale: v })}
                        />
                        <S
                          label="Bar count"
                          value={s.barCount}
                          min={32}
                          max={256}
                          step={8}
                          onChange={(v) => set({ barCount: Math.round(v) })}
                        />
                        <S
                          label="Particle size"
                          value={s.comboParticleSize}
                          min={0.2}
                          max={4}
                          step={0.05}
                          onChange={(v) => set({ comboParticleSize: v })}
                        />
                        <S
                          label="Particle count"
                          value={s.particleCount}
                          min={500}
                          max={15000}
                          step={500}
                          onChange={(v) => set({ particleCount: Math.round(v) })}
                        />
                        <div className="flex items-center justify-between pt-1">
                          <Label className="text-[11px]">Level meter colours (R/Y/G)</Label>
                          <Sw
                            checked={s.comboLevelMeter}
                            onCheckedChange={(v) => set({ comboLevelMeter: v })}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <Label className="text-[11px]">Wireframe</Label>
                          <Sw
                            checked={s.comboWireframe}
                            onCheckedChange={(v) => set({ comboWireframe: v })}
                          />
                        </div>
                      </>
                    )}
                    {s.view === "classic" && (
                      <>
                        <ToggleRow
                          label="Spin classic view"
                          enabled={s.classicSpin}
                          onToggle={(v) => set({ classicSpin: v })}
                        >
                          <S
                            label="Spin speed"
                            value={s.classicSpinSpeed}
                            min={-2}
                            max={2}
                            step={0.05}
                            onChange={(v) => set({ classicSpinSpeed: v })}
                          />
                        </ToggleRow>
                        <div className="flex items-center justify-between">
                          <Label className="text-[11px]">Color bands (R/Y/G)</Label>
                          <Sw
                            checked={s.classicColorBands}
                            onCheckedChange={(v) => set({ classicColorBands: v })}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <Label className="text-[11px]">Blocky LED cells</Label>
                          <Sw
                            checked={s.classicBlocky}
                            onCheckedChange={(v) => set({ classicBlocky: v })}
                          />
                        </div>
                        {s.classicBlocky && (
                          <S
                            label="Segments per bar"
                            value={s.classicSegments}
                            min={4}
                            max={40}
                            step={1}
                            onChange={(v) => set({ classicSegments: Math.round(v) })}
                          />
                        )}
                        <div className="flex items-center justify-between">
                          <Label className="text-[11px]">Background grid</Label>
                          <Sw
                            checked={s.classicGrid}
                            onCheckedChange={(v) => set({ classicGrid: v })}
                          />
                        </div>
                        {s.classicGrid && (
                          <S
                            label="Grid opacity"
                            value={s.classicGridOpacity}
                            min={0}
                            max={1}
                            step={0.02}
                            onChange={(v) => set({ classicGridOpacity: v })}
                          />
                        )}
                        <div className="flex items-center justify-between">
                          <Label className="text-[11px]">Frequency labels in 2D fit</Label>
                          <Sw
                            checked={s.classicShowFreqLabels}
                            onCheckedChange={(v) => set({ classicShowFreqLabels: v })}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <Label className="text-[11px]">Wireframe</Label>
                          <Sw
                            checked={s.classicWireframe}
                            onCheckedChange={(v) => set({ classicWireframe: v })}
                          />
                        </div>
                        <S
                          label="Peak hold (sec)"
                          value={s.classicPeakHold}
                          min={0}
                          max={5}
                          step={0.1}
                          onChange={(v) => set({ classicPeakHold: v })}
                        />
                        <S
                          label="Peak decay (units/sec)"
                          value={s.classicPeakDecay}
                          min={0.05}
                          max={3}
                          step={0.05}
                          onChange={(v) => set({ classicPeakDecay: v })}
                        />

                        <Row label="Peak style">
                          <div className="grid grid-cols-4 gap-1.5">
                            {(["bar", "thin", "glow", "none"] as const).map((style) => (
                              <Bn
                                key={style}
                                active={s.classicPeakStyle === style}
                                onClick={() => set({ classicPeakStyle: style })}
                              >
                                {style}
                              </Bn>
                            ))}
                          </div>
                        </Row>
                        <Row label="Peak color">
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={s.classicPeakColor}
                              onChange={(e) => set({ classicPeakColor: e.target.value })}
                              className="h-8 w-10 cursor-pointer rounded border border-white/15 bg-transparent"
                            />
                            <div className="flex flex-wrap gap-1">
                              {[
                                "#ffffff",
                                "#ff2d95",
                                "#00e5ff",
                                "#a6ff00",
                                "#ffb347",
                                "#7a5cff",
                              ].map((c) => (
                                <button
                                  key={c}
                                  onClick={() => set({ classicPeakColor: c })}
                                  className={`h-6 w-6 rounded border transition ${s.classicPeakColor.toLowerCase() === c ? "border-white scale-110" : "border-white/20 hover:border-white/40"}`}
                                  style={{
                                    background: c,
                                    boxShadow:
                                      s.classicPeakColor.toLowerCase() === c
                                        ? `0 0 10px ${c}aa`
                                        : undefined,
                                  }}
                                  aria-label={c}
                                />
                              ))}
                            </div>
                          </div>
                        </Row>
                      </>
                    )}
                    {s.view === "ripple" && (
                      <>
                        <S
                          label="Auto-orbit speed (when mouse camera off)"
                          value={s.orbitSpeed}
                          min={0}
                          max={1}
                          step={0.02}
                          onChange={(v) => set({ orbitSpeed: v })}
                        />
                        <S
                          label="Ring count"
                          value={s.rippleRingCount}
                          min={4}
                          max={120}
                          step={1}
                          onChange={(v) => set({ rippleRingCount: Math.round(v) })}
                        />
                        <S
                          label="Side-by-side ripples (freq. bands)"
                          value={s.rippleColumns}
                          min={1}
                          max={50}
                          step={1}
                          onChange={(v) => set({ rippleColumns: Math.round(v) })}
                        />
                        <S
                          label="Max radius"
                          value={s.rippleMaxRadius}
                          min={2}
                          max={14}
                          step={0.1}
                          onChange={(v) => set({ rippleMaxRadius: v })}
                        />
                        <S
                          label="Wave speed"
                          value={s.rippleSpeed}
                          min={0}
                          max={4}
                          step={0.05}
                          onChange={(v) => set({ rippleSpeed: v })}
                        />
                        <S
                          label="Amplitude"
                          value={s.rippleAmplitude}
                          min={0.05}
                          max={3}
                          step={0.05}
                          onChange={(v) => set({ rippleAmplitude: v })}
                        />
                        <S
                          label="Wave cycles"
                          value={s.rippleWaveCycles}
                          min={0.2}
                          max={6}
                          step={0.1}
                          onChange={(v) => set({ rippleWaveCycles: v })}
                        />
                        <S
                          label="Ring thickness"
                          value={s.rippleThickness}
                          min={0.2}
                          max={3}
                          step={0.05}
                          onChange={(v) => set({ rippleThickness: v })}
                        />
                        <S
                          label="Rotation speed"
                          value={s.rippleRotationSpeed}
                          min={-1}
                          max={1}
                          step={0.02}
                          onChange={(v) => set({ rippleRotationSpeed: v })}
                        />
                        <S
                          label="Opacity"
                          value={s.rippleOpacity}
                          min={0.1}
                          max={1}
                          step={0.02}
                          onChange={(v) => set({ rippleOpacity: v })}
                        />
                        <div className="flex items-center justify-between">
                          <Label className="text-[11px]">Wireframe</Label>
                          <Sw
                            checked={s.rippleWireframe}
                            onCheckedChange={(v) => set({ rippleWireframe: v })}
                          />
                        </div>
                      </>
                    )}
                    {s.view === "datastream" && (
                      <>
                        <S
                          label="Amplitude"
                          value={s.datastreamAmplitude}
                          min={0.05}
                          max={3}
                          step={0.05}
                          onChange={(v) => set({ datastreamAmplitude: v })}
                        />
                        <S
                          label="Particle count"
                          value={s.datastreamItemCount}
                          min={500}
                          max={30000}
                          step={500}
                          onChange={(v) => set({ datastreamItemCount: Math.round(v) })}
                        />
                        <div className="flex items-center justify-between">
                          <Label className="text-[11px]">Use selected palette</Label>
                          <Sw
                            checked={s.datastreamUsePalette}
                            onCheckedChange={(v) => set({ datastreamUsePalette: v })}
                          />
                        </div>
                      </>
                    )}
                    {s.view === "nebula" && (
                      <>
                        <S
                          label="Amplitude"
                          value={s.nebulaAmplitude}
                          min={0.05}
                          max={3}
                          step={0.05}
                          onChange={(v) => set({ nebulaAmplitude: v })}
                        />
                        <S
                          label="Detail"
                          value={s.nebulaDetail}
                          min={24}
                          max={220}
                          step={4}
                          onChange={(v) => set({ nebulaDetail: Math.round(v) })}
                        />
                        <div className="flex items-center justify-between">
                          <Label className="text-[11px]">Use selected palette</Label>
                          <Sw
                            checked={s.nebulaUsePalette}
                            onCheckedChange={(v) => set({ nebulaUsePalette: v })}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <Label className="text-[11px]">Wireframe</Label>
                          <Sw
                            checked={s.nebulaWireframe}
                            onCheckedChange={(v) => set({ nebulaWireframe: v })}
                          />
                        </div>
                      </>
                    )}
                    {s.view === "monolith" && (
                      <>
                        <S
                          label="Amplitude"
                          value={s.monolithAmplitude}
                          min={0.05}
                          max={3}
                          step={0.05}
                          onChange={(v) => set({ monolithAmplitude: v })}
                        />
                        <S
                          label="Brightness"
                          value={s.monolithBrightness}
                          min={0.2}
                          max={3}
                          step={0.05}
                          onChange={(v) => set({ monolithBrightness: v })}
                        />
                        <S
                          label="Grid size (NxN squares)"
                          value={s.monolithGridSize}
                          min={2}
                          max={40}
                          step={1}
                          onChange={(v) => set({ monolithGridSize: Math.round(v) })}
                        />
                        <div className="flex items-center justify-between">
                          <Label className="text-[11px]">Use selected palette</Label>
                          <Sw
                            checked={s.monolithUsePalette}
                            onCheckedChange={(v) => set({ monolithUsePalette: v })}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <Label className="text-[11px]">Wireframe</Label>
                          <Sw
                            checked={s.monolithWireframe}
                            onCheckedChange={(v) => set({ monolithWireframe: v })}
                          />
                        </div>
                      </>
                    )}
                    {s.view === "mandala" && (
                      <>
                        <S
                          label="Amplitude"
                          value={s.mandalaAmplitude}
                          min={0.05}
                          max={3}
                          step={0.05}
                          onChange={(v) => set({ mandalaAmplitude: v })}
                        />
                        <S
                          label="Line count"
                          value={s.mandalaLineCount}
                          min={2}
                          max={48}
                          step={1}
                          onChange={(v) => set({ mandalaLineCount: Math.round(v) })}
                        />
                        <S
                          label="Line width"
                          value={s.mandalaLineWidth}
                          min={1}
                          max={8}
                          step={0.5}
                          onChange={(v) => set({ mandalaLineWidth: v })}
                        />
                        <div className="flex items-center justify-between">
                          <Label className="text-[11px]">Use selected palette</Label>
                          <Sw
                            checked={s.mandalaUsePalette}
                            onCheckedChange={(v) => set({ mandalaUsePalette: v })}
                          />
                        </div>
                      </>
                    )}
                    {s.view === "terrain" && (
                      <>
                        <S
                          label="Amplitude"
                          value={s.terrainAmplitude}
                          min={0.05}
                          max={4}
                          step={0.05}
                          onChange={(v) => set({ terrainAmplitude: v })}
                        />
                        <S
                          label="Columns"
                          value={s.terrainColumns}
                          min={16}
                          max={256}
                          step={8}
                          onChange={(v) => set({ terrainColumns: Math.round(v) })}
                        />
                        <div className="flex items-center justify-between">
                          <Label className="text-[11px]">Use selected palette</Label>
                          <Sw
                            checked={s.terrainUsePalette}
                            onCheckedChange={(v) => set({ terrainUsePalette: v })}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <Label className="text-[11px]">Wireframe</Label>
                          <Sw
                            checked={s.terrainWireframe}
                            onCheckedChange={(v) => set({ terrainWireframe: v })}
                          />
                        </div>
                      </>
                    )}
                    {s.view === "obsidian" && (
                      <>
                        <S
                          label="Amplitude"
                          value={s.obsidianAmplitude}
                          min={0.05}
                          max={3}
                          step={0.05}
                          onChange={(v) => set({ obsidianAmplitude: v })}
                        />
                        <Row label="Shard detail">
                          <div className="flex gap-1.5">
                            {([0, 1, 2, 3] as const).map((d) => (
                              <Bn
                                key={d}
                                active={s.obsidianShardDetail === d}
                                className="flex-1"
                                onClick={() => set({ obsidianShardDetail: d })}
                              >
                                {d === 0 ? "Low" : d === 1 ? "Med" : d === 2 ? "High" : "Ultra"}
                              </Bn>
                            ))}
                          </div>
                        </Row>
                        <div className="flex items-center justify-between">
                          <Label className="text-[11px]">Use selected palette</Label>
                          <Sw
                            checked={s.obsidianUsePalette}
                            onCheckedChange={(v) => set({ obsidianUsePalette: v })}
                          />
                        </div>
                      </>
                    )}
                    {s.view === "torus" && (
                      <>
                        <S
                          label="Amplitude"
                          value={s.torusAmplitude}
                          min={0.05}
                          max={3}
                          step={0.05}
                          onChange={(v) => set({ torusAmplitude: v })}
                        />
                        <S
                          label="Orbit speed"
                          value={s.torusSpeed}
                          min={0.1}
                          max={4}
                          step={0.1}
                          onChange={(v) => set({ torusSpeed: v })}
                        />
                        <S
                          label="Torus count"
                          value={s.torusCount}
                          min={1}
                          max={5}
                          step={1}
                          onChange={(v) => set({ torusCount: Math.round(v) })}
                        />
                        <S
                          label="Torus spacing"
                          value={s.torusSpacing}
                          min={6}
                          max={24}
                          step={0.2}
                          onChange={(v) => set({ torusSpacing: v })}
                        />
                        <S
                          label="Torus size"
                          value={s.torusSize}
                          min={0.5}
                          max={1.8}
                          step={0.05}
                          onChange={(v) => set({ torusSize: v })}
                        />
                        <S
                          label="Particle size"
                          value={s.torusParticleSize}
                          min={0.01}
                          max={0.16}
                          step={0.005}
                          onChange={(v) => set({ torusParticleSize: v })}
                        />
                        <S
                          label="Particle count"
                          value={s.torusParticleCount}
                          min={200}
                          max={20000}
                          step={200}
                          onChange={(v) => set({ torusParticleCount: Math.round(v) })}
                        />
                        <Row label="Color mode">
                          <div className="grid grid-cols-2 gap-1.5">
                            {(
                              [
                                ["shared", "Shared"],
                                ["individual", "Individual"],
                              ] as const
                            ).map(([mode, label]) => (
                              <Bn
                                key={mode}
                                active={s.torusColorMode === mode}
                                className="justify-start"
                                onClick={() => set({ torusColorMode: mode })}
                              >
                                {label}
                              </Bn>
                            ))}
                          </div>
                        </Row>
                        <Row label="Rotation mode">
                          <div className="grid grid-cols-2 gap-1.5">
                            {(
                              [
                                ["flat", "Flat"],
                                ["odd-upright", "Odd up"],
                                ["alternating-x", "Alt X"],
                                ["alternating-z", "Alt Z"],
                                ["fan", "Fan"],
                              ] as const
                            ).map(([mode, label]) => (
                              <Bn
                                key={mode}
                                active={s.torusRotationMode === mode}
                                className="justify-start"
                                onClick={() => set({ torusRotationMode: mode })}
                              >
                                {label}
                              </Bn>
                            ))}
                          </div>
                        </Row>
                        <div className="flex items-center justify-between">
                          <Label className="text-[11px]">Use selected palette</Label>
                          <Sw
                            checked={s.torusUsePalette}
                            onCheckedChange={(v) => set({ torusUsePalette: v })}
                          />
                        </div>
                      </>
                    )}
                    {s.view === "soundwall" && (
                      <>
                        <S
                          label="Amplitude"
                          value={s.soundwallAmplitude}
                          min={0.05}
                          max={3}
                          step={0.05}
                          onChange={(v) => set({ soundwallAmplitude: v })}
                        />
                        <S
                          label="Columns per side"
                          value={s.soundwallColumns}
                          min={4}
                          max={40}
                          step={1}
                          onChange={(v) => set({ soundwallColumns: Math.round(v) })}
                        />
                        <S
                          label="History rows (depth)"
                          value={s.soundwallRows}
                          min={2}
                          max={24}
                          step={1}
                          onChange={(v) => set({ soundwallRows: Math.round(v) })}
                        />
                        <div className="flex items-center justify-between">
                          <Label className="text-[11px]">Use selected palette</Label>
                          <Sw
                            checked={s.soundwallUsePalette}
                            onCheckedChange={(v) => set({ soundwallUsePalette: v })}
                          />
                        </div>
                      </>
                    )}
                    {s.view === "geometrynebula" && (
                      <>
                        <S
                          label="Amplitude"
                          value={s.geometrynebulaAmplitude}
                          min={0.05}
                          max={5}
                          step={0.05}
                          onChange={(v) => set({ geometrynebulaAmplitude: v })}
                        />
                        <S
                          label="Shape count"
                          value={s.geometrynebulaCount}
                          min={6}
                          max={120}
                          step={6}
                          onChange={(v) => set({ geometrynebulaCount: Math.round(v) })}
                        />
                        <S
                          label="Shape spread"
                          value={s.geometrynebulaSpread}
                          min={0.8}
                          max={3}
                          step={0.05}
                          onChange={(v) => set({ geometrynebulaSpread: v })}
                        />
                        <S
                          label="Orbit speed"
                          value={s.geometrynebulaOrbitSpeed}
                          min={0.1}
                          max={2.5}
                          step={0.05}
                          onChange={(v) => set({ geometrynebulaOrbitSpeed: v })}
                        />
                        <S
                          label="Spin speed"
                          value={s.geometrynebulaSpinSpeed}
                          min={0.1}
                          max={4}
                          step={0.05}
                          onChange={(v) => set({ geometrynebulaSpinSpeed: v })}
                        />
                        <div className="flex items-center justify-between">
                          <Label className="text-[11px]">Use selected palette</Label>
                          <Sw
                            checked={s.geometrynebulaUsePalette}
                            onCheckedChange={(v) => set({ geometrynebulaUsePalette: v })}
                          />
                        </div>
                      </>
                    )}
                    {s.view === "reztube" && (
                      <>
                        <S
                          label="Amplitude"
                          value={s.reztubeAmplitude}
                          min={0.1}
                          max={4}
                          step={0.05}
                          onChange={(v) => set({ reztubeAmplitude: v })}
                        />
                        <S
                          label="Fly speed"
                          value={s.reztubeSpeed}
                          min={0.1}
                          max={6}
                          step={0.1}
                          onChange={(v) => set({ reztubeSpeed: v })}
                        />
                        <S
                          label="Twist"
                          value={s.reztubeTwist}
                          min={0}
                          max={4}
                          step={0.05}
                          onChange={(v) => set({ reztubeTwist: v })}
                        />
                        <S
                          label="Tube radius"
                          value={s.reztubeRadius}
                          min={2}
                          max={10}
                          step={0.1}
                          onChange={(v) => set({ reztubeRadius: v })}
                        />
                        <S
                          label="Sides"
                          value={s.reztubeSegments}
                          min={3}
                          max={12}
                          step={1}
                          onChange={(v) => set({ reztubeSegments: Math.round(v) })}
                        />
                        <S
                          label="Line width"
                          value={s.reztubeLineWidth}
                          min={0.5}
                          max={6}
                          step={0.5}
                          onChange={(v) => set({ reztubeLineWidth: v })}
                        />
                        <div className="flex items-center justify-between">
                          <Label className="text-[11px]">Use selected palette</Label>
                          <Sw
                            checked={s.reztubeUsePalette}
                            onCheckedChange={(v) => set({ reztubeUsePalette: v })}
                          />
                        </div>
                      </>
                    )}
                    {s.view === "assetflow" && (
                      <>
                        <S
                          label="Amplitude"
                          value={s.assetflowAmplitude}
                          min={0.1}
                          max={3}
                          step={0.05}
                          onChange={(v) => set({ assetflowAmplitude: v })}
                        />
                        <S
                          label="Model scale"
                          value={s.assetflowModelScale}
                          min={0.4}
                          max={2.2}
                          step={0.05}
                          onChange={(v) => set({ assetflowModelScale: v })}
                        />
                        <S
                          label="2D background amount"
                          value={s.assetflowSpriteAmount}
                          min={0.2}
                          max={2.5}
                          step={0.05}
                          onChange={(v) => set({ assetflowSpriteAmount: v })}
                        />
                        <S
                          label="Movement intensity"
                          value={s.assetflowMovement}
                          min={0.35}
                          max={1.8}
                          step={0.05}
                          onChange={(v) => set({ assetflowMovement: v })}
                        />
                        <S
                          label="2D background drift"
                          value={s.assetflowBackgroundDrift}
                          min={0}
                          max={3}
                          step={0.05}
                          onChange={(v) => set({ assetflowBackgroundDrift: v })}
                        />
                        <S
                          label="Model count"
                          value={s.assetflowModelCount}
                          min={1}
                          max={24}
                          step={1}
                          onChange={(v) => set({ assetflowModelCount: Math.round(v) })}
                        />
                        <S
                          label="Model spread"
                          value={s.assetflowSpread}
                          min={2}
                          max={12}
                          step={0.1}
                          onChange={(v) => set({ assetflowSpread: v })}
                        />
                        <S
                          label="Model spin"
                          value={s.assetflowSpin}
                          min={0}
                          max={3}
                          step={0.05}
                          onChange={(v) => set({ assetflowSpin: v })}
                        />
                        <div className="flex items-center justify-between">
                          <Label className="text-[11px]">Use selected palette</Label>
                          <Sw
                            checked={s.assetflowUsePalette}
                            onCheckedChange={(v) => set({ assetflowUsePalette: v })}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <Label className="text-[11px]">Include geometric shapes</Label>
                          <Sw
                            checked={s.assetflowIncludeShapes}
                            onCheckedChange={(v) => set({ assetflowIncludeShapes: v })}
                          />
                        </div>
                        <div className="rounded-md border border-white/10 bg-white/[0.02] px-3 py-2">
                          <Label className="text-[11px]">Asset licenses</Label>
                          <p className="mt-1 text-[10px] leading-relaxed text-white/60">
                            Asset-Flow uses Khronos glTF Sample Assets. Most runtime models are CC0
                            1.0; Fox includes CC BY 4.0 contributions and requires attribution.
                          </p>
                          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.16em] text-white/35">
                            Full ledger: docs/THIRD_PARTY_ASSETS.md
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </SheetContent>

        {/* Vertical tab strip + slide-out panels (only while sheet is open) */}
        {open && (
          <>
            {/* Vertical tab strip — sits just to the left of the 380px sheet */}
            <div
              data-analyser-flyout
              className={
                "fixed right-[380px] top-1/2 z-[60] -translate-y-1/2 flex flex-col gap-1 " +
                "transition-all duration-[220ms] ease-out " +
                (flyoutVisible
                  ? "translate-x-0 opacity-100"
                  : "translate-x-4 opacity-0 pointer-events-none")
              }
            >
              {(
                [
                  { id: "audio", label: "Audio" },
                  { id: "scene", label: "Scene" },
                  { id: "post", label: "Post FX" },
                ] as const
              ).map((t) => {
                const active = ui.activeTab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => updateUi({ activeTab: active ? "" : t.id })}
                    className={
                      "group h-24 w-9 rounded-l-md border border-r-0 backdrop-blur-xl transition-all flex items-center justify-center " +
                      (active
                        ? "bg-emerald-400 text-black border-emerald-300/60 shadow-[0_0_14px_rgba(52,211,153,0.55)]"
                        : "bg-black/70 text-white/70 border-white/10 hover:text-white hover:bg-black/85")
                    }
                    title={t.label}
                  >
                    <span
                      className="font-mono text-[10px] uppercase tracking-[0.3em]"
                      style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
                    >
                      {t.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Slide-out content panel — appears to the left of the tab strip */}
            <div
              data-analyser-flyout
              ref={flyoutPanelRef}
              aria-hidden={!ui.activeTab}
              inert={!ui.activeTab}
              className={
                "analyser-scroll fixed right-[416px] top-0 z-[55] h-screen w-[360px] overflow-y-auto " +
                "bg-black/85 backdrop-blur-xl border-l border-r border-white/10 text-white text-[12px] " +
                "transition-transform duration-300 ease-out " +
                (ui.activeTab && flyoutVisible
                  ? "translate-x-0 opacity-100"
                  : "translate-x-[420px] opacity-0 pointer-events-none")
              }
            >
              <div className="p-4 pb-12 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-white/70">
                    {ui.activeTab === "audio"
                      ? "Audio"
                      : ui.activeTab === "scene"
                        ? "Scene"
                        : ui.activeTab === "post"
                          ? "Post FX"
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
                    {s.showBPM && (
                      <div className="space-y-3 rounded-md border border-white/10 bg-white/[0.03] p-3">
                        <div className="flex items-end justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-white/40">
                              BPM
                              <ExperimentalBadge />
                            </div>
                            {liveTempo.bpmConfidence > 0.25 && (
                              <p className="mt-1 font-mono text-[9px] text-white/35">
                                {Math.round(liveTempo.bpmConfidence * 100)}% confidence
                                {liveTempo.barTiming.bpmLocked ? " · locked" : ""}
                              </p>
                            )}
                          </div>
                          <div
                            className="font-mono text-3xl font-bold tabular-nums text-white/70"
                            style={{
                              textShadow:
                                liveTempo.bpm > 0 && liveTempo.bpmConfidence > 0.4
                                  ? `0 0 ${Math.max(8, liveTempo.bpmConfidence * 20)}px rgba(52, 211, 153, ${liveTempo.bpmConfidence * 0.6})`
                                  : undefined,
                              opacity:
                                liveTempo.bpm > 0
                                  ? 0.3 + liveTempo.bpmConfidence * 0.4
                                  : 0.35,
                            }}
                          >
                            {liveTempo.audioRunning && liveTempo.bpm > 0
                              ? liveTempo.bpm
                              : "—"}
                          </div>
                        </div>
                        {liveTempo.audioRunning &&
                        (liveTempo.barTiming.totalBeats > 0 ||
                          liveTempo.bpmConfidence > 0.25) ? (
                          <BarTimingHud compact />
                        ) : (
                          <p className="font-mono text-[9px] leading-relaxed text-white/35">
                            Start audio to detect tempo. Tap{" "}
                            <span className="text-white/50">T</span> on beats,{" "}
                            <span className="text-white/50">⇧T</span> on downbeat.
                          </p>
                        )}
                      </div>
                    )}
                    <ToggleRow
                      label="Show latency HUD"
                      enabled={s.showLatency}
                      onToggle={(v) => set({ showLatency: v })}
                    />
                    <p className="px-1 font-mono text-[9px] leading-relaxed text-white/35">
                      Shortcut: <span className="text-emerald-300/80">L</span>
                    </p>
                  </div>
                )}

                {ui.activeTab === "scene" && (
                  <div className="space-y-4">
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
                    <ToggleRow
                      label="Post FX pipeline"
                      enabled={s.postFxEnabled}
                      onToggle={(v) => set({ postFxEnabled: v })}
                    />
                    <Row label="Presets">
                      <div className="flex flex-wrap gap-1.5">
                        {Object.keys(PRESETS).map((name) => (
                          <Bn
                            key={name}
                            active={s.activePreset === name}
                            variant="default"
                            onClick={() => settingsStore.applyPreset(name as keyof typeof PRESETS)}
                          >
                            {name}
                          </Bn>
                        ))}
                        <Bn variant="primary" onClick={() => settingsStore.randomize()}>
                          <Shuffle className="mr-1 h-3 w-3" /> Randomize
                        </Bn>
                        <Bn variant="ghost" onClick={() => settingsStore.reset()}>
                          Reset
                        </Bn>
                      </div>
                      <div className="mt-2 flex items-center justify-between rounded-md border border-white/10 bg-white/[0.02] px-3 py-2.5">
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
                    </Row>

                    <div className="rounded-md border border-white/10 bg-white/[0.03]">
                      <button
                        onClick={() => updateUi({ slotsOpen: !ui.slotsOpen })}
                        className="flex w-full items-center justify-between px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-white/60 hover:text-white"
                      >
                        <span>My presets (saved locally)</span>
                        <ChevronDown
                          className={`h-3.5 w-3.5 transition-transform ${ui.slotsOpen ? "rotate-180" : ""}`}
                        />
                      </button>
                      {ui.slotsOpen && (
                        <div className="space-y-3 border-t border-white/10 p-3">
                          <div className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.02] px-3 py-3">
                            <div>
                              <Label className="text-[11px]">Saved presets</Label>
                              <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/35 mt-0.5">
                                {slots.length} saved locally
                              </div>
                            </div>
                            <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/35">
                              Focus a save, then play, step, random, save, add, or delete.
                            </div>
                          </div>

                          <div className="rounded-md border border-white/10 bg-black/20 p-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <select
                                value={hasSavedPresets ? String(activeSaveIndex) : ""}
                                onChange={(e) => setSelectedSaveIndex(Number(e.target.value))}
                                disabled={!hasSavedPresets}
                                aria-label="Focused save"
                                className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/40 px-3 py-2 text-[12px] text-white outline-none transition-colors hover:border-white/20 focus:border-emerald-400/50 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {hasSavedPresets ? (
                                  slots.map((slot, index) => (
                                    <option key={`${slot.name}-${index}`} value={index}>
                                      {index + 1}. {slot.name}
                                    </option>
                                  ))
                                ) : (
                                  <option value="">No saved presets yet</option>
                                )}
                              </select>
                              <Bn
                                variant="primary"
                                className="h-9 px-2"
                                onClick={loadFocusedPreset}
                                disabled={!hasSavedPresets}
                                title="Load focused save"
                                aria-label="Load focused save"
                              >
                                <Play className="h-4 w-4" />
                                <span>Load</span>
                              </Bn>
                              <Bn
                                variant="default"
                                className="h-9 px-2"
                                onClick={() => stepSavedPreset(-1)}
                                disabled={!hasSavedPresets}
                                title="Focus previous save"
                                aria-label="Focus previous save"
                              >
                                <SkipBack className="h-4 w-4" />
                                <span>Prev</span>
                              </Bn>
                              <Bn
                                variant="default"
                                className="h-9 px-2"
                                onClick={() => stepSavedPreset(1)}
                                disabled={!hasSavedPresets}
                                title="Focus next save"
                                aria-label="Focus next save"
                              >
                                <SkipForward className="h-4 w-4" />
                                <span>Next</span>
                              </Bn>
                              <Bn
                                variant="default"
                                className="h-9 px-2"
                                onClick={loadRandomSavedPreset}
                                disabled={!hasSavedPresets}
                                title="Focus random save"
                                aria-label="Focus random save"
                              >
                                <Shuffle className="h-4 w-4" />
                                <span>Random</span>
                              </Bn>
                              <Bn
                                variant="default"
                                className="h-9 px-2"
                                onClick={saveFocusedPreset}
                                title={
                                  hasSavedPresets
                                    ? "Overwrite focused save"
                                    : "Save current as first save"
                                }
                                aria-label={
                                  hasSavedPresets
                                    ? "Overwrite focused save"
                                    : "Save current as first save"
                                }
                              >
                                <Save className="h-4 w-4" />
                                <span>Save</span>
                              </Bn>
                              <Bn
                                variant="default"
                                className="h-9 px-2"
                                onClick={saveCurrentPreset}
                                title="Add new save"
                                aria-label="Add new save"
                              >
                                <Plus className="h-4 w-4" />
                                <span>Add</span>
                              </Bn>
                              <Bn
                                variant="ghost"
                                className="h-9 px-2"
                                onClick={deleteSavedPreset}
                                disabled={!hasSavedPresets}
                                title="Delete focused save"
                                aria-label="Delete focused save"
                              >
                                <Trash2 className="h-4 w-4" />
                                <span>Delete</span>
                              </Bn>
                            </div>
                            <div className="mt-2 flex items-center justify-between gap-2 font-mono text-[9px] uppercase tracking-[0.16em] text-white/35">
                              <span>
                                {hasSavedPresets
                                  ? `Focused: ${activeSaveIndex + 1}. ${slots[activeSaveIndex]?.name ?? "Save"}`
                                  : "Save current setup to start your list."}
                              </span>
                              <span>
                                Play loads. Skip or shuffle changes focus. Save updates focused.
                              </span>
                            </div>
                          </div>

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
                              Turning on loads the first saved preset immediately, then advances in
                              list order.
                            </p>
                          </ToggleRow>
                        </div>
                      )}
                    </div>

                    <ToggleRow label="Bloom" enabled={s.bloom} onToggle={(v) => set({ bloom: v })}>
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
                                bloomStrength: Math.min(s.bloomStrength, BLOOM_STRENGTH_MAX_NORMAL),
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
                      label="Glitch"
                      enabled={s.glitch}
                      onToggle={(v) => set({ glitch: v })}
                    >
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Wild mode</Label>
                        <Sw
                          checked={s.glitchWild}
                          onCheckedChange={(v) => set({ glitchWild: v })}
                        />
                      </div>
                    </ToggleRow>
                    <ToggleRow
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
                    <ToggleRow
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
                    <ToggleRow label="SSAO" enabled={s.ssao} onToggle={(v) => set({ ssao: v })}>
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
                    <ToggleRow
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
                    <ToggleRow label="CRT" enabled={s.crtFx} onToggle={(v) => set({ crtFx: v })}>
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
                    <ToggleRow
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
                    <ToggleRow
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
