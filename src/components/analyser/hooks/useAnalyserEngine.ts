import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";
import * as THREE from "three";
import { Scene } from "@spectrum-aura/engine/scene";
import { Composer, computeQualityTier } from "@spectrum-aura/engine/composer";
import { AudioEngine } from "@spectrum-aura/engine/audio";
import { ViewCycleController } from "@spectrum-aura/engine/view-cycle-controller";
import { SongClock } from "@spectrum-aura/engine/song-clock";
import { dispatchLiveTempo, setLiveTempoFrame } from "@spectrum-aura/engine/live-tempo";
import {
  createSceneUpdateOpts,
  syncSceneUpdateOpts,
} from "@spectrum-aura/engine/scene-update-opts";
import { ViewEvolutionEngine } from "@spectrum-aura/engine/evolution";
import { measureFrameLatency, smoothLatency } from "@spectrum-aura/engine/latency-metrics";
import {
  WEBXR_BACKGROUND_EVENT,
  WEBXR_REQUEST_EVENT,
  WEBXR_STATE_EVENT,
  WebXrRuntime,
} from "@spectrum-aura/engine/xr";
import { PALETTES, settingsStore, type Settings, type ViewMode } from "../store";
import type { LatencyHudState, NerdStats } from "../overlays/stats-types";

/**
 * Owns the WebGL renderer / scene / composer / audio engine lifecycle and the
 * per-frame render loop (desktop rAF + WebXR animation loop). Everything here
 * runs once on mount; React state only changes through the throttled
 * `setStats` / `setLatencyHud` setters. The loop body is intentionally kept as
 * a single closure so the hot path stays allocation-light.
 */
export function useAnalyserEngine(params: {
  containerRef: RefObject<HTMLDivElement | null>;
  settingsRef: RefObject<Settings>;
  songClockRef: RefObject<SongClock>;
  audioRef: RefObject<AudioEngine | null>;
  sceneRef: RefObject<Scene | null>;
  composerRef: RefObject<Composer | null>;
  rendererRef: RefObject<THREE.WebGLRenderer | null>;
  xrRuntimeRef: RefObject<WebXrRuntime | null>;
  statsOpenRef: RefObject<boolean>;
  beatHintFlashRef: RefObject<string | null>;
  setStats: Dispatch<SetStateAction<NerdStats>>;
  setLatencyHud: Dispatch<SetStateAction<LatencyHudState>>;
}) {
  const {
    containerRef,
    settingsRef,
    songClockRef,
    audioRef,
    sceneRef,
    composerRef,
    rendererRef,
    xrRuntimeRef,
    statsOpenRef,
    beatHintFlashRef,
    setStats,
    setLatencyHud,
  } = params;

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.info.autoReset = false;
    renderer.setPixelRatio(
      settingsRef.current.performance
        ? Math.min(window.devicePixelRatio, 0.85)
        : Math.min(window.devicePixelRatio, 2),
    );
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(settingsRef.current.bgColor, 1);
    container.appendChild(renderer.domElement);

    const scene = new Scene(width, height);
    scene.onRequestViewChange = (view) => settingsStore.set({ view });
    scene.setPalette(PALETTES[settingsRef.current.paletteIndex]?.colors ?? PALETTES[0].colors);
    const composer = new Composer(renderer, scene.scene, scene.camera, width, height);
    rendererRef.current = renderer;
    sceneRef.current = scene;
    composerRef.current = composer;
    // Deliberate dev-only inspection seam: lets devtools (and headless test
    // drivers) examine live pass state — window.__composer.composer.passes etc.
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__composer = composer;
    }

    const audio = new AudioEngine();
    audioRef.current = audio;
    const viewCycleController = new ViewCycleController();
    const viewEvolutionEngine = new ViewEvolutionEngine();

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
    let displayedView: ViewMode = settingsRef.current.view;
    const sceneOpts = createSceneUpdateOpts(displayedView);
    // Pooled once and mutated every frame below so the hot path doesn't allocate a
    // fresh object every rAF tick; `audio.read()` returns its own pooled `bands`
    // object too, but we still need a distinct one here since bpm/beatPhase are
    // overridden by the SongClock-authoritative values.
    const bandsForScene = {
      bass: 0,
      mid: 0,
      high: 0,
      centroid: 0,
      beat: false,
      bpm: 0,
      bpmConfidence: 0,
      beatPhase: 0,
      onsetStrength: 0,
      signalSwing: false,
      bpmLocked: false,
      bins: new Uint8Array(0),
      timing: {
        readCpuMs: 0,
        audioToRenderMs: 0,
        baseLatencyMs: 0,
        outputLatencyMs: 0,
        fftWindowMs: 0,
        bassDelta: 0,
        signalChangeAt: 0,
      },
      fftReadAt: 0,
    };
    const postFxReactive = {
      bass: 0,
      mid: 0,
      high: 0,
      centroid: 0,
      beat: false,
      bpm: 0,
      bpmConfidence: 0,
      pulse: 0,
      performance: false,
      qualityTier: 0 as 0 | 1 | 2,
    };
    const mandalaPostFx = { ...settingsStore.get() };
    let lastPaletteIndex = settingsRef.current.paletteIndex;
    let lastPerformanceMode = settingsRef.current.performance;
    let smoothedLatency = { audioToRenderMs: 0, signalToRenderMs: 0 };
    let lastLatencyHudCommitAt = 0;
    const pushHistory = (history: number[], value: number, max = 52) => {
      history.push(value);
      if (history.length > max) history.shift();
    };
    let lastBgColor = "";
    let lastOpacity = "";
    let lastStatsCommitAt = 0;
    let lastLiveTempoCommitAt = 0;
    let reacquireFlashUntil = 0;
    let radialKickEnv = 0;
    // Tracked as discrete fields (not a template-string key) so the hot path doesn't
    // allocate a new string every frame just to detect whether a composer reset is due.
    let lastResetView: ViewMode | null = null;
    let lastResetPreset: string | null | undefined = undefined;
    let lastResetPostFx: boolean | undefined = undefined;
    let lastResetMotionTrails: boolean | undefined = undefined;
    let lastResetPerformance: boolean | undefined = undefined;
    let xrLoopActive = false;
    let xrBackgroundHidden = false;

    const dispatchWebXrState = (state: {
      available: boolean;
      active: boolean;
      pending: boolean;
      error: string | null;
      backgroundHidden: boolean;
    }) => {
      window.dispatchEvent(new CustomEvent(WEBXR_STATE_EVENT, { detail: state }));
    };

    const applyBackgroundMode = () => {
      if (xrLoopActive && xrBackgroundHidden) {
        renderer.setClearColor(0x000000, 0);
        return;
      }
      renderer.setClearColor(settingsRef.current.bgColor, 1);
    };

    const setRendererQualityForMode = (active: boolean) => {
      const desktopPixelRatioLimit = settingsRef.current.performance ? 0.85 : 2;
      const xrPixelRatioLimit = settingsRef.current.performance ? 0.6 : 0.8;
      const ratio = active
        ? Math.min(window.devicePixelRatio, xrPixelRatioLimit)
        : Math.min(window.devicePixelRatio, desktopPixelRatioLimit);
      renderer.setPixelRatio(ratio);
      const w = container.clientWidth;
      const h = container.clientHeight;
      renderer.setSize(w, h);
      scene.resize(w, h);
      composer.resize(w, h);
    };

    const desktopLoop = () => {
      loop(performance.now());
    };

    const syncAnimationLoop = (active: boolean) => {
      xrLoopActive = active;
      if (active) {
        if (raf) {
          cancelAnimationFrame(raf);
          raf = 0;
        }
        renderer.setAnimationLoop((time, frame) => {
          loop(typeof time === "number" ? time : performance.now(), frame ?? undefined);
        });
        return;
      }
      renderer.setAnimationLoop(null);
      if (!raf) raf = requestAnimationFrame(desktopLoop);
    };

    const xrRuntime = new WebXrRuntime(renderer, scene, (state) => {
      dispatchWebXrState(state);
      setRendererQualityForMode(state.active);
      if (state.active !== xrLoopActive) syncAnimationLoop(state.active);
      if (!state.active) last = performance.now();
      applyBackgroundMode();
    });
    xrRuntimeRef.current = xrRuntime;
    void xrRuntime.probeAvailability();

    const onResize = () => {
      setRendererQualityForMode(xrLoopActive);
    };
    window.addEventListener("resize", onResize);

    // mouse / pointer drag camera control (active when settings.cameraMouse)
    let dragging = false;
    let activePointerId: number | null = null;
    let lastX = 0,
      lastY = 0;
    const dom = renderer.domElement;
    dom.style.touchAction = "none";
    dom.style.position = "absolute";
    dom.style.inset = "0";
    dom.style.zIndex = "0";
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

    const onWebXrRequest = () => {
      void xrRuntime.toggle();
    };
    window.addEventListener(WEBXR_REQUEST_EVENT, onWebXrRequest);

    const onWebXrBackground = (event: Event) => {
      const hidden = Boolean((event as CustomEvent<boolean>).detail);
      xrBackgroundHidden = hidden;
      applyBackgroundMode();
      dispatchWebXrState({
        available: xrRuntime.available,
        active: xrRuntime.active,
        pending: xrRuntime.pending,
        error: xrRuntime.error,
        backgroundHidden: xrBackgroundHidden,
      });
    };
    window.addEventListener(WEBXR_BACKGROUND_EVENT, onWebXrBackground);

    const frameBody = (now: number, _frame?: XRFrame) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      xrRuntime.tick(dt);
      const fps = dt > 0 ? 1 / dt : 0;
      smoothedFps = smoothedFps * 0.9 + fps * 0.1;
      const t = (now - start) / 1000;
      const s = settingsRef.current;

      if (s.bgColor !== lastBgColor) {
        renderer.setClearColor(s.bgColor, 1);
        lastBgColor = s.bgColor;
      }

      if (s.performance !== lastPerformanceMode) {
        lastPerformanceMode = s.performance;
        setRendererQualityForMode(xrLoopActive);
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

      const bands = audio.read(s.beatSensitivity, now);
      const barTimingFrame = songClockRef.current.tick({
        now,
        estimatedBpm: bands.bpm,
        bpmConfidence: bands.bpmConfidence,
        bpmLocked: bands.bpmLocked,
        audioBeat: bands.beat,
        onsetStrength: bands.onsetStrength,
        bass: bands.bass,
        mid: bands.mid,
        centroid: bands.centroid,
      });
      if (songClockRef.current.consumeManualReleaseSignal()) {
        // Manual lock went stale (silence or the track's tempo diverged) —
        // release the detector's tap-lock too so fresh candidates can flow
        // again, and flash a message so it reads as "still working on it"
        // rather than the visual just going quiet.
        audio.releaseManualBpmLock();
        beatHintFlashRef.current = "Re-syncing…";
        reacquireFlashUntil = now + 2500;
      } else if (reacquireFlashUntil > 0 && now >= reacquireFlashUntil) {
        reacquireFlashUntil = 0;
        if (beatHintFlashRef.current === "Re-syncing…") {
          beatHintFlashRef.current = null;
        }
      }
      const clockBpm = barTimingFrame.clockBpm || bands.bpm;
      const clockBeatPhase = barTimingFrame.synced ? barTimingFrame.beatPhase : bands.beatPhase;
      Object.assign(bandsForScene, bands);
      bandsForScene.bpm = clockBpm;
      bandsForScene.beatPhase = clockBeatPhase;
      if (s.viewCycleMode) {
        const cycle = viewCycleController.tick({
          now,
          barTiming: barTimingFrame,
          bpm: clockBpm,
          enabled: s.viewCycleMode,
          viewTransitionActive: viewTransition !== null,
        });
        if (cycle.shouldSwitch) {
          settingsStore.cycleRandomView();
        }
      } else {
        viewCycleController.reset();
      }
      radialKickEnv = bands.beat ? 1 : Math.max(0, radialKickEnv - dt * 5);
      const tempoFrame = {
        audioRunning: audio.isRunning(),
        beat: bands.beat,
        bpm: Math.round(clockBpm),
        bpmConfidence: bands.bpmConfidence,
        barTiming: barTimingFrame,
        beatHintFlash: beatHintFlashRef.current,
      };
      setLiveTempoFrame(tempoFrame);
      if (now - lastLiveTempoCommitAt >= 120) {
        lastLiveTempoCommitAt = now;
        dispatchLiveTempo(tempoFrame);
      }
      if (s.paletteIndex !== lastPaletteIndex) {
        lastPaletteIndex = s.paletteIndex;
        scene.setPalette(PALETTES[s.paletteIndex]?.colors ?? PALETTES[0].colors);
      }
      syncSceneUpdateOpts(sceneOpts, s, displayedView, xrRuntime.active, xrBackgroundHidden);
      if (s.evolveEnabled) {
        viewEvolutionEngine.tick(sceneOpts, displayedView, barTimingFrame, dt, s.evolveAmount);
      } else {
        viewEvolutionEngine.reset();
      }
      scene.update(dt, t, bandsForScene, sceneOpts);

      renderer.info.reset();
      if (
        displayedView !== lastResetView ||
        s.activePreset !== lastResetPreset ||
        s.postFxEnabled !== lastResetPostFx ||
        s.motionTrails !== lastResetMotionTrails ||
        s.performance !== lastResetPerformance
      ) {
        composer.resetTemporalEffects();
        lastResetView = displayedView;
        lastResetPreset = s.activePreset;
        lastResetPostFx = s.postFxEnabled;
        lastResetMotionTrails = s.motionTrails;
        lastResetPerformance = s.performance;
      }
      const tAfterScene = performance.now();
      const usePostFx = s.postFxEnabled && !xrRuntime.active && !s.performance;
      if (usePostFx) {
        const bpmPulse =
          clockBpm > 0 && barTimingFrame.synced
            ? Math.max(0, Math.sin(clockBeatPhase * Math.PI))
            : radialKickEnv;
        let postFxSettings: Settings = s;
        if (displayedView === "mandala") {
          Object.assign(mandalaPostFx, s);
          mandalaPostFx.bloomStrength = Math.min(3, s.bloomStrength * scene.postFxBoost.bloom);
          mandalaPostFx.glitch = s.glitch || scene.postFxBoost.glitch > 0.45;
          mandalaPostFx.glitchWild = s.glitchWild || scene.postFxBoost.glitch > 0.75;
          postFxSettings = mandalaPostFx;
        }
        postFxReactive.bass = bandsForScene.bass;
        postFxReactive.mid = bandsForScene.mid;
        postFxReactive.high = bandsForScene.high;
        postFxReactive.centroid = bandsForScene.centroid;
        postFxReactive.beat = bandsForScene.beat;
        postFxReactive.bpm = clockBpm;
        postFxReactive.bpmConfidence = bands.bpmConfidence;
        postFxReactive.pulse = bpmPulse;
        postFxReactive.performance = s.performance || xrRuntime.active;
        postFxReactive.qualityTier = computeQualityTier(smoothedFps, postFxReactive.qualityTier);
        composer.apply(postFxSettings, postFxReactive);
        composer.render(dt);
      } else {
        renderer.render(scene.scene, scene.camera);
      }
      const tAfterRender = performance.now();

      const latency = measureFrameLatency({
        fftReadAt: bands.fftReadAt,
        tAfterScene,
        tAfterRender,
        signalSwing: bands.signalSwing,
        signalChangeAt: bands.timing.signalChangeAt,
      });
      smoothedLatency = smoothLatency(smoothedLatency, latency);
      const { audioToSceneMs, sceneToRenderMs } = latency;

      if (s.showLatency && audio.isRunning() && now - lastLatencyHudCommitAt >= 100) {
        lastLatencyHudCommitAt = now;
        setLatencyHud({
          audioToRenderMs: smoothedLatency.audioToRenderMs,
          signalToRenderMs: smoothedLatency.signalToRenderMs,
          audioToSceneMs,
          sceneToRenderMs,
          performanceMode: s.performance,
        });
      }

      if (statsOpenRef.current) {
        statsFrameCounter += 1;
        renderer.getDrawingBufferSize(drawBufferSize);
        const perfMemory = (
          performance as Performance & {
            memory?: { usedJSHeapSize: number };
          }
        ).memory;
        const programs =
          (renderer.info as unknown as { programs?: unknown[] }).programs?.length ?? 0;
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
          const overlayDebug = composer.getAssetOverlayDebugState(settingsRef.current);
          const textDebug = scene.getTextOverlayDebugState();
          const wikiDebug = scene.getWikichromaDebugState();
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
            audioReadCpuMs: bands.timing.readCpuMs,
            audioToSceneMs,
            sceneToRenderMs,
            audioToRenderMs: smoothedLatency.audioToRenderMs,
            signalToRenderMs: smoothedLatency.signalToRenderMs,
            baseLatencyMs: bands.timing.baseLatencyMs,
            fftWindowMs: bands.timing.fftWindowMs,
            assetOverlayEnabled: overlayDebug.enabled,
            assetOverlayBias: overlayDebug.bias,
            assetOverlayCommonsEnabled: overlayDebug.commonsEnabled,
            assetOverlayCommonsTopic: overlayDebug.commonsTopic,
            assetOverlayCurrentFamilies: overlayDebug.currentFamilies,
            assetOverlayNextFamilies: overlayDebug.nextFamilies,
            assetOverlayCurrentEntries: overlayDebug.currentEntries,
            assetOverlayTransition: overlayDebug.transition,
            textOverlayEnabled: textDebug.enabled,
            textOverlaySourceLabel: textDebug.sourceLabel,
            textOverlayCurrentText: textDebug.currentText,
            textOverlayAuthor: textDebug.author,
            textOverlayWork: textDebug.work,
            textOverlayRights: textDebug.rights,
            textOverlayCreditLine: textDebug.creditLine,
            textOverlaySourceUrl: textDebug.sourceUrl,
            wikichromaActive: wikiDebug.active,
            wikichromaMode: wikiDebug.mode,
            wikichromaSelectedPacks: wikiDebug.selectedPacks,
            wikichromaActiveModels: wikiDebug.activeModels,
            wikichromaActorsActive: wikiDebug.actorsActive,
            wikichromaBeatLocked: wikiDebug.beatLocked,
            wikichromaBeatsPerLoop: wikiDebug.beatsPerLoop,
            wikichromaLoopCount: wikiDebug.loopCount,
          });
        }
      }
    };
    let lastLoopErrorAt = -Infinity;
    const loop = (now: number, frame?: XRFrame) => {
      try {
        frameBody(now, frame);
      } catch (error) {
        // A throw here would otherwise skip the re-arm below and permanently
        // freeze the visualizer at the last rendered frame.
        if (now - lastLoopErrorAt > 5000) {
          lastLoopErrorAt = now;
          console.error("[analyser] render loop error (frame skipped)", error);
        }
      } finally {
        if (!xrRuntime.active) {
          raf = requestAnimationFrame(desktopLoop);
        }
      }
    };
    raf = requestAnimationFrame(desktopLoop);
    dispatchWebXrState({
      available: xrRuntime.available,
      active: xrRuntime.active,
      pending: xrRuntime.pending,
      error: xrRuntime.error,
      backgroundHidden: xrBackgroundHidden,
    });

    return () => {
      cancelAnimationFrame(raf);
      renderer.setAnimationLoop(null);
      window.removeEventListener(WEBXR_REQUEST_EVENT, onWebXrRequest);
      window.removeEventListener(WEBXR_BACKGROUND_EVENT, onWebXrBackground);
      dom.style.opacity = "1";
      window.removeEventListener("resize", onResize);
      container.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      dom.removeEventListener("wheel", onWheel);
      audio.stop();
      xrRuntime.dispose();
      composer.dispose();
      scene.dispose();
      renderer.dispose();
      if (import.meta.env.DEV) {
        delete (window as unknown as Record<string, unknown>).__composer;
      }
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
