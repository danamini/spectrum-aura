import * as React from "react";
import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ChevronDown, Save, Settings as SettingsIcon, Shuffle, Trash2 } from "lucide-react";
import {
  BLOOM_STRENGTH_MAX_NORMAL,
  PALETTES,
  PRESETS,
  settingsStore,
  useSettings,
  useSlots,
  type Settings,
} from "./store";

// Cooler, clearer toggle switch with explicit ON/OFF affordance
function Sw({ checked, onCheckedChange }: { checked: boolean; onCheckedChange: (v: boolean) => void }) {
  return (
    <Switch
      checked={checked}
      onCheckedChange={onCheckedChange}
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
  active, variant = "outline", className = "", children, onClick, ...rest
}: {
  active?: boolean;
  variant?: BnVariant;
  className?: string;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const [ripples, setRipples] = React.useState<{ id: number; x: number; y: number; size: number }[]>([]);
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
    "transition-colors disabled:opacity-40 disabled:pointer-events-none";
  let look = "";
  if (active) {
    look = "bg-emerald-400 text-black border border-emerald-300/60 shadow-[0_0_10px_rgba(52,211,153,0.45)] hover:bg-emerald-300";
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
      <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">{label}</Label>
      {children}
    </div>
  );
}

function ToggleRow({
  label, enabled, onToggle, children,
}: { label: string; enabled: boolean; onToggle: (v: boolean) => void; children?: React.ReactNode }) {
  return (
    <div className={`rounded-md border p-3 space-y-3 transition-colors ${enabled ? "border-emerald-400/30 bg-emerald-400/[0.04]" : "border-white/5 bg-white/[0.02]"}`}>
      <div className="flex items-center justify-between gap-2">
        <Label className="flex items-center gap-2 text-[11px] font-medium tracking-wide">
          <span className={`h-1.5 w-1.5 rounded-full ${enabled ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" : "bg-white/20"}`} />
          {label}
          <span className={`ml-1 font-mono text-[9px] uppercase tracking-wider ${enabled ? "text-emerald-300/80" : "text-white/30"}`}>
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
  label, value, min, max, step, onChange,
}: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between font-mono text-[10px] uppercase tracking-wider text-white/40">
        <span>{label}</span>
        <span className="tabular-nums text-white/70">{value.toFixed(step < 0.01 ? 4 : step < 0.1 ? 2 : 1)}</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={(v) => onChange(v[0])} />
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
  } catch {}
  return fallback;
};

export function ControlPanel() {
  const s = useSettings();
  const slots = useSlots();
  const [open, setOpen] = useState(false);
  const [ui, setUi] = useState<UIState>(loadUI);
  const updateUi = (patch: Partial<UIState>) => {
    setUi((prev) => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem(UI_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };
  const viewSettingsOpen = ui.viewSettingsOpen;
  const setViewSettingsOpen = (v: boolean | ((o: boolean) => boolean)) =>
    updateUi({ viewSettingsOpen: typeof v === "function" ? v(ui.viewSettingsOpen) : v });
  const set = (patch: Partial<Settings>) => settingsStore.set(patch);

  const hasViewSettings = true;
  const viewLabels: Record<Settings["view"], string> = {
    combo: "3D Combo view settings",
    classic: "Classic view settings",
    ripple: "Ripple view settings",
    datastream: "Cyberpunk Data-Stream settings",
    nebula: "Ethereal Nebula settings",
    monolith: "Brutalist Monolith settings",
    mandala: "Symmetric Mandala settings",
    terrain: "Audio-Reactive Terrain settings",
  };
  const viewLabel = viewLabels[s.view];
  const viewOptions = [
    { id: "combo", label: "Combo" },
    { id: "classic", label: "Classic" },
    { id: "ripple", label: "Ripple" },
    { id: "datastream", label: "Data-Stream" },
    { id: "nebula", label: "Nebula" },
    { id: "monolith", label: "Monolith" },
    { id: "mandala", label: "Mandala" },
    { id: "terrain", label: "Terrain" },
  ] as const;
  const fullscreenByView: Record<Settings["view"], keyof Settings> = {
    combo: "comboFullscreen",
    classic: "classicFullscreen",
    ripple: "rippleFullscreen",
    datastream: "datastreamFullscreen",
    nebula: "nebulaFullscreen",
    monolith: "monolithFullscreen",
    mandala: "mandalaFullscreen",
    terrain: "terrainFullscreen",
  };
  const fullscreenKey = fullscreenByView[s.view];
  const is2d = Boolean(s[fullscreenKey]);
  const setCurrentViewFullscreen = (value: boolean) => {
    if (s.view === "combo") set({ comboFullscreen: value });
    else if (s.view === "classic") set({ classicFullscreen: value });
    else if (s.view === "ripple") set({ rippleFullscreen: value });
    else if (s.view === "datastream") set({ datastreamFullscreen: value });
    else if (s.view === "nebula") set({ nebulaFullscreen: value });
    else if (s.view === "monolith") set({ monolithFullscreen: value });
    else if (s.view === "mandala") set({ mandalaFullscreen: value });
    else if (s.view === "terrain") set({ terrainFullscreen: value });
  };

  return (
    <Sheet open={open} onOpenChange={setOpen} modal={false}>
      <SheetTrigger asChild>
        <Button
          size="icon"
          className="fixed bottom-3 right-3 z-[101] bg-black/50 backdrop-blur border border-white/10 hover:bg-black/70 opacity-20 hover:opacity-100 transition-opacity duration-300"
        >
          <SettingsIcon className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent
        onInteractOutside={(e) => {
          const t = e.target as HTMLElement | null;
          if (t && t.closest("[data-analyser-flyout]")) e.preventDefault();
        }}
        className="analyser-scroll w-[380px] overflow-y-auto bg-black/85 backdrop-blur-xl border-white/10 text-white text-[12px] sm:max-w-[380px]"
      >
        <SheetHeader>
          <SheetTitle className="font-mono text-[11px] uppercase tracking-[0.3em] text-white/70">Controls</SheetTitle>
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
              <Bn active={!is2d} onClick={() => setCurrentViewFullscreen(false)}>3D</Bn>
              <Bn active={is2d} onClick={() => setCurrentViewFullscreen(true)}>2D</Bn>
            </div>
          </Row>

          {hasViewSettings && (
            <div className="rounded-md border border-white/10 bg-white/[0.03]">
              <button
                onClick={() => setViewSettingsOpen((o) => !o)}
                className="flex w-full items-center justify-between px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-white/60 hover:text-white"
              >
                <span>{viewLabel}</span>
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${viewSettingsOpen ? "rotate-180" : ""}`} />
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
                      <S label="Sphere size" value={s.comboSphereSize} min={0.2} max={3} step={0.05} onChange={(v) => set({ comboSphereSize: v })} />
                      <S label="Sphere bass punch" value={s.comboSphereBassPunch} min={0} max={1.5} step={0.05} onChange={(v) => set({ comboSphereBassPunch: v })} />
                      <S label="Sphere spin speed" value={s.comboSphereSpinSpeed} min={-1.5} max={1.5} step={0.05} onChange={(v) => set({ comboSphereSpinSpeed: v })} />
                      <S label="Sphere displacement" value={s.sphereDisplacement} min={0} max={2} step={0.05} onChange={(v) => set({ sphereDisplacement: v })} />
                      <S label="Bar ring radius" value={s.comboBarRadius} min={2} max={10} step={0.1} onChange={(v) => set({ comboBarRadius: v })} />
                      <S label="Bar height" value={s.comboBarHeightScale} min={0.1} max={3} step={0.05} onChange={(v) => set({ comboBarHeightScale: v })} />
                      <S label="Bar count" value={s.barCount} min={32} max={256} step={8} onChange={(v) => set({ barCount: Math.round(v) })} />
                      <S label="Particle size" value={s.comboParticleSize} min={0.2} max={4} step={0.05} onChange={(v) => set({ comboParticleSize: v })} />
                      <S label="Particle count" value={s.particleCount} min={500} max={15000} step={500} onChange={(v) => set({ particleCount: Math.round(v) })} />
                      <div className="flex items-center justify-between pt-1">
                        <Label className="text-[11px]">Level meter colours (R/Y/G)</Label>
                        <Sw checked={s.comboLevelMeter} onCheckedChange={(v) => set({ comboLevelMeter: v })} />
                      </div>
                    </>
                  )}
                  {s.view === "classic" && (
                    <>
                      <ToggleRow label="Spin classic view" enabled={s.classicSpin} onToggle={(v) => set({ classicSpin: v })}>
                        <S label="Spin speed" value={s.classicSpinSpeed} min={-2} max={2} step={0.05} onChange={(v) => set({ classicSpinSpeed: v })} />
                      </ToggleRow>
                      <div className="flex items-center justify-between">
                        <Label className="text-[11px]">Color bands (R/Y/G)</Label>
                        <Sw checked={s.classicColorBands} onCheckedChange={(v) => set({ classicColorBands: v })} />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label className="text-[11px]">Blocky LED cells</Label>
                        <Sw checked={s.classicBlocky} onCheckedChange={(v) => set({ classicBlocky: v })} />
                      </div>
                      {s.classicBlocky && (
                        <S label="Segments per bar" value={s.classicSegments} min={4} max={40} step={1} onChange={(v) => set({ classicSegments: Math.round(v) })} />
                      )}
                      <div className="flex items-center justify-between">
                        <Label className="text-[11px]">Background grid</Label>
                        <Sw checked={s.classicGrid} onCheckedChange={(v) => set({ classicGrid: v })} />
                      </div>
                      {s.classicGrid && (
                        <S label="Grid opacity" value={s.classicGridOpacity} min={0} max={1} step={0.02} onChange={(v) => set({ classicGridOpacity: v })} />
                      )}
                      <div className="flex items-center justify-between">
                        <Label className="text-[11px]">Frequency labels in 2D fit</Label>
                        <Sw checked={s.classicShowFreqLabels} onCheckedChange={(v) => set({ classicShowFreqLabels: v })} />
                      </div>
                      <S label="Peak hold (sec)" value={s.classicPeakHold} min={0} max={5} step={0.1} onChange={(v) => set({ classicPeakHold: v })} />
                      <S label="Peak decay (units/sec)" value={s.classicPeakDecay} min={0.05} max={3} step={0.05} onChange={(v) => set({ classicPeakDecay: v })} />

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
                            {["#ffffff", "#ff2d95", "#00e5ff", "#a6ff00", "#ffb347", "#7a5cff"].map((c) => (
                              <button
                                key={c}
                                onClick={() => set({ classicPeakColor: c })}
                                className={`h-6 w-6 rounded border transition ${s.classicPeakColor.toLowerCase() === c ? "border-white scale-110" : "border-white/20 hover:border-white/40"}`}
                                style={{ background: c, boxShadow: s.classicPeakColor.toLowerCase() === c ? `0 0 10px ${c}aa` : undefined }}
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
                      <S label="Ring count" value={s.rippleRingCount} min={4} max={120} step={1} onChange={(v) => set({ rippleRingCount: Math.round(v) })} />
                      <S
                        label="Side-by-side ripples (freq. bands)"
                        value={s.rippleColumns}
                        min={1}
                        max={50}
                        step={1}
                        onChange={(v) => set({ rippleColumns: Math.round(v) })}
                      />
                      <S label="Max radius" value={s.rippleMaxRadius} min={2} max={14} step={0.1} onChange={(v) => set({ rippleMaxRadius: v })} />
                      <S label="Wave speed" value={s.rippleSpeed} min={0} max={4} step={0.05} onChange={(v) => set({ rippleSpeed: v })} />
                      <S label="Amplitude" value={s.rippleAmplitude} min={0.5} max={3} step={0.05} onChange={(v) => set({ rippleAmplitude: v })} />
                      <S label="Wave cycles" value={s.rippleWaveCycles} min={0.2} max={6} step={0.1} onChange={(v) => set({ rippleWaveCycles: v })} />
                      <S label="Ring thickness" value={s.rippleThickness} min={0.2} max={3} step={0.05} onChange={(v) => set({ rippleThickness: v })} />
                      <S label="Rotation speed" value={s.rippleRotationSpeed} min={-1} max={1} step={0.02} onChange={(v) => set({ rippleRotationSpeed: v })} />
                      <S label="Opacity" value={s.rippleOpacity} min={0.1} max={1} step={0.02} onChange={(v) => set({ rippleOpacity: v })} />
                      <div className="flex items-center justify-between">
                        <Label className="text-[11px]">Wireframe</Label>
                        <Sw checked={s.rippleWireframe} onCheckedChange={(v) => set({ rippleWireframe: v })} />
                      </div>
                    </>
                  )}
                  {s.view === "datastream" && (
                    <>
                      <S label="Amplitude" value={s.datastreamAmplitude} min={0.5} max={3} step={0.05} onChange={(v) => set({ datastreamAmplitude: v })} />
                      <S label="Particle count" value={s.datastreamItemCount} min={500} max={30000} step={500} onChange={(v) => set({ datastreamItemCount: Math.round(v) })} />
                      <div className="flex items-center justify-between">
                        <Label className="text-[11px]">Use selected palette</Label>
                        <Sw checked={s.datastreamUsePalette} onCheckedChange={(v) => set({ datastreamUsePalette: v })} />
                      </div>
                    </>
                  )}
                  {s.view === "nebula" && (
                    <>
                      <S label="Amplitude" value={s.nebulaAmplitude} min={0.5} max={3} step={0.05} onChange={(v) => set({ nebulaAmplitude: v })} />
                      <S label="Detail" value={s.nebulaDetail} min={24} max={220} step={4} onChange={(v) => set({ nebulaDetail: Math.round(v) })} />
                      <div className="flex items-center justify-between">
                        <Label className="text-[11px]">Use selected palette</Label>
                        <Sw checked={s.nebulaUsePalette} onCheckedChange={(v) => set({ nebulaUsePalette: v })} />
                      </div>
                    </>
                  )}
                  {s.view === "monolith" && (
                    <>
                      <S label="Amplitude" value={s.monolithAmplitude} min={0.5} max={1.5} step={0.05} onChange={(v) => set({ monolithAmplitude: v })} />
                      <S label="Grid size (NxN squares)" value={s.monolithGridSize} min={2} max={40} step={1} onChange={(v) => set({ monolithGridSize: Math.round(v) })} />
                      <div className="flex items-center justify-between">
                        <Label className="text-[11px]">Use selected palette</Label>
                        <Sw checked={s.monolithUsePalette} onCheckedChange={(v) => set({ monolithUsePalette: v })} />
                      </div>
                    </>
                  )}
                  {s.view === "mandala" && (
                    <>
                      <S label="Amplitude" value={s.mandalaAmplitude} min={0.5} max={3} step={0.05} onChange={(v) => set({ mandalaAmplitude: v })} />
                      <S label="Line count" value={s.mandalaLineCount} min={2} max={48} step={1} onChange={(v) => set({ mandalaLineCount: Math.round(v) })} />
                      <S label="Line width" value={s.mandalaLineWidth} min={1} max={8} step={0.5} onChange={(v) => set({ mandalaLineWidth: v })} />
                      <div className="flex items-center justify-between">
                        <Label className="text-[11px]">Use selected palette</Label>
                        <Sw checked={s.mandalaUsePalette} onCheckedChange={(v) => set({ mandalaUsePalette: v })} />
                      </div>
                    </>
                  )}
                  {s.view === "terrain" && (
                    <>
                      <S label="Amplitude" value={s.terrainAmplitude} min={0.5} max={4} step={0.05} onChange={(v) => set({ terrainAmplitude: v })} />
                      <S label="Columns" value={s.terrainColumns} min={16} max={256} step={8} onChange={(v) => set({ terrainColumns: Math.round(v) })} />
                      <div className="flex items-center justify-between">
                        <Label className="text-[11px]">Use selected palette</Label>
                        <Sw checked={s.terrainUsePalette} onCheckedChange={(v) => set({ terrainUsePalette: v })} />
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
          <div data-analyser-flyout className="fixed right-[380px] top-1/2 z-[60] -translate-y-1/2 flex flex-col gap-1 animate-fade-in">
            {([
              { id: "audio", label: "Audio" },
              { id: "scene", label: "Scene" },
              { id: "post", label: "Post FX" },
            ] as const).map((t) => {
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
            aria-hidden={!ui.activeTab}
            className={
              "analyser-scroll fixed right-[416px] top-0 z-[55] h-screen w-[360px] overflow-y-auto " +
              "bg-black/85 backdrop-blur-xl border-l border-r border-white/10 text-white text-[12px] " +
              "transition-transform duration-300 ease-out " +
              (ui.activeTab ? "translate-x-0 opacity-100" : "translate-x-[420px] opacity-0 pointer-events-none")
            }
          >
            <div className="p-4 pb-12 space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-white/70">
                  {ui.activeTab === "audio" ? "Audio" : ui.activeTab === "scene" ? "Scene" : ui.activeTab === "post" ? "Post FX" : ""}
                </span>
                <button
                  onClick={() => updateUi({ activeTab: "" })}
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
                    <S label="" value={s.smoothing} min={0} max={0.99} step={0.01} onChange={(v) => set({ smoothing: v })} />
                  </Row>
                  <Row label="Gain">
                    <S label="" value={s.gain} min={0} max={4} step={0.05} onChange={(v) => set({ gain: v })} />
                  </Row>
                  <Row label="Beat sensitivity">
                    <S label="" value={s.beatSensitivity} min={1} max={3} step={0.05} onChange={(v) => set({ beatSensitivity: v })} />
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
                    label="Show BPM overlay (exp.)"
                    enabled={s.showBPM}
                    onToggle={(v) => set({ showBPM: v })}
                  />
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
                            s.paletteIndex === i ? "border-emerald-300/60 bg-emerald-400/10 shadow-[0_0_12px_rgba(52,211,153,0.35)]" : "border-white/10 hover:border-white/30"
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
                        {["#05060a", "#000000", "#0a0010", "#000a10", "#0a0800", "#1a0a00"].map((c) => (
                          <button
                            key={c}
                            onClick={() => set({ bgColor: c })}
                            className={`h-6 w-6 rounded border transition ${s.bgColor.toLowerCase() === c ? "border-white scale-110" : "border-white/20 hover:border-white/40"}`}
                            style={{ background: c, boxShadow: s.bgColor.toLowerCase() === c ? `0 0 10px ${c}aa` : undefined }}
                            aria-label={c}
                          />
                        ))}
                      </div>
                    </div>
                  </Row>
                  <ToggleRow label="Cinematic camera drift" enabled={s.cameraDrift} onToggle={(v) => set({ cameraDrift: v })}>
                    <S label="Drift amount" value={s.cameraDriftAmount} min={0} max={2} step={0.05} onChange={(v) => set({ cameraDriftAmount: v })} />
                  </ToggleRow>
                  <ToggleRow label="Beat-reactive bounce" enabled={s.cameraBeat} onToggle={(v) => set({ cameraBeat: v })}>
                    <S label="Bounce strength" value={s.cameraBeatAmount} min={0} max={3} step={0.05} onChange={(v) => set({ cameraBeatAmount: v })} />
                  </ToggleRow>
                  <ToggleRow label="Mouse camera (drag / scroll)" enabled={s.cameraMouse} onToggle={(v) => set({ cameraMouse: v })} />
                  <ToggleRow label="Performance mode (lower DPR)" enabled={s.performance} onToggle={(v) => set({ performance: v })} />
                </div>
              )}

              {ui.activeTab === "post" && (
                <div className="space-y-3">
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
                      <Bn variant="ghost" onClick={() => settingsStore.reset()}>Reset</Bn>
                    </div>
                  </Row>

                  <div className="rounded-md border border-white/10 bg-white/[0.03]">
                    <button
                      onClick={() => updateUi({ slotsOpen: !ui.slotsOpen })}
                      className="flex w-full items-center justify-between px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-white/60 hover:text-white"
                    >
                      <span>My presets (saved locally)</span>
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${ui.slotsOpen ? "rotate-180" : ""}`} />
                    </button>
                    {ui.slotsOpen && (
                      <div className="space-y-1 border-t border-white/10 p-3">
                        {slots.map((slot, i) => (
                          <div key={i} className="flex items-center gap-1">
                            <Bn
                              variant={slot ? "default" : "outline"}
                              className="flex-1 justify-start normal-case tracking-normal"
                              disabled={!slot}
                              onClick={() => settingsStore.loadSlot(i)}
                              title={slot ? `Load ${slot.name}` : "Empty slot"}
                            >
                              <span className="mr-2 font-mono text-white/40">{i + 1}.</span>
                              {slot ? slot.name : <span className="font-mono uppercase text-white/30">empty</span>}
                            </Bn>
                            <Bn
                              variant="ghost"
                              className="h-8 w-8 px-0"
                              onClick={() => settingsStore.saveSlot(i, `Slot ${i + 1}`)}
                              title="Save current settings to this slot"
                            >
                              <Save className="!h-5 !w-5" />
                            </Bn>
                            <Bn
                              variant="ghost"
                              className="h-8 w-8 px-0"
                              disabled={!slot}
                              onClick={() => settingsStore.clearSlot(i)}
                              title="Clear slot"
                            >
                              <Trash2 className="!h-5 !w-5" />
                            </Bn>
                          </div>
                        ))}
                        <ToggleRow
                          label="Cycle slots (auto-load each preset)"
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
                            Skips empty slots. Needs at least one saved slot. Turning on loads the first saved slot
                            immediately, then advances in order 1 → 5.
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
                    <S label="Radius" value={s.bloomRadius} min={0} max={1.5} step={0.05} onChange={(v) => set({ bloomRadius: v })} />
                    <S label="Threshold" value={s.bloomThreshold} min={0} max={1} step={0.01} onChange={(v) => set({ bloomThreshold: v })} />
                  </ToggleRow>
                  <ToggleRow label="Chromatic aberration" enabled={s.chroma} onToggle={(v) => set({ chroma: v })}>
                    <S label="Amount" value={s.chromaAmount} min={0} max={0.02} step={0.0005} onChange={(v) => set({ chromaAmount: v })} />
                  </ToggleRow>
                  <ToggleRow label="Film grain" enabled={s.grain} onToggle={(v) => set({ grain: v })}>
                    <S label="Amount" value={s.grainAmount} min={0} max={1} step={0.05} onChange={(v) => set({ grainAmount: v })} />
                  </ToggleRow>
                  <ToggleRow label="Vignette" enabled={s.vignette} onToggle={(v) => set({ vignette: v })}>
                    <S label="Amount" value={s.vignetteAmount} min={0.5} max={1.25} step={0.05} onChange={(v) => set({ vignetteAmount: v })} />
                  </ToggleRow>
                  <ToggleRow label="Depth of field" enabled={s.dof} onToggle={(v) => set({ dof: v })}>
                    <S label="Focus" value={s.dofFocus} min={1} max={20} step={0.1} onChange={(v) => set({ dofFocus: v })} />
                    <S label="Aperture" value={s.dofAperture} min={0} max={0.005} step={0.0001} onChange={(v) => set({ dofAperture: v })} />
                    <S label="Max blur" value={s.dofMaxBlur} min={0} max={0.05} step={0.001} onChange={(v) => set({ dofMaxBlur: v })} />
                  </ToggleRow>
                  <ToggleRow label="Glitch" enabled={s.glitch} onToggle={(v) => set({ glitch: v })}>
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Wild mode</Label>
                      <Sw checked={s.glitchWild} onCheckedChange={(v) => set({ glitchWild: v })} />
                    </div>
                  </ToggleRow>
                  <ToggleRow label="God rays" enabled={s.godRays} onToggle={(v) => set({ godRays: v })}>
                    <S label="Amount" value={s.godRaysAmount} min={0} max={2} step={0.05} onChange={(v) => set({ godRaysAmount: v })} />
                  </ToggleRow>
                  <ToggleRow label="Pixelate" enabled={s.pixelate} onToggle={(v) => set({ pixelate: v })}>
                    <S label="Pixel size" value={s.pixelSize} min={1} max={32} step={1} onChange={(v) => set({ pixelSize: v })} />
                  </ToggleRow>
                  <ToggleRow label="Tilt-shift" enabled={s.tiltShift} onToggle={(v) => set({ tiltShift: v })}>
                    <S label="Amount" value={s.tiltAmount} min={0} max={4} step={0.1} onChange={(v) => set({ tiltAmount: v })} />
                  </ToggleRow>
                  <ToggleRow label="Color grading" enabled={s.grading} onToggle={(v) => set({ grading: v })}>
                    <S label="Exposure" value={s.exposure} min={0.3} max={2.5} step={0.05} onChange={(v) => set({ exposure: v })} />
                    <S label="Contrast" value={s.contrast} min={0.5} max={2} step={0.05} onChange={(v) => set({ contrast: v })} />
                    <S label="Saturation" value={s.saturation} min={0} max={2} step={0.05} onChange={(v) => set({ saturation: v })} />
                    <S label="Hue" value={s.hue} min={-0.5} max={0.5} step={0.01} onChange={(v) => set({ hue: v })} />
                  </ToggleRow>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </Sheet>
  );
}
