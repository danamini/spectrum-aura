import { useEffect, type RefObject } from "react";
import { AudioEngine } from "../engine/audio";
import { SongClock } from "../engine/song-clock";
import { BEAT_HINT_EVENT, type BeatHintDetail } from "../engine/beat-hint";
import { dispatchLiveTempo, setLiveTempoFrame } from "../engine/live-tempo";
import type { Settings } from "../store";

/**
 * Bridges manual beat taps (`T` / `⇧T`, dispatched as `BEAT_HINT_EVENT`) into
 * the authoritative `SongClock`, then publishes an immediate tempo frame so the
 * HUD reacts on the same tap instead of waiting for the next render commit.
 */
export function useBeatHintBridge(params: {
  audioRef: RefObject<AudioEngine | null>;
  songClockRef: RefObject<SongClock>;
  settingsRef: RefObject<Settings>;
  beatHintFlashRef: RefObject<string | null>;
}) {
  const { audioRef, songClockRef, settingsRef, beatHintFlashRef } = params;

  useEffect(() => {
    let flashTimer: number | null = null;
    const onBeatHint = (event: Event) => {
      const detail = ((event as CustomEvent<BeatHintDetail>).detail ?? {}) as BeatHintDetail;
      const now = performance.now();
      const s = settingsRef.current;
      const running = audioRef.current?.isRunning();
      const bands = running ? audioRef.current!.read(s.beatSensitivity, now) : null;

      if (detail.downbeat) {
        songClockRef.current.hintDownbeat(now, bands?.bpm ?? 0);
      } else {
        songClockRef.current.hintBeat(now);
      }
      audioRef.current?.hintBeat(now, detail.downbeat, bands?.bpm ?? 0);

      if (running && bands) {
        beatHintFlashRef.current = detail.downbeat ? "Downbeat" : "Beat";
        const barTiming = songClockRef.current.tick({
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
        const tempoFrame = {
          audioRunning: true,
          beat: true,
          bpm: Math.round(barTiming.clockBpm || bands.bpm),
          bpmConfidence: bands.bpmConfidence,
          barTiming,
          beatHintFlash: beatHintFlashRef.current,
        };
        setLiveTempoFrame(tempoFrame);
        dispatchLiveTempo(tempoFrame);
      }
      if (flashTimer !== null) window.clearTimeout(flashTimer);
      flashTimer = window.setTimeout(() => {
        beatHintFlashRef.current = null;
      }, 700);
    };
    window.addEventListener(BEAT_HINT_EVENT, onBeatHint);
    return () => {
      window.removeEventListener(BEAT_HINT_EVENT, onBeatHint);
      if (flashTimer !== null) window.clearTimeout(flashTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
