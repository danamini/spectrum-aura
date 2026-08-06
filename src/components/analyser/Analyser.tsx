import { useEffect, useRef, useState } from "react";
import type { WebGLRenderer } from "three";
import type { Scene } from "@spectrum-aura/engine/scene";
import type { Composer } from "@spectrum-aura/engine/composer";
import type { AudioEngine } from "@spectrum-aura/engine/audio";
import type { WebXrRuntime } from "@spectrum-aura/engine/xr";
import { SongClock } from "@spectrum-aura/engine/song-clock";
import {
  dispatchLiveTempo,
  EMPTY_LIVE_TEMPO,
  LIVE_TEMPO_EVENT,
  type LiveTempoState,
} from "@spectrum-aura/engine/live-tempo";
import { getAudioCaptureSupport } from "@spectrum-aura/engine/audio-support";
import { settingsStore, useSettings, type Settings } from "./store";
import { TempoReadout } from "./TempoReadout";
import { AudioSourcePrompt } from "./overlays/AudioSourcePrompt";
import { LatencyHud } from "./overlays/LatencyHud";
import { StatsForNerdsPanel } from "./overlays/StatsPanel";
import { FreqLabels } from "./overlays/FreqLabels";
import { EMPTY_LATENCY_HUD, EMPTY_STATS, type NerdStats } from "./overlays/stats-types";
import { useAnalyserEngine } from "./hooks/useAnalyserEngine";
import { useDraggablePanel } from "./hooks/useDraggablePanel";
import { useBeatHintBridge } from "./hooks/useBeatHintBridge";
import { useAnalyserCommandEvents } from "./hooks/useAnalyserCommandEvents";

export function Analyser() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<AudioEngine | null>(null);
  const xrRuntimeRef = useRef<WebXrRuntime | null>(null);
  const settings = useSettings();
  const [audioStatus, setAudioStatus] = useState<"idle" | "running" | "error">("idle");
  const [audioError, setAudioError] = useState<string | null>(null);
  // Dismissed-without-choosing state: visuals idle without audio, and the
  // "Audio Source" shortcut (X) re-opens the prompt via handleStop below.
  const [audioPromptDismissed, setAudioPromptDismissed] = useState(false);
  const bpmDrag = useDraggablePanel("bpm-hud");
  const audioCaptureSupport = getAudioCaptureSupport();
  const [statsOpen, setStatsOpen] = useState(false);
  const [statsFullscreen, setStatsFullscreen] = useState(false);
  const [stats, setStats] = useState<NerdStats>(EMPTY_STATS);
  const [latencyHud, setLatencyHud] = useState(EMPTY_LATENCY_HUD);
  const statsOpenRef = useRef(false);
  const songClockRef = useRef(new SongClock());
  const beatHintFlashRef = useRef<string | null>(null);
  const [liveTempo, setLiveTempo] = useState<LiveTempoState>(EMPTY_LIVE_TEMPO);

  // engine refs
  const sceneRef = useRef<Scene | null>(null);
  const composerRef = useRef<Composer | null>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const settingsRef = useRef<Settings>(settings);
  settingsRef.current = settings;

  useEffect(() => {
    statsOpenRef.current = statsOpen;
  }, [statsOpen]);

  useEffect(() => {
    const onLiveTempo = (event: Event) => {
      const detail = (event as CustomEvent<LiveTempoState>).detail;
      if (detail) setLiveTempo(detail);
    };
    window.addEventListener(LIVE_TEMPO_EVENT, onLiveTempo);
    return () => window.removeEventListener(LIVE_TEMPO_EVENT, onLiveTempo);
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

  // Rotate through the saved preset list when cycle mode is on.
  useEffect(() => {
    if (!settings.slotCycleMode) return;
    const SLOT_CYCLE_DWELL_MS = Math.max(1, settings.slotCycleSeconds) * 1000;

    const initialCount = settingsStore.getSlots().length;
    if (initialCount === 0) {
      settingsStore.set({ slotCycleMode: false });
      return;
    }

    let cursor = 0;
    settingsStore.loadSlot(cursor);
    let lastSwitch = performance.now();

    const id = window.setInterval(() => {
      if (!settingsStore.get().slotCycleMode) return;
      if (performance.now() - lastSwitch < SLOT_CYCLE_DWELL_MS) return;

      const count = settingsStore.getSlots().length;
      if (count === 0) {
        settingsStore.set({ slotCycleMode: false });
        window.clearInterval(id);
        return;
      }
      if (cursor >= count) cursor = 0;
      cursor = count === 1 ? cursor : (cursor + 1) % count;
      lastSwitch = performance.now();
      settingsStore.loadSlot(cursor);
    }, 350);

    return () => window.clearInterval(id);
  }, [settings.slotCycleMode, settings.slotCycleSeconds]);

  useAnalyserEngine({
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
  });

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
    songClockRef.current.reset();
    beatHintFlashRef.current = null;
    dispatchLiveTempo(EMPTY_LIVE_TEMPO);
    setAudioStatus("idle");
    setAudioPromptDismissed(false);
  };

  useAnalyserCommandEvents({
    onToggleStatsPanel: toggleStatsPanel,
    onToggleStatsFullscreen: () => {
      setStatsOpen(true);
      setStatsFullscreen((v) => !v);
    },
    onToggleFullscreen: () => void toggleFullscreen(),
    onStopAudio: handleStop,
  });

  useBeatHintBridge({ audioRef, songClockRef, settingsRef, beatHintFlashRef });

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden"
      style={{ backgroundColor: settings.bgColor }}
    >
      {audioStatus !== "running" && !audioPromptDismissed && (
        <AudioSourcePrompt
          support={audioCaptureSupport}
          error={audioError}
          onMic={handleMic}
          onSystem={handleSystem}
          onDismiss={() => setAudioPromptDismissed(true)}
        />
      )}

      {audioStatus === "running" && settings.showLatency && <LatencyHud latency={latencyHud} />}

      {settings.showBPM && (
        <div
          className="pointer-events-auto absolute left-3 z-10"
          {...bpmDrag.handleProps}
          style={{
            bottom: "calc(0.75rem + var(--bottom-hud-clearance, 0px))",
            ...bpmDrag.style,
          }}
        >
          <TempoReadout variant="overlay" tempo={liveTempo} />
        </div>
      )}

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

      {settings.view === "classic" &&
        settings.classicFullscreen &&
        settings.classicShowFreqLabels &&
        audioStatus === "running" && <FreqLabels />}
    </div>
  );
}
