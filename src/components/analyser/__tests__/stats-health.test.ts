import { describe, expect, it } from "vitest";
import { EMPTY_LIVE_TEMPO, type LiveTempoState } from "@spectrum-aura/engine/live-tempo";
import { statsHealth, statsReport } from "../overlays/stats-health";
import { EMPTY_STATS, type NerdStats } from "../overlays/stats-types";

const stats = (patch: Partial<NerdStats>): NerdStats => ({ ...EMPTY_STATS, ...patch });
const tempo = (locked: boolean, bpm = 127): LiveTempoState => ({
  ...EMPTY_LIVE_TEMPO,
  barTiming: { ...EMPTY_LIVE_TEMPO.barTiming, bpmLocked: locked, clockBpm: bpm, source: "auto" },
});
const tone = (items: ReturnType<typeof statsHealth>, id: string) =>
  items.find((item) => item.id === id)!.tone;

describe("stats health", () => {
  it("reads as idle, not broken, before anything is playing", () => {
    const items = statsHealth(EMPTY_STATS, EMPTY_LIVE_TEMPO);
    expect(items.map((item) => item.tone)).toEqual(["idle", "idle", "idle", "idle"]);
  });

  it("is all good on a healthy session", () => {
    const items = statsHealth(
      stats({
        fps: 60,
        audioRunning: true,
        baseLatencyMs: 5,
        audioToRenderMs: 0.4,
        frameMs: 16.6,
        bpm: 127,
      }),
      tempo(true),
    );
    expect(items.every((item) => item.tone === "good")).toBe(true);
    expect(items.find((item) => item.id === "delay")!.value).toBe("≈ 22 ms");
    expect(items.find((item) => item.id === "tempo")!.value).toBe("127.0 locked");
  });

  it("grades frame rate and sound-to-picture delay", () => {
    // Added delay = browser audio delay + app processing + one frame.
    const at = (fps: number, delay: number) =>
      statsHealth(
        stats({
          fps,
          audioRunning: true,
          baseLatencyMs: delay - 21,
          audioToRenderMs: 1,
          frameMs: 20,
        }),
        tempo(true),
      );
    expect(tone(at(42, 60), "fps")).toBe("warn");
    expect(tone(at(42, 60), "delay")).toBe("warn");
    expect(tone(at(18, 140), "fps")).toBe("bad");
    expect(tone(at(18, 140), "delay")).toBe("bad");
  });

  it("warns, with what to do, while tempo has not locked", () => {
    const item = statsHealth(stats({ fps: 60, audioRunning: true, bpm: 96 }), tempo(false, 0)).find(
      (entry) => entry.id === "tempo",
    )!;
    expect(item.tone).toBe("warn");
    expect(item.value).toBe("96 searching");
    expect(item.note).toMatch(/Tap T/);
  });

  it("writes a plain-text report with the view and the health readings", () => {
    const text = statsReport(
      stats({ fps: 60, audioRunning: true, audioToRenderMs: 22, drawCalls: 14 }),
      tempo(true),
      "outrun",
    );
    expect(text.split("\n")[0]).toBe("Spectrum Aura stats");
    expect(text).toMatch(/View\s+outrun/);
    expect(text).toMatch(/Frame rate\s+60 fps/);
    expect(text).toMatch(/Draw calls\s+14/);
  });
});
