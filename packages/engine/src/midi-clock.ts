export type MidiSyncEvent =
  | { type: "clock" | "start" | "continue" | "stop" }
  | { type: "position"; sixteenths: number };

export function parseMidiSyncMessage(data: ArrayLike<number> | null): MidiSyncEvent | null {
  if (!data?.length) return null;
  switch (data[0]) {
    case 0xf8:
      return { type: "clock" };
    case 0xfa:
      return { type: "start" };
    case 0xfb:
      return { type: "continue" };
    case 0xfc:
      return { type: "stop" };
    case 0xf2:
      return data.length >= 3 && data[1] < 128 && data[2] < 128
        ? { type: "position", sixteenths: data[1] | (data[2] << 7) }
        : null;
    default:
      return null;
  }
}
export type MidiClockFrame = {
  enabled: boolean;
  bpm: number;
  /** Exact position of the most recent MIDI pulse, in quarter notes. */
  beat: number;
  timestamp: number;
  running: boolean;
  fresh: boolean;
  revision: number;
  status: "off" | "waiting" | "playing" | "stopped" | "lost";
};
export const MIDI_CLOCK_TIMEOUT_MS = 1000;

/** Decodes external pulses/transport; SongClock alone derives bars and visual phase. */
export class MidiClockInput {
  private source = "";
  private bpm = 0;
  private pulses = 0;
  private lastPulse: number | null = null;
  private intervals: number[] = [];
  private running = false;
  private awaitingFirst = false;
  private revision = 0;
  private started = false;
  private frame: MidiClockFrame = {
    enabled: false,
    bpm: 0,
    beat: 0,
    timestamp: 0,
    running: false,
    fresh: false,
    revision: 0,
    status: "off",
  };

  select(source: string): void {
    if (this.source === source) return;
    this.source = source;
    this.reset();
  }
  disconnect(device: string): void {
    if (device === this.source) this.reset();
  }
  private reset(): void {
    this.bpm = 0;
    this.pulses = 0;
    this.lastPulse = null;
    this.intervals = [];
    this.running = false;
    this.awaitingFirst = false;
    this.started = false;
    this.revision++;
  }
  receive(event: MidiSyncEvent, device: string, now: number): void {
    if (!this.source || device !== this.source || !Number.isFinite(now)) return;
    if (
      (event.type === "start" || event.type === "continue") &&
      this.lastPulse !== null &&
      now - this.lastPulse > MIDI_CLOCK_TIMEOUT_MS
    ) {
      this.lastPulse = null;
      this.intervals = [];
      this.bpm = 0;
    }
    switch (event.type) {
      case "start":
        this.pulses = 0;
        this.running = true;
        this.awaitingFirst = true;
        this.started = true;
        this.revision++;
        break;
      case "continue":
        this.running = true;
        this.awaitingFirst = true;
        this.started = true;
        this.revision++;
        break;
      case "stop":
        this.running = false;
        this.awaitingFirst = false;
        this.started = true;
        break;
      case "position":
        this.pulses = event.sixteenths * 6;
        this.awaitingFirst = this.running;
        this.revision++;
        break;
      case "clock": {
        if (this.lastPulse !== null) {
          const interval = now - this.lastPulse;
          if (interval <= 0) return;
          if (interval > MIDI_CLOCK_TIMEOUT_MS) {
            this.intervals = [];
            this.bpm = 0;
            // A clock gap loses absolute position. Require transport to resume.
            this.running = false;
            this.awaitingFirst = false;
          } else if (interval >= 2 && interval <= 250) {
            this.intervals.push(interval);
            if (this.intervals.length > 24) this.intervals.shift();
            if (this.intervals.length >= 6) {
              const sorted = [...this.intervals].sort((a, b) => a - b);
              const middle = Math.floor(sorted.length / 2);
              const median =
                sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
              this.bpm = 60000 / (median * 24);
            }
          }
        }
        this.lastPulse = now;
        if (this.running) {
          if (this.awaitingFirst) {
            this.awaitingFirst = false;
            this.revision++;
          } else this.pulses++;
        }
        break;
      }
    }
  }
  read(now: number): MidiClockFrame {
    const fresh = this.lastPulse !== null && now - this.lastPulse <= MIDI_CLOCK_TIMEOUT_MS;
    const running = this.running && !this.awaitingFirst && fresh;
    Object.assign(this.frame, {
      enabled: !!this.source,
      bpm: this.bpm,
      beat: this.pulses / 24,
      timestamp: this.lastPulse ?? now,
      running,
      fresh,
      revision: this.revision,
      status: !this.source
        ? "off"
        : this.lastPulse !== null && !fresh
          ? "lost"
          : running
            ? "playing"
            : this.started && !this.running
              ? "stopped"
              : "waiting",
    });
    return this.frame;
  }
}
export const midiClockInput = new MidiClockInput();
