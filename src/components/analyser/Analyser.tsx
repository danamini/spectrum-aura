import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Scene } from "./engine/scene";
import { Composer } from "./engine/composer";
import { AudioEngine } from "./engine/audio";
import { PALETTES, settingsStore, SLOT_COUNT, useSettings, type ViewMode } from "./store";
import { Button } from "@/components/ui/button";
import { Activity, Maximize2, Mic, Minimize2, MonitorSpeaker, Power, X } from "lucide-react";

type NerdStats = {
  fps: number;
  frameMs: number;
  updates: number;
  uptimeSec: number;
  fpsHistory: number[];
  drawCalls: number;
  drawCallsHistory: number[];
  triangles: number;
  trianglesHistory: number[];
  lines: number;
  points: number;
  geometries: number;
  textures: number;
  programs: number;
  objects: number;
  pixelRatio: number;
  bufferWidth: number;
  bufferHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  heapMb: number;
  audioRunning: boolean;
  sampleRate: number;
  fftSize: number;
  smoothing: number;
  gain: number;
  bass: number;
  bassHistory: number[];
  mid: number;
  midHistory: number[];
  high: number;
  highHistory: number[];
  centroid: number;
  beat: boolean;
  bpm: number;
  bpmConfidence: number;
};

const EMPTY_STATS: NerdStats = {
  fps: 0,
  frameMs: 0,
  updates: 0,
  uptimeSec: 0,
  fpsHistory: [],
  drawCalls: 0,
  drawCallsHistory: [],
  triangles: 0,
  trianglesHistory: [],
  lines: 0,
  points: 0,
  geometries: 0,
  textures: 0,
  programs: 0,
  objects: 0,
  pixelRatio: 0,
  bufferWidth: 0,
  bufferHeight: 0,
  canvasWidth: 0,
  canvasHeight: 0,
  heapMb: 0,
  audioRunning: false,
  sampleRate: 0,
  fftSize: 0,
  smoothing: 0,
  gain: 0,
  bass: 0,
  bassHistory: [],
  mid: 0,
  midHistory: [],
  high: 0,
  highHistory: [],
  centroid: 0,
  beat: false,
  bpm: 0,
  bpmConfidence: 0,
};

const TOGGLE_STATS_PANEL_EVENT = "spectrum-aura:toggle-stats-panel";

export function Analyser() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<AudioEngine | null>(null);
  const settings = useSettings();
  const [audioStatus, setAudioStatus] = useState<"idle" | "running" | "error">("idle");
  const [audioError, setAudioError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [statsFullscreen, setStatsFullscreen] = useState(false);
  const [stats, setStats] = useState<NerdStats>(EMPTY_STATS);
  const [liveTempo, setLiveTempo] = useState({ beat: false, bpm: 0, bpmConfidence: 0 });
  const statsOpenRef = useRef(false);

  useEffect(() => {
    statsOpenRef.current = statsOpen;
  }, [statsOpen]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const toggleStatsPanel = () => {
    setStatsOpen((v) => {
      const next = !v;
      if (!next) setStatsFullscreen(false);
      return next;
    });
  };
  const closeStatsPanel = () => {
    setStatsOpen(false);
    setStatsFullscreen(false);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (e.key.toLowerCase() !== "n") return;
      e.preventDefault();

      if (e.shiftKey) {
        setStatsOpen(true);
        setStatsFullscreen((v) => !v);
        return;
      }
      setStatsOpen((v) => {
        const next = !v;
        if (!next) setStatsFullscreen(false);
        return next;
      });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const onToggleStatsPanel = () => {
      toggleStatsPanel();
    };
    window.addEventListener(TOGGLE_STATS_PANEL_EVENT, onToggleStatsPanel);
    return () => window.removeEventListener(TOGGLE_STATS_PANEL_EVENT, onToggleStatsPanel);
  }, []);

  // engine refs
  const sceneRef = useRef<Scene | null>(null);
  const composerRef = useRef<Composer | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Rotate through saved preset slots 1→5 when cycle mode is on (skips empty slots).
  useEffect(() => {
    if (!settings.slotCycleMode) return;
    const SLOT_CYCLE_DWELL_MS = Math.max(1, settings.slotCycleSeconds) * 1000;

    const firstOccupied = (): number | null => {
      const list = settingsStore.getSlots();
      for (let i = 0; i < SLOT_COUNT; i++) if (list[i]) return i;
      return null;
    };

    const nextOccupied = (from: number): number | null => {
      const list = settingsStore.getSlots();
      for (let k = 1; k <= SLOT_COUNT; k++) {
        const i = (from + k) % SLOT_COUNT;
        if (list[i]) return i;
      }
      return null;
    };

    const start = firstOccupied();
    if (start === null) {
      settingsStore.set({ slotCycleMode: false });
      return;
    }

    let cursor = start;
    settingsStore.loadSlot(cursor);
    let lastSwitch = performance.now();

    const id = window.setInterval(() => {
      if (!settingsStore.get().slotCycleMode) return;
      if (performance.now() - lastSwitch < SLOT_CYCLE_DWELL_MS) return;

      const next = nextOccupied(cursor);
      if (next === null) {
        settingsStore.set({ slotCycleMode: false });
        window.clearInterval(id);
        return;
      }
      cursor = next;
      lastSwitch = performance.now();
      settingsStore.loadSlot(cursor);
    }, 350);

    return () => window.clearInterval(id);
  }, [settings.slotCycleMode, settings.slotCycleSeconds]);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: "high-performance",
    });
    renderer.info.autoReset = false;
    renderer.setPixelRatio(settingsRef.current.performance ? Math.min(window.devicePixelRatio, 0.85) : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(settingsRef.current.bgColor, 1);
    container.appendChild(renderer.domElement);

    const scene = new Scene(width, height);
    const composer = new Composer(renderer, scene.scene, scene.camera, width, height);
    rendererRef.current = renderer;
    sceneRef.current = scene;
    composerRef.current = composer;

    const audio = new AudioEngine();
    audioRef.current = audio;

    let raf = 0;
    let last = performance.now();
    const start = last;
    let smoothedFps = 60;
    let statsFrameCounter = 0;
    let statsUpdateCount = 0;
    const drawBufferSize = new THREE.Vector2();
    const fpsHistory: number[] = [];
    const drawCallsHistory: number[] = [];
    const trianglesHistory: number[] = [];
    const bassHistory: number[] = [];
    const midHistory: number[] = [];
    const highHistory: number[] = [];
    const pushHistory = (history: number[], value: number, max = 52) => {
      history.push(value);
      if (history.length > max) history.shift();
    };
    let lastBgColor = "";
    let lastOpacity = "";
    let lastStatsCommitAt = 0;
    let lastLiveTempoCommitAt = 0;

    const onResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      const ratio = settingsRef.current.performance ? Math.min(window.devicePixelRatio, 0.85) : Math.min(window.devicePixelRatio, 2);
      renderer.setPixelRatio(ratio);
      renderer.setSize(w, h);
      scene.resize(w, h);
      composer.resize(w, h);
    };
    window.addEventListener("resize", onResize);

    // mouse / pointer drag camera control (active when settings.cameraMouse)
    let dragging = false;
    let activePointerId: number | null = null;
    let lastX = 0, lastY = 0;
    const dom = renderer.domElement;
    dom.style.touchAction = "none";
    dom.style.display = "block";
    dom.style.width = "100%";
    dom.style.height = "100%";
    dom.style.transition = "none";

    const VIEW_FADE_OUT_SEC = 0.16;
    const VIEW_FADE_IN_SEC = 0.22;
    const smoothstep = (edge0: number, edge1: number, x: number) => {
      const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
      return t * t * (3 - 2 * t);
    };

    let displayedView: ViewMode = settingsRef.current.view;
    let viewTransition: { phase: "out" | "in"; elapsed: number } | null = null;
    container.style.touchAction = "none";
    const isInteractiveUiTarget = (target: EventTarget | null) => {
      const el = target instanceof Element ? target : null;
      return !!el?.closest(
        "button, [role='button'], input, textarea, select, a, [role='dialog'], [data-state='open']",
      );
    };
    const onPointerDown = (e: PointerEvent) => {
      if (!settingsRef.current.cameraMouse || isInteractiveUiTarget(e.target)) return;
      dragging = true;
      activePointerId = e.pointerId;
      lastX = e.clientX;
      lastY = e.clientY;
      container.setPointerCapture?.(e.pointerId);
      dom.style.cursor = "grabbing";
      e.preventDefault();
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging || (activePointerId !== null && e.pointerId !== activePointerId)) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      scene.setMouseDelta(dx, dy);
      e.preventDefault();
    };
    const onPointerUp = (e?: PointerEvent) => {
      if (!dragging) return;
      if (e && activePointerId !== null && e.pointerId !== activePointerId) return;
      if (e && activePointerId !== null) container.releasePointerCapture?.(activePointerId);
      dragging = false;
      activePointerId = null;
      dom.style.cursor = settingsRef.current.cameraMouse ? "grab" : "";
    };
    const onWheel = (e: WheelEvent) => {
      if (!settingsRef.current.cameraMouse) return;
      e.preventDefault();
      scene.setMouseZoomDelta(e.deltaY);
    };
    container.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    dom.addEventListener("wheel", onWheel, { passive: false });

    const loop = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const fps = dt > 0 ? 1 / dt : 0;
      smoothedFps = smoothedFps * 0.9 + fps * 0.1;
      const t = (now - start) / 1000;
      const s = settingsRef.current;

      if (s.bgColor !== lastBgColor) {
        renderer.setClearColor(s.bgColor, 1);
        lastBgColor = s.bgColor;
      }

      if (s.view !== displayedView) {
        if (viewTransition === null) {
          viewTransition = { phase: "out", elapsed: 0 };
        } else if (viewTransition.phase === "in") {
          viewTransition = { phase: "out", elapsed: 0 };
        }
      }

      let canvasOpacity = 1;
      if (viewTransition) {
        if (viewTransition.phase === "out") {
          viewTransition.elapsed += dt;
          canvasOpacity = 1 - smoothstep(0, VIEW_FADE_OUT_SEC, viewTransition.elapsed);
          if (viewTransition.elapsed >= VIEW_FADE_OUT_SEC) {
            displayedView = s.view;
            viewTransition = { phase: "in", elapsed: 0 };
            canvasOpacity = 0;
          }
        } else {
          viewTransition.elapsed += dt;
          canvasOpacity = smoothstep(0, VIEW_FADE_IN_SEC, viewTransition.elapsed);
          if (viewTransition.elapsed >= VIEW_FADE_IN_SEC) {
            displayedView = s.view;
            viewTransition = null;
            canvasOpacity = 1;
          }
        }
      }
      const nextOpacity = String(Math.max(0, Math.min(1, canvasOpacity)));
      if (nextOpacity !== lastOpacity) {
        dom.style.opacity = nextOpacity;
        lastOpacity = nextOpacity;
      }

      const bands = audio.read(s.beatSensitivity);
      if (now - lastLiveTempoCommitAt >= 120) {
        lastLiveTempoCommitAt = now;
        setLiveTempo({
          beat: bands.beat,
          bpm: Math.round(bands.bpm),
          bpmConfidence: bands.bpmConfidence,
        });
      }
      scene.setPalette(PALETTES[s.paletteIndex]?.colors ?? PALETTES[0].colors);
      scene.update(dt, t, bands, {
        view: displayedView,
        sphereDisp: s.sphereDisplacement,
        orbitSpeed: s.orbitSpeed,
        peakDecay: s.classicPeakDecay,
        peakHold: s.classicPeakHold,
        colorBands: s.classicColorBands,
        blocky: s.classicBlocky,
        segments: s.classicSegments,
        grid: s.classicGrid,
        gridOpacity: s.classicGridOpacity,
        cameraDrift: s.cameraDrift,
        cameraDriftAmount: s.cameraDriftAmount,
        cameraBeat: s.cameraBeat,
        cameraBeatAmount: s.cameraBeatAmount,
        cameraMouse: s.cameraMouse,
        classicSpin: s.classicSpin,
        classicSpinSpeed: s.classicSpinSpeed,
        classicWireframe: s.classicWireframe,
        classicFullscreen: s.classicFullscreen,
        peakColor: s.classicPeakColor,
        peakStyle: s.classicPeakStyle,
        rippleRingCount: s.rippleRingCount,
        rippleColumns: s.rippleColumns,
        rippleMaxRadius: s.rippleMaxRadius,
        rippleSpeed: s.rippleSpeed,
        rippleAmplitude: s.rippleAmplitude,
        rippleWaveCycles: s.rippleWaveCycles,
        rippleThickness: s.rippleThickness,
        rippleRotationSpeed: s.rippleRotationSpeed,
        rippleOpacity: s.rippleOpacity,
        rippleWireframe: s.rippleWireframe,
        datastreamUsePalette: s.datastreamUsePalette,
        datastreamAmplitude: s.datastreamAmplitude,
        datastreamItemCount: s.datastreamItemCount,
        nebulaUsePalette: s.nebulaUsePalette,
        nebulaAmplitude: s.nebulaAmplitude,
        nebulaDetail: s.nebulaDetail,
        nebulaWireframe: s.nebulaWireframe,
        monolithUsePalette: s.monolithUsePalette,
        monolithAmplitude: s.monolithAmplitude,
        monolithBrightness: s.monolithBrightness,
        monolithGridSize: s.monolithGridSize,
        monolithWireframe: s.monolithWireframe,
        mandalaUsePalette: s.mandalaUsePalette,
        mandalaAmplitude: s.mandalaAmplitude,
        mandalaLineCount: s.mandalaLineCount,
        mandalaLineWidth: s.mandalaLineWidth,
        terrainUsePalette: s.terrainUsePalette,
        terrainAmplitude: s.terrainAmplitude,
        terrainColumns: s.terrainColumns,
        terrainWireframe: s.terrainWireframe,
        rippleFullscreen: s.rippleFullscreen,
        datastreamFullscreen: s.datastreamFullscreen,
        nebulaFullscreen: s.nebulaFullscreen,
        monolithFullscreen: s.monolithFullscreen,
        mandalaFullscreen: s.mandalaFullscreen,
        terrainFullscreen: s.terrainFullscreen,
        obsidianFullscreen: s.obsidianFullscreen,
        obsidianUsePalette: s.obsidianUsePalette,
        obsidianAmplitude: s.obsidianAmplitude,
        obsidianShardDetail: s.obsidianShardDetail,
        torusFullscreen: s.torusFullscreen,
        torusUsePalette: s.torusUsePalette,
        torusAmplitude: s.torusAmplitude,
        torusParticleCount: s.torusParticleCount,
        torusSpeed: s.torusSpeed,
        torusCount: s.torusCount,
        torusSpacing: s.torusSpacing,
        torusSize: s.torusSize,
        torusParticleSize: s.torusParticleSize,
        torusColorMode: s.torusColorMode,
        torusRotationMode: s.torusRotationMode,
        torusOddUpright: s.torusOddUpright,
        soundwallFullscreen: s.soundwallFullscreen,
        soundwallUsePalette: s.soundwallUsePalette,
        soundwallAmplitude: s.soundwallAmplitude,
        soundwallColumns: s.soundwallColumns,
        soundwallRows: s.soundwallRows,
        geometrynebulaFullscreen: s.geometrynebulaFullscreen,
        geometrynebulaUsePalette: s.geometrynebulaUsePalette,
        geometrynebulaAmplitude: s.geometrynebulaAmplitude,
        geometrynebulaCount: s.geometrynebulaCount,
        geometrynebulaSpread: s.geometrynebulaSpread,
        geometrynebulaOrbitSpeed: s.geometrynebulaOrbitSpeed,
        geometrynebulaSpinSpeed: s.geometrynebulaSpinSpeed,
        comboSphereSize: s.comboSphereSize,
        comboSphereSpinSpeed: s.comboSphereSpinSpeed,
        comboSphereBassPunch: s.comboSphereBassPunch,
        comboBarRadius: s.comboBarRadius,
        comboBarHeightScale: s.comboBarHeightScale,
        comboParticleSize: s.comboParticleSize,
        comboLevelMeter: s.comboLevelMeter,
        comboWireframe: s.comboWireframe,
        comboFullscreen: s.comboFullscreen,
        bgColor: s.bgColor,
      });

      renderer.info.reset();
      if (s.postFxEnabled) {
        const postFxSettings =
          displayedView === "mandala"
            ? {
                ...s,
                bloomStrength: Math.min(3, s.bloomStrength * scene.postFxBoost.bloom),
                glitch: s.glitch || scene.postFxBoost.glitch > 0.45,
                glitchWild: s.glitchWild || scene.postFxBoost.glitch > 0.75,
              }
            : s;
        composer.apply(postFxSettings);
        composer.render(dt);
      } else {
        renderer.render(scene.scene, scene.camera);
      }

      if (statsOpenRef.current) {
        statsFrameCounter += 1;
        renderer.getDrawingBufferSize(drawBufferSize);
        const perfMemory = (performance as Performance & {
          memory?: { usedJSHeapSize: number };
        }).memory;
        const programs = (renderer.info as unknown as { programs?: unknown[] }).programs?.length ?? 0;
        if (statsFrameCounter % 3 === 0) {
          pushHistory(fpsHistory, smoothedFps);
          pushHistory(drawCallsHistory, renderer.info.render.calls);
          pushHistory(trianglesHistory, renderer.info.render.triangles);
          pushHistory(bassHistory, bands.bass);
          pushHistory(midHistory, bands.mid);
          pushHistory(highHistory, bands.high);
        }
        if (now - lastStatsCommitAt >= 100) {
          lastStatsCommitAt = now;
          statsUpdateCount += 1;
          setStats({
            fps: smoothedFps,
            frameMs: smoothedFps > 0 ? 1000 / smoothedFps : 0,
            updates: statsUpdateCount,
            uptimeSec: t,
            fpsHistory: [...fpsHistory],
            drawCalls: renderer.info.render.calls,
            drawCallsHistory: [...drawCallsHistory],
            triangles: renderer.info.render.triangles,
            trianglesHistory: [...trianglesHistory],
            lines: renderer.info.render.lines,
            points: renderer.info.render.points,
            geometries: renderer.info.memory.geometries,
            textures: renderer.info.memory.textures,
            programs,
            objects: scene.scene.children.length,
            pixelRatio: renderer.getPixelRatio(),
            bufferWidth: drawBufferSize.x,
            bufferHeight: drawBufferSize.y,
            canvasWidth: renderer.domElement.clientWidth,
            canvasHeight: renderer.domElement.clientHeight,
            heapMb: perfMemory ? perfMemory.usedJSHeapSize / (1024 * 1024) : 0,
            audioRunning: audio.isRunning(),
            sampleRate: audio.ctx?.sampleRate ?? 0,
            fftSize: audio.analyser?.fftSize ?? 0,
            smoothing: audio.analyser?.smoothingTimeConstant ?? 0,
            gain: audio.gain?.gain.value ?? 0,
            bass: bands.bass,
            bassHistory: [...bassHistory],
            mid: bands.mid,
            midHistory: [...midHistory],
            high: bands.high,
            highHistory: [...highHistory],
            centroid: bands.centroid,
            beat: bands.beat,
            bpm: Math.round(bands.bpm),
            bpmConfidence: bands.bpmConfidence,
          });
        }
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      dom.style.opacity = "1";
      window.removeEventListener("resize", onResize);
      container.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      dom.removeEventListener("wheel", onWheel);
      audio.stop();
      composer.dispose();
      scene.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // grab cursor when mouse-camera enabled
  useEffect(() => {
    const el = rendererRef.current?.domElement;
    if (el) el.style.cursor = settings.cameraMouse ? "grab" : "";
  }, [settings.cameraMouse]);

  // sync audio params reactively
  useEffect(() => {
    audioRef.current?.setSmoothing(settings.smoothing);
  }, [settings.smoothing]);
  useEffect(() => {
    audioRef.current?.setFftSize(settings.fftSize);
  }, [settings.fftSize]);
  useEffect(() => {
    audioRef.current?.setGain(settings.gain);
  }, [settings.gain]);

  // rebuild scene parts when count changes
  useEffect(() => {
    sceneRef.current?.buildBars(settings.barCount);
  }, [settings.barCount]);
  useEffect(() => {
    sceneRef.current?.buildParticles(settings.particleCount);
  }, [settings.particleCount]);

  const handleMic = async () => {
    try {
      setAudioError(null);
      const current = settingsStore.get();
      await audioRef.current?.startMic({ latencyOptimized: current.latencyOptimized });
      audioRef.current?.setSmoothing(current.smoothing);
      audioRef.current?.setFftSize(current.fftSize);
      audioRef.current?.setGain(current.gain);
      setAudioStatus("running");
    } catch (e) {
      setAudioError((e as Error).message);
      setAudioStatus("error");
    }
  };
  const handleSystem = async () => {
    try {
      setAudioError(null);
      const current = settingsStore.get();
      await audioRef.current?.startSystem({ latencyOptimized: current.latencyOptimized });
      audioRef.current?.setSmoothing(current.smoothing);
      audioRef.current?.setFftSize(current.fftSize);
      audioRef.current?.setGain(current.gain);
      setAudioStatus("running");
    } catch (e) {
      setAudioError((e as Error).message);
      setAudioStatus("error");
    }
  };
  const handleStop = () => {
    audioRef.current?.stop();
    setAudioStatus("idle");
    setLiveTempo({ beat: false, bpm: 0, bpmConfidence: 0 });
  };

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden" style={{ backgroundColor: settings.bgColor }}>
      {audioStatus !== "running" && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
          <div className="pointer-events-auto w-full max-w-md rounded-md border border-white/10 bg-black/70 p-7 backdrop-blur-xl shadow-[0_0_60px_rgba(52,211,153,0.08)]">
            <div className="mb-5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-emerald-300/80">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
              Audio source
            </div>
            <h1 className="mb-2 font-mono text-2xl uppercase tracking-[0.15em] text-white">
              Spectrum<span className="text-emerald-400">.</span>Analyser
            </h1>
            <p className="mb-6 max-w-sm font-mono text-[11px] leading-relaxed tracking-wide text-white/50">
              Pick an input. For system audio, choose a tab in Chrome and tick
              <span className="text-emerald-300"> "Share tab audio"</span>.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={handleMic}
                className="group flex items-center justify-between gap-3 rounded-md border border-white/15 bg-white/5 px-4 py-3 text-left font-mono text-[11px] uppercase tracking-[0.2em] text-white/80 transition-colors hover:border-emerald-300/60 hover:bg-emerald-400/10 hover:text-white"
              >
                <span className="flex items-center gap-3">
                  <Mic className="h-4 w-4 text-white/60 group-hover:text-emerald-300" />
                  Use microphone
                </span>
                <span className="text-white/30 group-hover:text-emerald-300">→</span>
              </button>
              <button
                onClick={handleSystem}
                className="group flex items-center justify-between gap-3 rounded-md border border-emerald-300/40 bg-emerald-400/10 px-4 py-3 text-left font-mono text-[11px] uppercase tracking-[0.2em] text-emerald-100 transition-colors hover:bg-emerald-400 hover:text-black"
              >
                <span className="flex items-center gap-3">
                  <MonitorSpeaker className="h-4 w-4" />
                  Share system audio
                </span>
                <span>→</span>
              </button>
            </div>
            {audioError && (
              <p className="mt-4 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 font-mono text-[11px] text-red-300">
                {audioError}
              </p>
            )}
          </div>
        </div>
      )}

      {audioStatus === "running" && liveTempo.bpm > 0 && liveTempo.bpmConfidence > 0.4 && (settings.showBPM ?? true) && (
        <div className="absolute bottom-3 left-3 z-10 pointer-events-none">
          <div className="text-center">
            <div className="font-mono text-xs uppercase tracking-widest text-white/40 mb-1 flex items-center justify-center gap-2">
              BPM
              <span className="px-1.5 py-0.5 rounded text-[6px] font-bold bg-white/10 text-white/50 border border-white/15">
                EXPERIMENTAL
              </span>
            </div>
            <div className="font-mono text-3xl font-bold text-white/70 tabular-nums"
              style={{
                textShadow: `0 0 ${Math.max(8, liveTempo.bpmConfidence * 20)}px rgba(52, 211, 153, ${liveTempo.bpmConfidence * 0.6})`,
                opacity: 0.3 + liveTempo.bpmConfidence * 0.4
              }}
            >
              {liveTempo.bpm}
            </div>
          </div>
        </div>
      )}

      <div className="fixed bottom-3 right-14 z-[101] flex items-center gap-2 pointer-events-auto">
        {audioStatus === "running" && (
          <button
            onClick={handleStop}
            className="flex h-10 items-center gap-2 rounded-md border border-white/10 bg-black/50 px-3 font-mono text-[10px] uppercase tracking-[0.2em] text-white/60 backdrop-blur opacity-20 transition-all duration-300 hover:opacity-100 hover:border-red-400/60 hover:bg-red-500/10 hover:text-red-200"
            title="Stop audio"
          >
            <Power className="h-3.5 w-3.5" />
            Stop
          </button>
        )}
        <Button
          size="icon"
          onClick={toggleFullscreen}
          className="bg-black/50 backdrop-blur border border-white/10 hover:bg-black/70 opacity-20 hover:opacity-100 transition-opacity duration-300 cursor-pointer"
          title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        >
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </Button>
        <button
          onClick={toggleStatsPanel}
          className="flex items-center justify-center h-10 w-10 rounded-md bg-black/50 backdrop-blur border border-white/10 hover:bg-black/70 opacity-20 hover:opacity-100 transition-opacity duration-300 cursor-pointer"
          title={statsOpen ? "Hide stats (N)" : "Show stats (N)"}
        >
          <Activity className="h-4 w-4" />
        </button>
      </div>

      {statsOpen && (
        <StatsForNerdsPanel
          stats={stats}
          fullscreen={statsFullscreen}
          onClose={closeStatsPanel}
          onToggleFullscreen={() => {
            setStatsOpen(true);
            setStatsFullscreen((v) => !v);
          }}
        />
      )}

      {settings.view === "classic" && settings.classicFullscreen && settings.classicShowFreqLabels && audioStatus === "running" && (
        <FreqLabels />
      )}
    </div>
  );
}

function StatsForNerdsPanel({
  stats,
  fullscreen,
  onClose,
  onToggleFullscreen,
}: {
  stats: NerdStats;
  fullscreen: boolean;
  onClose: () => void;
  onToggleFullscreen: () => void;
}) {
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [panelSize, setPanelSize] = useState({ width: 360, height: 520 });
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const dragStartRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const resizeStartRef = useRef<{ pointerId: number; startX: number; startY: number; originWidth: number; originHeight: number } | null>(null);

  const panelClasses = fullscreen
    ? "fixed inset-4 z-[120]"
    : "fixed right-4 top-16 z-[120] max-w-[calc(100vw-2rem)]";

  const fmt = (value: number, digits = 1) => value.toFixed(digits);

  useEffect(() => {
    if (fullscreen) {
      setDragging(false);
      setResizing(false);
    }
  }, [fullscreen]);

  const onHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (fullscreen || resizing) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest("button")) return;
    dragStartRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: dragOffset.x,
      originY: dragOffset.y,
    };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const onHeaderPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStartRef.current;
    if (!drag || drag.pointerId !== e.pointerId || fullscreen) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    setDragOffset({ x: drag.originX + dx, y: drag.originY + dy });
  };

  const onHeaderPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStartRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragStartRef.current = null;
    setDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const onResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (fullscreen) return;
    resizeStartRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originWidth: panelSize.width,
      originHeight: panelSize.height,
    };
    setResizing(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
    e.stopPropagation();
  };

  const onResizePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const resize = resizeStartRef.current;
    if (!resize || resize.pointerId !== e.pointerId || fullscreen) return;
    const dx = e.clientX - resize.startX;
    const dy = e.clientY - resize.startY;
    const maxWidth = Math.max(320, window.innerWidth - 32);
    const maxHeight = Math.max(300, window.innerHeight - 80);
    const nextWidth = Math.max(300, Math.min(maxWidth, resize.originWidth + dx));
    const nextHeight = Math.max(280, Math.min(maxHeight, resize.originHeight + dy));
    setPanelSize({ width: nextWidth, height: nextHeight });
  };

  const onResizePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const resize = resizeStartRef.current;
    if (!resize || resize.pointerId !== e.pointerId) return;
    resizeStartRef.current = null;
    setResizing(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <div
      className={`${panelClasses} pointer-events-auto flex flex-col overflow-hidden rounded-md border border-white/15 bg-black/70 backdrop-blur-xl shadow-[0_0_50px_rgba(0,0,0,0.45)]`}
      style={
        fullscreen
          ? undefined
          : {
              width: `min(${panelSize.width}px, calc(100vw - 2rem))`,
              height: `min(${panelSize.height}px, calc(100vh - 6rem))`,
              transform: `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0)`,
            }
      }
    >
      <div
        className={`flex items-center justify-between border-b border-white/10 px-3 py-2 ${fullscreen ? "" : dragging ? "cursor-grabbing" : "cursor-grab"}`}
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
        onPointerCancel={onHeaderPointerUp}
      >
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-emerald-300/80">Stats for nerds</p>
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/35">N toggle • Shift+N full page</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onToggleFullscreen}
            className="rounded border border-white/15 bg-white/5 p-1.5 text-white/75 transition-colors hover:bg-white/10 hover:text-white"
            title={fullscreen ? "Dock panel" : "Full page"}
          >
            {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={onClose}
            className="rounded border border-white/15 bg-white/5 p-1.5 text-white/75 transition-colors hover:bg-white/10 hover:text-white"
            title="Close stats"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="analyser-scroll grid flex-1 min-h-0 auto-rows-min grid-cols-[repeat(auto-fit,minmax(260px,1fr))] content-start gap-3 overflow-y-auto p-3 font-mono text-[10px] uppercase tracking-[0.12em] text-white/75">
        <StatSection title="Timing">
          <Stat label="FPS" value={fmt(stats.fps)} sparkline={stats.fpsHistory} color="emerald" />
          <Stat label="Frame ms" value={fmt(stats.frameMs, 2)} />
          <Stat label="Updates" value={String(stats.updates)} />
          <Stat label="Uptime" value={`${fmt(stats.uptimeSec, 1)}s`} />
        </StatSection>

        <StatSection title="Renderer">
          <Stat label="Draw calls" value={String(stats.drawCalls)} sparkline={stats.drawCallsHistory} color="cyan" />
          <Stat label="Triangles" value={String(stats.triangles)} sparkline={stats.trianglesHistory} color="amber" />
          <Stat label="Lines" value={String(stats.lines)} />
          <Stat label="Points" value={String(stats.points)} />
          <Stat label="Objects" value={String(stats.objects)} />
          <Stat label="Geometries" value={String(stats.geometries)} />
          <Stat label="Textures" value={String(stats.textures)} />
          <Stat label="Programs" value={String(stats.programs)} />
        </StatSection>

        <StatSection title="Viewport">
          <Stat label="Pixel ratio" value={fmt(stats.pixelRatio, 2)} />
          <Stat label="Buffer" value={`${stats.bufferWidth}x${stats.bufferHeight}`} />
          <Stat label="Canvas" value={`${stats.canvasWidth}x${stats.canvasHeight}`} />
          <Stat label="Heap MB" value={stats.heapMb > 0 ? fmt(stats.heapMb, 1) : "n/a"} />
        </StatSection>

        <StatSection title="Audio">
          <Stat label="Engine" value={stats.audioRunning ? "running" : "idle"} />
          <Stat label="Sample rate" value={stats.sampleRate ? `${stats.sampleRate} Hz` : "n/a"} />
          <Stat label="FFT size" value={stats.fftSize ? String(stats.fftSize) : "n/a"} />
          <Stat label="Smoothing" value={fmt(stats.smoothing, 3)} />
          <Stat label="Gain" value={fmt(stats.gain, 2)} />
          <Stat label="Bass" value={fmt(stats.bass, 3)} sparkline={stats.bassHistory} color="emerald" />
          <Stat label="Mid" value={fmt(stats.mid, 3)} sparkline={stats.midHistory} color="cyan" />
          <Stat label="High" value={fmt(stats.high, 3)} sparkline={stats.highHistory} color="amber" />
          <Stat label="Centroid" value={fmt(stats.centroid, 3)} />
          <Stat label="Beat" value={stats.beat ? "yes" : "no"} />
          <Stat label="BPM" value={stats.bpm > 0 ? `${stats.bpm} bpm` : "detecting"} />
          <Stat label="BPM confidence" value={fmt(stats.bpmConfidence * 100, 0) + "%"} />
        </StatSection>
      </div>

      {!fullscreen && (
        <div
          className="absolute bottom-0 right-0 h-8 w-8 cursor-se-resize"
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerUp}
          onPointerCancel={onResizePointerUp}
        />
      )}
    </div>
  );
}

function StatSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded border border-white/10 bg-white/[0.03] p-2.5">
      <p className="mb-2 text-[9px] uppercase tracking-[0.2em] text-emerald-300/70">{title}</p>
      <div className="grid gap-1">{children}</div>
    </section>
  );
}

function Stat({
  label,
  value,
  sparkline,
  color = "emerald",
}: {
  label: string;
  value: string;
  sparkline?: number[];
  color?: "emerald" | "cyan" | "amber";
}) {
  const sparkColor =
    color === "cyan"
      ? "stroke-cyan-300/90"
      : color === "amber"
        ? "stroke-amber-300/90"
        : "stroke-emerald-300/90";

  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/5 pb-1 last:border-b-0 last:pb-0">
      <span className="text-white/45">{label}</span>
      <div className="flex items-center gap-2">
        {sparkline && sparkline.length > 1 && <Sparkline values={sparkline} colorClass={sparkColor} />}
        <span className="text-right text-white/90 tabular-nums">{value}</span>
      </div>
    </div>
  );
}

function Sparkline({ values, colorClass }: { values: number[]; colorClass: string }) {
  const w = 74;
  const h = 20;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 0.000001);
  const points = values
    .map((v, i) => {
      const x = (i / Math.max(1, values.length - 1)) * (w - 1);
      const y = (1 - (v - min) / span) * (h - 1);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="rounded-sm bg-white/[0.03]">
      <polyline
        points={points}
        fill="none"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={colorClass}
      />
    </svg>
  );
}

function FreqLabels() {
  // Mapping mirrors scene.updateClassic: idx = t^1.6 * 0.7 * halfBins; freq = idx * sr/fft
  // simplifies to: freq ≈ t^1.6 * 0.35 * sampleRate. Using sr ~ 48000 → freq ≈ t^1.6 * 16800.
  const labels = [60, 120, 250, 500, 1000, 2000, 4000, 8000, 16000];
  const tFor = (hz: number) => Math.min(1, Math.max(0, Math.pow(hz / 16800, 1 / 1.6)));
  const fmt = (hz: number) => (hz >= 1000 ? `${hz / 1000}k` : `${hz}`);
  const spectrumWidth = `${(14 / 14.8) * 100}%`;
  const minGapPx = 34;
  const approxTrackPx = 1100;
  let lastShownPx = -Infinity;
  const visibleLabels = labels.filter((hz, index) => {
    if (index === labels.length - 1) return true;
    const px = tFor(hz) * approxTrackPx;
    if (px - lastShownPx < minGapPx) return false;
    lastShownPx = px;
    return true;
  });

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-14 z-[5] flex justify-center px-6 sm:px-10">
      <div className="relative h-6 w-full max-w-[1500px]">
        <div className="absolute inset-x-1/2 top-0 h-full -translate-x-1/2" style={{ width: spectrumWidth }}>
        {visibleLabels.map((hz, index) => {
          const left = `${tFor(hz) * 100}%`;
          const isFirst = index === 0;
          const isLast = index === visibleLabels.length - 1;
          return (
            <div
              key={hz}
              className={`absolute top-0 text-center font-mono text-[9px] uppercase tracking-[0.16em] text-white/45 ${isFirst ? "translate-x-0" : isLast ? "-translate-x-full" : "-translate-x-1/2"}`}
              style={{ left, minWidth: isFirst || isLast ? undefined : 0 }}
            >
              <div className="mx-auto mb-1 h-2 w-px bg-white/35" />
              {fmt(hz)}
              <span className="text-white/25">Hz</span>
            </div>
          );
        })}
        </div>
      </div>
    </div>
  );
}
