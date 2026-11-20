import * as React from "react";
import { useState } from "react";

import { Label } from "@/components/ui/label";
import { Bn, Disclosure, FxSection, Row, S, Sw, ToggleRow } from "./control-panel/primitives";
import { PanelFilterContext } from "./control-panel/panel-filter";
import { FILTER_SETTINGS_EVENT, capFor, runAction } from "./keymap";
import { VISUAL_RESPONSE } from "@spectrum-aura/engine/visual-response";
import { TEXT_SOURCES, TEXT_STYLES } from "@spectrum-aura/engine/text-sources/registry";
import { MidiPanel } from "./control-panel/MidiPanel";
import { ViewSettings } from "./control-panel/ViewSettings";
import { ChevronDown, Plus, Save, Search, Shuffle, Trash2 } from "lucide-react";
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
  DEFAULT_SETTINGS,
  BLOOM_STRENGTH_MAX_NORMAL,
  DEFAULT_FX_PIPELINE_ORDER,
  FX_PIPELINE,
  PALETTES,
  PRESETS,
  RETRO_SYSTEMS,
  settingsStore,
  slotThumbSrc,
  useSettings,
  type FxLockId,
  type FxPassId,
  type SavedSlot,
  type Settings,
} from "./store";
import { getVisualDefinition, VISUALS } from "@spectrum-aura/engine/visuals";

import { PANEL_TABS } from "./command-items";

/** Every effect row in the Effects section, for the "add an effect" list. */
const EFFECT_ROWS: ReadonlyArray<readonly [label: string, key: keyof Settings]> = [
  ["Bloom", "bloom"],
  ["Chromatic aberration", "chroma"],
  ["Film grain", "grain"],
  ["Vignette", "vignette"],
  ["Color grading", "grading"],
  ["Depth of field", "dof"],
  ["Motion trails", "motionTrails"],
  ["Radial blur", "radialBlur"],
  ["Tilt-shift", "tiltShift"],
  ["SSAO", "ssao"],
  ["God rays", "godRays"],
  ["Lens flare", "lensFlare"],
  ["Kaleidoscope", "kaleidoscope"],
  ["Mirror", "mirrorFx"],
  ["Pixelate", "pixelate"],
  ["Blueprint sobel", "sobelMode"],
  ["Retro system", "retroFx"],
  ["ASCII", "asciiFx"],
  ["CRT", "crtFx"],
  ["Projector film", "projectorFilmFx"],
  ["Glitch", "glitch"],
  ["Asset overlay", "assetOverlayFx"],
  ["Text overlay", "textOverlayEnabled"],
];

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
type UIState = { viewSettingsOpen: boolean; activeTab: string; fxShowAll: boolean };
const loadUI = (): UIState => {
  const fallback: UIState = { viewSettingsOpen: true, activeTab: "view", fxShowAll: false };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(UI_KEY);
    if (raw) {
      const stored = { ...fallback, ...JSON.parse(raw) } as UIState;
      // Older sessions stored "" for "no section open"; the panel now always has one.
      return PANEL_TABS.some((t) => t.id === stored.activeTab)
        ? stored
        : { ...stored, activeTab: "view" };
    }
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
  // Whether the settings panel is open. One panel holds every section
  // (View, Effects, Scene, Audio, Presets, MIDI), docked to the right edge and
  // narrow enough that the scene stays visible beside it.
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
  const standaloneRef = React.useRef(standalone);
  standaloneRef.current = standalone;
  const [liveTempo, setLiveTempo] = useState<LiveTempoState>(EMPTY_LIVE_TEMPO);
  const [query, setQuery] = useState("");
  const [matchCount, setMatchCount] = useState(-1);
  const searching = query.trim().length > 0;
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
    setQuery("");
  };
  React.useEffect(() => {
    if (!ui.activeTab) {
      blurFlyoutFocus();
    }
  }, [ui.activeTab]);
  React.useEffect(() => {
    if (!standalone) {
      setFlyoutVisible(false);
      return;
    }
    const id = window.setTimeout(() => setFlyoutVisible(true), 30);
    return () => window.clearTimeout(id);
  }, [standalone]);
  // Broadcast open state so the shortcut bar can get out of the way — the
  // drawer/pop-outs cover a lot of screen and overlapping windows read as
  // clutter.
  React.useEffect(() => {
    window.dispatchEvent(
      new CustomEvent(SETTINGS_PANEL_STATE_EVENT, { detail: { open: standalone } }),
    );
  }, [standalone]);
  // Filter the open section to controls whose label matches the query. Done
  // on the rendered panel rather than in each control, so it also reaches
  // controls drawn by child components. A control stays visible when it
  // matches, contains a match, or sits inside one.
  // Runs after every render on purpose: any settings change can add or remove
  // controls. The state update inside is guarded, so it settles.
  const wasFilteringRef = React.useRef(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useLayoutEffect(() => {
    const panel = flyoutPanelRef.current;
    if (!panel) return;
    const q = query.trim().toLowerCase();
    // With no query, and nothing left hidden by an earlier one, there is
    // nothing to do. This is the common case and the panel re-renders often.
    if (!q && !wasFilteringRef.current) return;
    wasFilteringRef.current = Boolean(q);
    const nodes = Array.from(panel.querySelectorAll<HTMLElement>("[data-ctl]"));
    // Help paragraphs belong to controls that may be hidden; drop them while filtering.
    const notes = Array.from(panel.querySelectorAll<HTMLElement>("p:not([data-keep])"));
    // Start every pass from a clean panel, so a narrower or different query
    // never inherits what the last one hid.
    for (const node of Array.from(panel.querySelectorAll<HTMLElement>("[data-filtered]"))) {
      node.style.display = "";
      delete node.dataset.filtered;
      delete node.dataset.loose;
    }
    if (!q) {
      if (matchCount !== -1) setMatchCount(-1);
      return;
    }
    const matches = nodes.filter((node) => (node.dataset.ctl ?? "").toLowerCase().includes(q));
    for (const node of nodes) {
      const show = matches.some((m) => m === node || node.contains(m) || m.contains(node));
      node.style.display = show ? "" : "none";
      node.dataset.filtered = "1";
    }
    for (const note of notes) {
      note.style.display = "none";
      note.dataset.filtered = "1";
    }
    // Switch rows that are not built from the shared primitives: a label
    // beside a switch. They are matched on the label's own text.
    let looseMatches = 0;
    for (const label of Array.from(panel.querySelectorAll<HTMLElement>("label"))) {
      const text = (label.textContent ?? "").trim().toLowerCase();
      const owner = label.closest<HTMLElement>("[data-ctl]");
      if (owner && text.startsWith((owner.dataset.ctl ?? "").toLowerCase())) continue;
      const row = label.closest<HTMLElement>("div.flex") ?? label.parentElement;
      if (!row || row.dataset.ctl !== undefined) continue;
      const show = text.includes(q) || Boolean(owner && matches.includes(owner));
      if (show && text.includes(q)) looseMatches += 1;
      row.style.display = show ? "" : "none";
      row.dataset.filtered = "1";
      row.dataset.loose = show ? "shown" : "hidden";
    }
    // Whatever else sits directly in a section (button rows, notes, add
    // lists) goes unless it holds something that matched.
    for (const section of Array.from(panel.querySelectorAll<HTMLElement>("[data-section]"))) {
      for (const child of Array.from(section.children) as HTMLElement[]) {
        if (child.dataset.ctl !== undefined || child.dataset.loose) continue;
        const holdsMatch =
          matches.some((m) => child.contains(m)) ||
          child.querySelector("[data-loose='shown']") !== null;
        if (holdsMatch) continue;
        child.style.display = "none";
        child.dataset.filtered = "1";
      }
    }
    const total = matches.length + looseMatches;
    if (matchCount !== total) setMatchCount(total);
  });
  const set = (patch: Partial<Settings>) => settingsStore.set(patch);
  const activeTextSource =
    TEXT_SOURCES.find((source) => source.id === s.textOverlaySource) ?? TEXT_SOURCES[0];
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
  // The current view's settings that are off their defaults: every control
  // shown for the view (each carries its setting key), plus settings named
  // after the view, which covers controls folded away under "More controls".
  // The 2D switch is a mode, not a tuning value, so it is left out.
  const viewSettingsRef = React.useRef<HTMLDivElement | null>(null);
  const [shownViewKeys, setShownViewKeys] = useState<string>("");
  // Runs after every render: the controls shown depend on the view and on
  // what is folded open. The update is guarded, so it settles.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useLayoutEffect(() => {
    const keys = Array.from(
      viewSettingsRef.current?.querySelectorAll<HTMLElement>("[data-k]") ?? [],
      (node) => node.dataset.k ?? "",
    )
      .filter(Boolean)
      .sort()
      .join(",");
    if (keys !== shownViewKeys) setShownViewKeys(keys);
  });
  const viewKeys = new Set<string>([
    ...shownViewKeys.split(",").filter(Boolean),
    ...Object.keys(DEFAULT_SETTINGS).filter((key) => key.startsWith(s.view)),
  ]);
  const changedViewKeys = ([...viewKeys] as (keyof Settings)[]).filter(
    (key) =>
      key !== fullscreenKey && JSON.stringify(s[key]) !== JSON.stringify(DEFAULT_SETTINGS[key]),
  );
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
    // A plain event toggles the panel on its last section; a `tab` detail
    // opens that section.
    const onToggleSettingsPanel = (event: Event) => {
      const detail = (event as CustomEvent<{ tab?: string; open?: boolean } | undefined>).detail;
      const tab = PANEL_TABS.some((t) => t.id === detail?.tab) ? detail!.tab! : null;
      if (!tab) {
        // Plain toggle: reopen on whichever section was last in use.
        setStandalone((value) => !value);
        return;
      }
      // Asking for the section that is already showing closes the panel,
      // unless the caller wants it open regardless (the command palette).
      if (standaloneRef.current && uiRef.current.activeTab === tab && !detail?.open) {
        setStandalone(false);
        return;
      }
      updateUi({ activeTab: tab });
      setStandalone(true);
    };
    // The search palette hands a query over when it has no direct match.
    const onFilterSettings = (event: Event) => {
      setQuery(String((event as CustomEvent<string>).detail ?? ""));
      setStandalone(true);
    };
    window.addEventListener(TOGGLE_SETTINGS_PANEL_EVENT, onToggleSettingsPanel);
    window.addEventListener(FILTER_SETTINGS_EVENT, onFilterSettings);
    return () => {
      window.removeEventListener(TOGGLE_SETTINGS_PANEL_EVENT, onToggleSettingsPanel);
      window.removeEventListener(FILTER_SETTINGS_EVENT, onFilterSettings);
    };
  }, []);

  // Escape closes panels progressively: an open flyout/pop-out first, then
  // the drawer on the next press. (Radix only handles Esc while focus is
  // inside the sheet; this covers pop-outs and unfocused states.)
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (standaloneRef.current) closeFlyout();
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
      <>
        {standalone && (
          <>
            {/* Tab strip — vertical rail beside the sheet on desktop, bottom bar on mobile */}
            <div
              data-analyser-flyout
              className={
                (isMobile
                  ? "fixed inset-x-0 bottom-0 z-[110] flex flex-row gap-1 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] "
                  : "fixed right-[min(460px,calc(100vw-48px))] top-1/2 z-[95] -translate-y-1/2 flex flex-col gap-1 ") +
                "transition-all duration-[220ms] ease-out " +
                (flyoutVisible
                  ? "translate-x-0 opacity-100"
                  : (isMobile ? "translate-y-4" : "translate-x-4") +
                    " opacity-0 pointer-events-none")
              }
            >
              {PANEL_TABS.map((t) => {
                // A filter spans every section, so none is "the" open one.
                const active = !searching && ui.activeTab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      // Picking a section also leaves a filter that spans all of them.
                      setQuery("");
                      updateUi({ activeTab: t.id });
                    }}
                    className={
                      (isMobile
                        ? "flex-1 h-11 rounded-md border backdrop-blur-xl transition-all flex items-center justify-center "
                        : "group h-20 w-9 rounded-l-md border border-r-0 backdrop-blur-xl transition-all flex items-center justify-center ") +
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
                  : "right-0 top-0 z-[90] h-screen w-[min(460px,calc(100vw-48px))] border-l border-white/10 ") +
                "transition-all duration-300 ease-out " +
                (ui.activeTab && flyoutVisible
                  ? "translate-x-0 translate-y-0 opacity-100"
                  : (isMobile ? "translate-y-6" : "translate-x-[calc(100%+80px)]") +
                    " opacity-0 pointer-events-none")
              }
            >
              <PanelFilterContext.Provider
                value={{
                  searching,
                  activeOnly: !searching && ui.activeTab === "post" && !ui.fxShowAll,
                  inEffectSection: false,
                }}
              >
                <div className={`@container p-4 space-y-4 ${isMobile ? "pb-24" : "pb-12"}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-white/70">
                      {searching
                        ? "All settings"
                        : (PANEL_TABS.find((t) => t.id === ui.activeTab)?.label ?? "")}
                    </span>
                    <button
                      onClick={closeFlyout}
                      className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/50 hover:text-white"
                    >
                      close · Esc
                    </button>
                  </div>
                  <div className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1.5">
                    <Search className="h-3.5 w-3.5 shrink-0 text-white/35" />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape" && query) {
                          setQuery("");
                          e.preventDefault();
                          e.stopPropagation();
                        }
                      }}
                      placeholder="Filter settings"
                      aria-label="Filter settings"
                      className="w-full bg-transparent font-mono text-[11px] text-white outline-none placeholder:text-white/30"
                    />
                    <button
                      type="button"
                      onClick={() => runAction("palette")}
                      title="Search views, presets, effects and actions everywhere"
                      className="shrink-0 rounded border border-white/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-white/45 hover:text-white"
                    >
                      all · {capFor("palette")}
                    </button>
                  </div>
                  {searching && matchCount === 0 && (
                    <p data-keep className="px-1 font-mono text-[10px] text-white/45">
                      No setting matches. Press {capFor("palette")} to search everywhere.
                    </p>
                  )}

                  {(searching || ui.activeTab === "view") && (
                    <div data-section className="space-y-4">
                      <Row label="View">
                        <div className="grid grid-cols-3 gap-1.5">
                          {viewOptions.map((v) => (
                            <Bn
                              key={v.id}
                              active={s.view === v.id}
                              onClick={() => set({ view: v.id })}
                            >
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
                              <Bn
                                variant="primary"
                                onClick={requestWebXrToggle}
                                disabled={xrState.pending}
                              >
                                Enter VR
                              </Bn>
                            </div>
                            <div className="mt-2 rounded-md border border-white/10 bg-black/20 px-3 py-2 text-[10px] text-white/55">
                              Passthrough is not supported by Quest Browser in immersive-vr, so
                              transparent background has no visible effect here.
                            </div>
                            {xrState.error && (
                              <div className="mt-2 text-[10px] text-rose-300/80">
                                {xrState.error}
                              </div>
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
                            <div ref={viewSettingsRef}>
                              <ViewSettings s={s} set={set} />
                            </div>
                          )}
                          {viewSettingsOpen && changedViewKeys.length > 0 && (
                            <div className="border-t border-white/10 p-3">
                              <Bn
                                variant="ghost"
                                onClick={() =>
                                  set(
                                    Object.fromEntries(
                                      changedViewKeys.map((key) => [key, DEFAULT_SETTINGS[key]]),
                                    ) as Partial<Settings>,
                                  )
                                }
                              >
                                Reset this view ({changedViewKeys.length} changed)
                              </Bn>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {(searching || ui.activeTab === "audio") && (
                    <div data-section className="space-y-4">
                      <div
                        className="space-y-3 rounded-md border border-white/10 bg-white/[0.02] p-3"
                        data-ctl="Reactivity"
                      >
                        <div>
                          <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/60">
                            Reactivity
                          </Label>
                          <p className="mt-1 font-mono text-[9px] leading-relaxed text-white/35">
                            Four controls decide how much the picture moves. Start with Response;
                            the others fix a specific problem. Each view also has its own amount,
                            under View.
                          </p>
                        </div>
                        <S
                          label="Response (overall strength)"
                          value={s.visualResponse}
                          min={VISUAL_RESPONSE.min}
                          max={VISUAL_RESPONSE.max}
                          step={0.05}
                          onChange={(v) => set({ visualResponse: v })}
                          k="visualResponse"
                        />
                        <p className="font-mono text-[9px] leading-relaxed text-white/35">
                          The Calm–Punchy control on screen ({capFor("responseDown")} and{" "}
                          {capFor("responseUp")}).
                        </p>
                        <S
                          label="Dynamic contrast (even out loud tracks)"
                          value={s.dynamicContrast}
                          min={0}
                          max={1}
                          step={0.05}
                          onChange={(v) => set({ dynamicContrast: v })}
                          k="dynamicContrast"
                        />
                        <p className="font-mono text-[9px] leading-relaxed text-white/35">
                          Shows each band against its own recent range, so hits read as full height
                          on loud, compressed music. 0 shows raw levels.
                        </p>
                        <S
                          label="Input gain (quiet microphone)"
                          value={s.gain}
                          min={0}
                          max={4}
                          step={0.05}
                          onChange={(v) => set({ gain: v })}
                          k="gain"
                        />
                        <S
                          label="Beat sensitivity (what counts as a hit)"
                          value={s.beatSensitivity}
                          min={1}
                          max={3}
                          step={0.05}
                          onChange={(v) => set({ beatSensitivity: v })}
                          k="beatSensitivity"
                        />
                      </div>
                      <Row label="Input">
                        <div className="flex flex-wrap gap-1.5">
                          <Bn onClick={() => runAction("inputSource")}>
                            Change input source · {capFor("inputSource")}
                          </Bn>
                          <Bn onClick={() => updateUi({ activeTab: "midi" })}>MIDI</Bn>
                        </div>
                      </Row>
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
                          k="smoothing"
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
                        label={`Tempo and bar display · ${capFor("bpmGrid")}`}
                        enabled={s.showBPM}
                        onToggle={(v) => set({ showBPM: v })}
                      />
                      <p className="font-mono text-[9px] leading-relaxed text-white/35">
                        Tap <span className="text-white/50">{capFor("tapBeat")}</span> on beats and{" "}
                        <span className="text-white/50">{capFor("tapDownbeat")}</span> on bar 1 if
                        the tempo has not locked.
                      </p>
                      {s.showBPM && <TempoReadout variant="panel" tempo={liveTempo} />}
                      <ToggleRow
                        label={`Latency display · ${capFor("latency")}`}
                        enabled={s.showLatency}
                        onToggle={(v) => set({ showLatency: v })}
                      />
                    </div>
                  )}

                  {ui.activeTab === "midi" && <MidiPanel midi={midi} />}

                  {(searching || ui.activeTab === "scene") && (
                    <div data-section className="space-y-4">
                      <Row label="Motion & auto-pilot">
                        <ToggleRow
                          label={`Cycle views with the music · ${capFor("viewCycle")}`}
                          enabled={s.viewCycleMode}
                          onToggle={(v) => set({ viewCycleMode: v })}
                        >
                          <p className="font-mono text-[9px] leading-relaxed text-white/35">
                            Switches to another view every four bars.
                          </p>
                          {/* Only means anything while cycling, so it lives inside it. */}
                          <div className="flex items-center justify-between">
                            <Label className="text-[11px]">
                              Also randomize effects on each switch
                            </Label>
                            <Sw
                              checked={s.viewCycleRandomize}
                              onCheckedChange={(v) => set({ viewCycleRandomize: v })}
                              k="viewCycleRandomize"
                            />
                          </div>
                        </ToggleRow>
                        <ToggleRow
                          label={`Dynamic mode · ${capFor("dynamicMode")}`}
                          enabled={s.evolveEnabled}
                          onToggle={(v) => set({ evolveEnabled: v })}
                        >
                          <S
                            label="Amount"
                            value={s.evolveAmount}
                            min={0}
                            max={1}
                            step={0.05}
                            onChange={(v) => set({ evolveAmount: v })}
                            k="evolveAmount"
                          />
                          <p className="font-mono text-[9px] leading-relaxed text-white/35">
                            Follows the music&apos;s structure. A drop triggers a new camera angle,
                            a post-FX hit and a shift in the view&apos;s settings; a breakdown pulls
                            back and calms. The camera keeps turning and re-frames every four bars,
                            and the view grows and shrinks with the track&apos;s energy. At 0.5 and
                            above the palette also steps on each drop. Everything is an offset
                            around your own values — turn off to return to exactly what you set.
                            Unlike view cycle, the view itself never changes.
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
                      <S
                        label="Scene backdrop"
                        value={s.backdropAmount}
                        min={0}
                        max={1.5}
                        step={0.05}
                        onChange={(v) => set({ backdropAmount: v })}
                        k="backdropAmount"
                      />
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
                          k="cameraDriftAmount"
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
                          k="cameraBeatAmount"
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

                  {(searching || ui.activeTab === "post") && (
                    <div data-section className="space-y-3">
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
                        label="All effects"
                        enabled={s.postFxEnabled}
                        onToggle={(v) => set({ postFxEnabled: v })}
                      />
                      <div className="flex items-center justify-between rounded-md border border-white/10 bg-white/[0.02] px-3 py-2.5">
                        <div>
                          <Label className="text-[11px]">Show every effect</Label>
                          <div className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-white/35">
                            off = only the effects that are on
                          </div>
                        </div>
                        <Sw
                          checked={ui.fxShowAll}
                          onCheckedChange={(v) => updateUi({ fxShowAll: v })}
                        />
                      </div>
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
                          k="randomizeViewSettings"
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
                        saves, or view cycling — until you unpin. saved presets live under Presets.
                      </p>
                      <div className="grid grid-cols-1 items-start gap-3 @[540px]:grid-cols-2">
                        <FxSection
                          id="glow"
                          label="Glow · Colour · Tone"
                          pinned={pinnedIn(["bloom", "chroma", "grain", "vignette", "grading"])}
                          count={
                            [s.bloom, s.chroma, s.grain, s.vignette, s.grading].filter(Boolean)
                              .length
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
                                  Strength above {BLOOM_STRENGTH_MAX_NORMAL.toFixed(1)} (very
                                  bright)
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
                              k="bloomStrength"
                            />
                            <S
                              label="Radius"
                              value={s.bloomRadius}
                              min={0}
                              max={1.5}
                              step={0.05}
                              onChange={(v) => set({ bloomRadius: v })}
                              k="bloomRadius"
                            />
                            <S
                              label="Threshold"
                              value={s.bloomThreshold}
                              min={0}
                              max={1}
                              step={0.01}
                              onChange={(v) => set({ bloomThreshold: v })}
                              k="bloomThreshold"
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
                              k="chromaAmount"
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
                              k="grainAmount"
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
                              k="vignetteAmount"
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
                              k="exposure"
                            />
                            <S
                              label="Contrast"
                              value={s.contrast}
                              min={0.5}
                              max={2}
                              step={0.05}
                              onChange={(v) => set({ contrast: v })}
                              k="contrast"
                            />
                            <S
                              label="Saturation"
                              value={s.saturation}
                              min={0}
                              max={2}
                              step={0.05}
                              onChange={(v) => set({ saturation: v })}
                              k="saturation"
                            />
                            <S
                              label="Hue"
                              value={s.hue}
                              min={-0.5}
                              max={0.5}
                              step={0.01}
                              onChange={(v) => set({ hue: v })}
                              k="hue"
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
                            [s.dof, s.motionTrails, s.radialBlur, s.tiltShift, s.ssao].filter(
                              Boolean,
                            ).length
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
                              k="dofFocus"
                            />
                            <S
                              label="Aperture"
                              value={s.dofAperture}
                              min={0}
                              max={0.005}
                              step={0.0001}
                              onChange={(v) => set({ dofAperture: v })}
                              k="dofAperture"
                            />
                            <S
                              label="Max blur"
                              value={s.dofMaxBlur}
                              min={0}
                              max={0.05}
                              step={0.001}
                              onChange={(v) => set({ dofMaxBlur: v })}
                              k="dofMaxBlur"
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
                              k="trailDecay"
                            />
                            <S
                              label="Inject"
                              value={s.trailInject}
                              min={0.5}
                              max={2.25}
                              step={0.05}
                              onChange={(v) => set({ trailInject: v })}
                              k="trailInject"
                            />
                            <S
                              label="Threshold"
                              value={s.trailThreshold}
                              min={0}
                              max={1}
                              step={0.01}
                              onChange={(v) => set({ trailThreshold: v })}
                              k="trailThreshold"
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
                              k="radialBase"
                            />
                            <S
                              label="Kick amount"
                              value={s.radialKickAmount}
                              min={0}
                              max={2}
                              step={0.05}
                              onChange={(v) => set({ radialKickAmount: v })}
                              k="radialKickAmount"
                            />
                            <S
                              label="Zoom"
                              value={s.radialZoom}
                              min={0.05}
                              max={1.2}
                              step={0.05}
                              onChange={(v) => set({ radialZoom: v })}
                              k="radialZoom"
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
                              k="tiltAmount"
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
                              k="ssaoRadius"
                            />
                            <S
                              label="Distance"
                              value={s.ssaoDistance}
                              min={0.01}
                              max={0.2}
                              step={0.005}
                              onChange={(v) => set({ ssaoDistance: v })}
                              k="ssaoDistance"
                            />
                            <S
                              label="Intensity"
                              value={s.ssaoIntensity}
                              min={0}
                              max={1}
                              step={0.05}
                              onChange={(v) => set({ ssaoIntensity: v })}
                              k="ssaoIntensity"
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
                              k="godRaysAmount"
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
                              k="lensFlareAmount"
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
                              k="kaleidoscopeSides"
                            />
                            <S
                              label="Angle"
                              value={s.kaleidoscopeAngle}
                              min={-3.14}
                              max={3.14}
                              step={0.01}
                              onChange={(v) => set({ kaleidoscopeAngle: v })}
                              k="kaleidoscopeAngle"
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
                              k="mirrorOffset"
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
                              k="pixelSize"
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
                              k="sobelStrength"
                            />
                            <S
                              label="Threshold"
                              value={s.sobelThreshold}
                              min={0.01}
                              max={1}
                              step={0.01}
                              onChange={(v) => set({ sobelThreshold: v })}
                              k="sobelThreshold"
                            />
                            <S
                              label="Fill mix"
                              value={s.sobelFillMix}
                              min={0}
                              max={1}
                              step={0.01}
                              onChange={(v) => set({ sobelFillMix: v })}
                              k="sobelFillMix"
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
                              k="retroDither"
                            />
                            <Row label="Hardware border">
                              <Sw
                                checked={s.retroBorder}
                                onCheckedChange={(v) => set({ retroBorder: v })}
                                k="retroBorder"
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
                              k="asciiCellSize"
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
                              k="crtScanlineIntensity"
                            />
                            <S
                              label="Curvature"
                              value={s.crtCurvature}
                              min={0}
                              max={0.1}
                              step={0.01}
                              onChange={(v) => set({ crtCurvature: v })}
                              k="crtCurvature"
                            />
                            <S
                              label="Vignette"
                              value={s.crtVignette}
                              min={0}
                              max={1}
                              step={0.01}
                              onChange={(v) => set({ crtVignette: v })}
                              k="crtVignette"
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
                              k="projectorFilmAmount"
                            />
                            <S
                              label="Frame jitter"
                              value={s.projectorFilmJitter}
                              min={0}
                              max={1}
                              step={0.01}
                              onChange={(v) => set({ projectorFilmJitter: v })}
                              k="projectorFilmJitter"
                            />
                            <S
                              label="Lamp flicker"
                              value={s.projectorFilmFlicker}
                              min={0}
                              max={1}
                              step={0.01}
                              onChange={(v) => set({ projectorFilmFlicker: v })}
                              k="projectorFilmFlicker"
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
                              k="glitchIntensity"
                            />
                            <div className="flex items-center justify-between">
                              <Label className="text-xs">Wild mode</Label>
                              <Sw
                                checked={s.glitchWild}
                                onCheckedChange={(v) => set({ glitchWild: v })}
                                k="glitchWild"
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
                              k="assetOverlayAmount"
                            />
                            <S
                              label="Scroll speed"
                              value={s.assetOverlaySpeed}
                              min={0.1}
                              max={3}
                              step={0.05}
                              onChange={(v) => set({ assetOverlaySpeed: v })}
                              k="assetOverlaySpeed"
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
                                k="assetOverlayLocalPack"
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
                                k="assetOverlayCommonsEnabled"
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
                                Wikimedia Commons is optional and only loads when enabled — the
                                topic picks what it searches for (pattern art, circuit diagrams, or
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
                            <div>
                              <Label className="text-[11px]">Text source</Label>
                              <div className="mt-1.5 grid grid-cols-2 gap-2">
                                {TEXT_SOURCES.map((source) => (
                                  <Bn
                                    key={source.id}
                                    active={s.textOverlaySource === source.id}
                                    variant={
                                      s.textOverlaySource === source.id ? "default" : "outline"
                                    }
                                    onClick={() => set({ textOverlaySource: source.id })}
                                  >
                                    {source.label}
                                  </Bn>
                                ))}
                              </div>
                              <p className="mt-2 text-[10px] leading-relaxed text-white/60">
                                {activeTextSource.description}{" "}
                                <span className="text-white/40">
                                  {activeTextSource.network
                                    ? "Needs a network connection; bundled lines are used offline."
                                    : "Works offline."}
                                </span>
                              </p>
                              {s.textOverlaySource === "custom" && (
                                <textarea
                                  data-ui-control
                                  value={s.textOverlayCustomText}
                                  onChange={(e) => set({ textOverlayCustomText: e.target.value })}
                                  onKeyDown={(e) => e.stopPropagation()}
                                  rows={4}
                                  spellCheck={false}
                                  placeholder="One phrase per line"
                                  aria-label="Your overlay text, one phrase per line"
                                  className="mt-2 w-full resize-y rounded-md border border-white/10 bg-black/40 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-white/85 placeholder:text-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70"
                                />
                              )}
                            </div>
                            <div>
                              <Label className="text-[11px]">Whole-phrase styles</Label>
                              <div className="mt-1.5 grid grid-cols-2 gap-2">
                                {TEXT_STYLES.filter((style) => !style.perCharacter).map((style) => (
                                  <Bn
                                    key={style.id}
                                    active={s.textOverlayStyle === style.id}
                                    variant={
                                      s.textOverlayStyle === style.id ? "default" : "outline"
                                    }
                                    onClick={() => set({ textOverlayStyle: style.id })}
                                  >
                                    {style.label}
                                  </Bn>
                                ))}
                              </div>
                            </div>
                            <div>
                              <Label className="text-[11px]">Per-character styles</Label>
                              <div className="mt-1.5 grid grid-cols-2 gap-2">
                                {TEXT_STYLES.filter((style) => style.perCharacter).map((style) => (
                                  <Bn
                                    key={style.id}
                                    active={s.textOverlayStyle === style.id}
                                    variant={
                                      s.textOverlayStyle === style.id ? "default" : "outline"
                                    }
                                    onClick={() => set({ textOverlayStyle: style.id })}
                                  >
                                    {style.label}
                                  </Bn>
                                ))}
                              </div>
                            </div>
                            <S
                              label="Intensity"
                              value={s.textOverlayIntensity}
                              min={0}
                              max={2}
                              step={0.05}
                              onChange={(v) => set({ textOverlayIntensity: v })}
                              k="textOverlayIntensity"
                            />
                            <S
                              label="Phrase interval (sec)"
                              value={s.textOverlayPhraseInterval}
                              min={3}
                              max={20}
                              step={0.5}
                              onChange={(v) => set({ textOverlayPhraseInterval: v })}
                              k="textOverlayPhraseInterval"
                            />
                            <div className="flex items-center justify-between">
                              <Label className="text-[11px]">All caps</Label>
                              <Sw
                                checked={s.textOverlayAllCaps}
                                onCheckedChange={(v) => set({ textOverlayAllCaps: v })}
                                k="textOverlayAllCaps"
                              />
                            </div>
                            <div className="flex items-center justify-between">
                              <Label className="text-[11px]">Scramble in/out</Label>
                              <Sw
                                checked={s.textOverlayScramble}
                                onCheckedChange={(v) => set({ textOverlayScramble: v })}
                                k="textOverlayScramble"
                              />
                            </div>
                            <p className="text-[10px] leading-relaxed text-white/45">
                              Scramble applies to the whole-phrase styles. Credit for the phrase on
                              screen is shown in Stats for nerds.
                            </p>
                          </ToggleRow>
                        </FxSection>
                      </div>
                      {!ui.fxShowAll && !searching && (
                        <div className="space-y-2 rounded-md border border-dashed border-white/15 p-3">
                          <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">
                            Add an effect
                          </Label>
                          <div className="flex flex-wrap gap-1.5">
                            {EFFECT_ROWS.filter(([, key]) => !s[key]).map(([label, key]) => (
                              <Bn
                                key={key}
                                variant="ghost"
                                onClick={() => set({ [key]: true } as Partial<Settings>)}
                              >
                                + {label}
                              </Bn>
                            ))}
                          </div>
                        </div>
                      )}
                      <Disclosure label="Pipeline order">
                        <p className="px-1 font-mono text-[9px] leading-relaxed text-white/35">
                          Passes run top to bottom; the scene render, SSAO, and motion trails always
                          run first. Order changes the look — try CRT after Retro system for
                          scanlines over the emulated screen, or Bloom after Pixelate for a glow per
                          fat pixel.
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

                  {(searching || ui.activeTab === "saves") && (
                    <div data-section className="space-y-3">
                      <p className="px-1 font-mono text-[9px] leading-relaxed text-white/35">
                        A preset is a view together with its effects and feel. Click one to switch
                        to it.
                      </p>
                      <Bn
                        variant="primary"
                        onClick={() => preset.saveNew()}
                        disabled={!preset.canSaveNew}
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" />{" "}
                        {preset.canSaveNew
                          ? "Save what's on screen as a new preset"
                          : "This preset is saved"}
                      </Bn>
                      <Row
                        label={`${preset.slots.length} preset${preset.slots.length === 1 ? "" : "s"}`}
                      >
                        {preset.hasPresets ? (
                          <div className="grid grid-cols-2 gap-2">
                            {preset.slots.map((slot, index) => {
                              const isCurrent = index === preset.currentSaveIndex;
                              return (
                                <div
                                  key={`${slot.name}-${index}`}
                                  data-ctl={`${slot.name} ${describeSlot(slot)}`}
                                  className={`group/look relative overflow-hidden rounded-md border transition-colors ${
                                    isCurrent
                                      ? "border-emerald-300/60 shadow-[0_0_14px_rgba(52,211,153,0.25)]"
                                      : "border-white/10 hover:border-white/30"
                                  }`}
                                >
                                  <button
                                    type="button"
                                    onClick={() => preset.loadAt(index)}
                                    aria-label={`Switch to ${slot.name}`}
                                    aria-pressed={isCurrent}
                                    className="block w-full text-left"
                                  >
                                    {slot.thumb ? (
                                      <img
                                        src={slotThumbSrc(slot.thumb)}
                                        alt=""
                                        loading="lazy"
                                        className="aspect-video w-full object-cover"
                                      />
                                    ) : (
                                      <span
                                        aria-hidden
                                        className="flex aspect-video w-full items-center justify-center bg-gradient-to-br from-white/10 to-white/[0.02] font-mono text-[9px] uppercase tracking-wider text-white/25"
                                      >
                                        no picture yet
                                      </span>
                                    )}
                                    <span className="flex items-center gap-1.5 px-2 py-1.5">
                                      {index < 9 && (
                                        <kbd className="shrink-0 rounded border border-white/15 px-1 font-mono text-[9px] leading-4 text-white/45">
                                          {index + 1}
                                        </kbd>
                                      )}
                                      <span className="min-w-0 flex-1 truncate text-[11px] text-white/85">
                                        {slot.name}
                                      </span>
                                      {isCurrent && (
                                        <span className="shrink-0 font-mono text-[8px] uppercase tracking-wider text-emerald-300">
                                          on now
                                        </span>
                                      )}
                                    </span>
                                  </button>
                                  {/* Shown on hover or keyboard focus; always shown on touch, which has no hover. */}
                                  <div className="absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover/look:opacity-100 [@media(hover:none)]:opacity-100">
                                    {!isCurrent && (
                                      <button
                                        type="button"
                                        onClick={() => preset.saveAt(index, slot.name)}
                                        title={`Replace ${slot.name} with what's on screen`}
                                        aria-label={`Replace ${slot.name} with what's on screen`}
                                        className="rounded bg-black/70 p-1 text-white/70 hover:bg-black hover:text-white"
                                      >
                                        <Save className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => preset.deleteAt(index)}
                                      title={`Delete ${slot.name}`}
                                      aria-label={`Delete ${slot.name}`}
                                      className="rounded bg-black/70 p-1 text-white/70 hover:bg-red-500/80 hover:text-white"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="font-mono text-[9px] leading-relaxed text-white/35">
                            No presets yet. Save what's on screen above, or press{" "}
                            <span className="text-white/50">⇧1</span>–
                            <span className="text-white/50">⇧9</span> to save into a numbered slot.
                          </p>
                        )}
                      </Row>
                      <ToggleRow
                        label={
                          preset.slots.length < 2
                            ? "Play the presets in turn (needs at least two)"
                            : `Play the presets in turn · ${capFor("playLooks")}`
                        }
                        disabled={!s.slotCycleMode && preset.slots.length < 2}
                        enabled={s.slotCycleMode}
                        onToggle={(v) => set({ slotCycleMode: v })}
                      >
                        <S
                          label="Seconds per preset"
                          value={s.slotCycleSeconds}
                          min={10}
                          max={120}
                          step={1}
                          onChange={(v) => set({ slotCycleSeconds: v })}
                          k="slotCycleSeconds"
                        />
                        <p className="font-mono text-[9px] leading-relaxed text-white/35">
                          Starts from the first preset, then moves down the list.
                        </p>
                      </ToggleRow>
                    </div>
                  )}
                </div>
              </PanelFilterContext.Provider>
            </div>
          </>
        )}
      </>
    </>
  );
}
