import * as THREE from "three";
import {
  bandPeak,
  findPeaks,
  formatHz,
  formatWavelength,
  nearestNote,
  waveLevels,
} from "./instrument-math";
import {
  InstrumentPanel,
  PANEL_H,
  PANEL_W,
  createLayer,
  drawSevenSegment,
  labelFont,
  monoFont,
  type Layer,
} from "./instrument-panel";
import { meterLevel, type LazyView, type ViewFrame } from "./types";

type Box = { x: number; y: number; w: number; h: number };

// Panels, in canvas pixels.
const SPEC: Box = { x: 24, y: 84, w: 1216, h: 476 };
const SCOPE: Box = { x: 1256, y: 84, w: 640, h: 230 };
const WAVES: Box = { x: 1256, y: 330, w: 640, h: 230 };
const FALL: Box = { x: 24, y: 576, w: 796, h: 480 };
const STATS: Box = { x: 836, y: 576, w: 1060, h: 480 };
/** The plotting area inside a panel, leaving room for the title and axis lettering. */
const plot = (b: Box, left = 56): Box => ({
  x: b.x + left,
  y: b.y + 42,
  w: b.w - left - 18,
  h: b.h - 42 - 36,
});
const SPEC_PLOT = plot(SPEC);
const SCOPE_PLOT = plot(SCOPE, 18);
const FALL_PLOT = plot(FALL);

const COLS = 240;
const F_LO = 30;
const F_HI = 18000;
const FREQ_TICKS: ReadonlyArray<readonly [hz: number, label: string]> = [
  [50, "50"],
  [100, "100"],
  [200, "200"],
  [500, "500"],
  [1000, "1k"],
  [2000, "2k"],
  [5000, "5k"],
  [10000, "10k"],
];
const freqAt = (t: number) => F_LO * Math.pow(F_HI / F_LO, t);
const freqT = (hz: number) => Math.log(hz / F_LO) / Math.log(F_HI / F_LO);

/** Full scale sits at the top of the analyser range, so loud music keeps headroom. */
const INSTRUMENT_SPAN = 0.6;
const FALL_W = 256;
const FALL_H = 200;
const FALL_ROWS_PER_SECOND = 40;
const MAX_PEAKS = 4;
/** How often the lettered readouts change; faster than this they cannot be read. */
const READOUT_INTERVAL = 0.125;

/** Bands drawn as travelling waves, with the number of cycles shown for each. */
const WAVE_BANDS: ReadonlyArray<readonly [name: string, hz: number, cycles: number]> = [
  ["SUB", 40, 1.5],
  ["BASS", 100, 3],
  ["LO-MID", 400, 6],
  ["MID", 1600, 12],
  ["HIGH", 8000, 24],
];

const DEFAULTS = [
  new THREE.Color("#5cf2ff"),
  new THREE.Color("#ff4d7a"),
  new THREE.Color("#ffb347"),
];

function withAlpha(c: THREE.Color, a: number): string {
  const hex = c.getHex(THREE.SRGBColorSpace);
  return `rgba(${hex >> 16},${(hex >> 8) & 255},${hex & 255},${a})`;
}

/**
 * A bench of test instruments reading the music: a log-frequency spectrum
 * with its strongest peaks named, a triggered oscilloscope, a scrolling
 * spectrogram, each band drawn as a travelling wave with its wavelength in
 * air, and a block of numeric readouts (tempo, pitch, level, crest factor).
 *
 * Frames, grids and lettering are cached in one layer; each frame copies it
 * and draws the traces on top.
 */
export class LabView implements LazyView {
  private readonly panel = new InstrumentPanel();
  readonly group = this.panel.group;
  private readonly fixed: Layer = createLayer();
  private fixedKey = "";
  private readonly fall: Layer = createLayer(FALL_W, FALL_H);
  private fallRow: ImageData | null = null;
  private fallDebt = 0;
  private readonly lut = new Uint8Array(256 * 3);

  private readonly level = new Float32Array(COLS);
  private readonly held = new Float32Array(COLS);
  private readonly colBin = new Uint16Array(COLS);
  private readonly colLo = new Uint16Array(COLS);
  private readonly colHi = new Uint16Array(COLS);
  private boundsKey = "";
  private readonly waveLevel = new Float32Array(WAVE_BANDS.length);
  private readonly peakCols: number[] = [];
  private peakCount = 0;
  private readonly peakText: string[] = [];
  private scopeGain = 1;
  private readonly levels = { rmsDb: -Infinity, peakDb: -Infinity };

  private readoutClock = 0;
  private readonly readout = {
    header: "",
    tempo: " --- ",
    timing: "",
    dominant: "--",
    note: "--",
    wavelength: "--",
    centroid: "--",
    level: "--",
    crest: "--",
  };

  private primary = DEFAULTS[0]!;
  private accent = DEFAULTS[1]!;
  private secondary = DEFAULTS[2]!;
  private css = { primary: "", secondary: "", accent: "", dim: "", faint: "", text: "", off: "" };

  update(f: ViewFrame): void {
    const { dt, audio, opts } = f;
    this.panel.frameCamera(f, opts.labFullscreen);
    const ctx = this.panel.ctx;
    if (!ctx) return;

    const colors = opts.labUsePalette ? f.palette : DEFAULTS;
    const key = `${this.panel.fontsVersion}|${colors.map((c) => c.getHexString()).join()}`;
    if (key !== this.fixedKey) {
      this.fixedKey = key;
      this.primary = colors[0]!;
      this.accent = colors[1]!;
      this.secondary = colors[2]!;
      this.css = {
        primary: withAlpha(this.primary, 1),
        secondary: withAlpha(this.secondary, 1),
        accent: withAlpha(this.accent, 1),
        dim: withAlpha(this.primary, 0.72),
        faint: withAlpha(this.primary, 0.2),
        text: withAlpha(this.primary, 0.92),
        off: withAlpha(this.primary, 0.07),
      };
      this.buildLut();
      this.drawFixed();
    }

    // An instrument shows the measured spectrum, not the contrast-shaped one.
    const bins = audio.rawBins ?? audio.bins;
    const binHz =
      audio.timing.fftWindowMs > 0
        ? 1000 / audio.timing.fftWindowMs
        : 24000 / Math.max(1, bins.length);
    const amp = Math.max(0.05, opts.labAmplitude);
    this.analyse(bins, binHz, amp, dt);

    this.readoutClock -= dt;
    if (this.readoutClock <= 0) {
      this.readoutClock = READOUT_INTERVAL;
      this.refreshReadouts(f, bins, binHz);
    }

    ctx.globalAlpha = 1;
    ctx.drawImage(this.fixed.canvas, 0, 0);
    this.drawSpectrum(ctx, opts.labPeaks);
    this.drawScope(ctx, f, amp);
    this.drawWaves(ctx, f, bins, binHz, amp);
    this.drawWaterfall(ctx, dt);
    this.drawStats(ctx, f);
    this.panel.commit();
  }

  // -------------------------------------------------------------- analysis

  private analyse(bins: Uint8Array, binHz: number, amp: number, dt: number): void {
    const n = bins.length;
    const boundsKey = `${n}|${binHz.toFixed(3)}`;
    if (boundsKey !== this.boundsKey) {
      this.boundsKey = boundsKey;
      for (let i = 0; i < COLS; i++) {
        const lo = Math.floor(freqAt(i / COLS) / binHz);
        const hi = Math.ceil(freqAt((i + 1) / COLS) / binHz);
        this.colLo[i] = Math.max(1, Math.min(Math.max(0, n - 1), lo));
        this.colHi[i] = Math.max(this.colLo[i]!, Math.min(Math.max(0, n - 1), hi));
      }
    }
    const release = Math.min(1, dt * 10);
    const heldFall = dt * 0.22;
    for (let i = 0; i < COLS; i++) {
      let best = 0;
      let bestBin = this.colLo[i]!;
      if (n > 1 && this.colHi[i]! - this.colLo[i]! <= 1) {
        // Narrower than one FFT bin (the bass end): interpolate between bins
        // so the trace is a curve, not a staircase.
        const at = Math.min(n - 1.001, Math.max(1, freqAt((i + 0.5) / COLS) / binHz));
        const lo = Math.floor(at);
        best = bins[lo]! + (bins[lo + 1]! - bins[lo]!) * (at - lo);
        bestBin = Math.round(at);
      } else if (n > 0) {
        for (let b = this.colLo[i]!; b <= this.colHi[i]!; b++) {
          if (bins[b]! > best) {
            best = bins[b]!;
            bestBin = b;
          }
        }
      }
      this.colBin[i] = bestBin;
      const raw = Math.min(1, meterLevel(best, INSTRUMENT_SPAN) * amp);
      const current = this.level[i]!;
      this.level[i] = raw > current ? raw : current + (raw - current) * release;
      this.held[i] = Math.max(this.level[i]!, this.held[i]! - heldFall);
    }
  }

  private refreshReadouts(f: ViewFrame, bins: Uint8Array, binHz: number): void {
    const { audio } = f;
    const r = this.readout;
    const n = bins.length;

    // Strongest bin above the subsonic range, refined between bins by a parabola.
    let top = 0;
    let topBin = 0;
    for (let b = Math.max(1, Math.ceil(F_LO / binHz)); b < n - 1; b++) {
      if (bins[b]! > top) {
        top = bins[b]!;
        topBin = b;
      }
    }
    let dominant = 0;
    if (top > 110 && topBin > 0) {
      const a = bins[topBin - 1]!;
      const c = bins[topBin + 1]!;
      const curve = a - 2 * top + c;
      dominant = (topBin + (curve < 0 ? (0.5 * (a - c)) / curve : 0)) * binHz;
    }
    const note = nearestNote(dominant);
    r.dominant = formatHz(dominant);
    r.note = note ? `${note.name} ${note.cents >= 0 ? "+" : "-"}${Math.abs(note.cents)}c` : "--";
    r.wavelength = formatWavelength(dominant);
    r.centroid = top > 110 ? formatHz(audio.centroid * n * binHz) : "--";

    if (audio.wave && audio.wave.length > 0) {
      waveLevels(audio.wave, this.levels);
      const { rmsDb, peakDb } = this.levels;
      r.level = Number.isFinite(rmsDb) ? `${rmsDb.toFixed(1)} dBFS` : "-inf dBFS";
      r.crest =
        Number.isFinite(rmsDb) && Number.isFinite(peakDb)
          ? `${(peakDb - rmsDb).toFixed(1)} dB`
          : "--";
    } else {
      r.level = "--";
      r.crest = "--";
    }

    const locked = f.bpmConfident && audio.bpm > 0;
    r.tempo = locked ? audio.bpm.toFixed(1).padStart(5, " ") : " --- ";
    r.timing = locked
      ? `${(60000 / audio.bpm).toFixed(0)} ms/beat   ${(240 / audio.bpm).toFixed(2)} s/bar   ${(audio.bpm / 60).toFixed(2)} Hz`
      : "searching for tempo";

    const sampleRate = binHz * n * 2;
    const t = Math.max(0, f.time);
    const mm = String(Math.floor(t / 60) % 100).padStart(2, "0");
    const ss = (t % 60).toFixed(1).padStart(4, "0");
    r.header =
      n > 0
        ? `FS ${(sampleRate / 1000).toFixed(1)} kHz   FFT ${n * 2}   BIN ${binHz.toFixed(1)} Hz   T+ ${mm}:${ss}`
        : `NO SIGNAL   T+ ${mm}:${ss}`;

    this.peakCount = findPeaks(this.level, this.peakCols, MAX_PEAKS, 16, 0.3);
    for (let p = 0; p < this.peakCount; p++) {
      const hz = this.colBin[this.peakCols[p]!]! * binHz;
      const name = nearestNote(hz)?.name;
      this.peakText[p] = name ? `${formatHz(hz)}  ${name}` : formatHz(hz);
    }
  }

  // ---------------------------------------------------------------- traces

  private drawSpectrum(ctx: CanvasRenderingContext2D, labelPeaks: boolean): void {
    const p = SPEC_PLOT;
    const base = p.y + p.h;
    const xAt = (i: number) => p.x + (i / (COLS - 1)) * p.w;

    // Slow-falling envelope of recent maxima.
    ctx.strokeStyle = this.css.secondary;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (let i = 0; i < COLS; i++) {
      const y = base - this.held[i]! * p.h;
      if (i === 0) ctx.moveTo(xAt(i), y);
      else ctx.lineTo(xAt(i), y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    const fill = ctx.createLinearGradient(0, p.y, 0, base);
    fill.addColorStop(0, withAlpha(this.primary, 0.5));
    fill.addColorStop(1, withAlpha(this.primary, 0.02));
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(p.x, base);
    for (let i = 0; i < COLS; i++) ctx.lineTo(xAt(i), base - this.level[i]! * p.h);
    ctx.lineTo(p.x + p.w, base);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = this.css.primary;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i < COLS; i++) {
      const y = base - this.level[i]! * p.h;
      if (i === 0) ctx.moveTo(xAt(i), y);
      else ctx.lineTo(xAt(i), y);
    }
    ctx.stroke();

    if (!labelPeaks) return;
    ctx.font = monoFont(19);
    ctx.textBaseline = "alphabetic";
    for (let k = 0; k < this.peakCount; k++) {
      const col = this.peakCols[k]!;
      const x = xAt(col);
      const y = base - this.level[col]! * p.h;
      const labelY = Math.max(p.y + 22, y - 26 - (k % 2) * 24);
      ctx.strokeStyle = this.css.secondary;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y - 4);
      ctx.lineTo(x, labelY + 5);
      ctx.stroke();
      ctx.fillStyle = this.css.secondary;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
      const right = x > p.x + p.w - 190;
      ctx.textAlign = right ? "right" : "left";
      ctx.fillText(this.peakText[k] ?? "", x + (right ? -8 : 8), labelY);
    }
  }

  private drawScope(ctx: CanvasRenderingContext2D, f: ViewFrame, amp: number): void {
    const p = SCOPE_PLOT;
    const mid = p.y + p.h / 2;
    const wave = f.audio.wave;
    const points = 320;
    ctx.strokeStyle = this.css.primary;
    ctx.lineWidth = 2.2;
    ctx.lineJoin = "round";
    ctx.beginPath();
    if (wave && wave.length >= 512) {
      // Trigger on a rising zero crossing so a steady tone stands still.
      const span = Math.min(1024, wave.length >> 1);
      let start = 0;
      for (let i = 1; i < wave.length - span; i++) {
        if (wave[i - 1]! < 128 && wave[i]! >= 128) {
          start = i;
          break;
        }
      }
      let peak = 0.02;
      for (let i = 0; i < span; i++) {
        const v = Math.abs(wave[start + i]! - 128) / 128;
        if (v > peak) peak = v;
      }
      // Auto-range, but only up to 6×, so a quiet room still looks quiet.
      const want = Math.min(6, 0.8 / peak);
      this.scopeGain += (want - this.scopeGain) * Math.min(1, f.dt * 2);
      const gain = this.scopeGain * amp;
      for (let k = 0; k < points; k++) {
        const v = (wave[start + Math.floor((k / (points - 1)) * (span - 1))]! - 128) / 128;
        const y = mid - Math.max(-1, Math.min(1, v * gain)) * (p.h / 2 - 4);
        const x = p.x + (k / (points - 1)) * p.w;
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    } else {
      // No waveform (ambient source): sketch one from the band levels.
      const { bass, mid: m, high } = f.audio;
      for (let k = 0; k < points; k++) {
        const t = k / (points - 1);
        const v =
          Math.sin(t * 12 + f.time * 3) * bass * 0.6 +
          Math.sin(t * 47 + f.time * 7) * m * 0.3 +
          Math.sin(t * 160 + f.time * 13) * high * 0.2;
        const y = mid - Math.max(-1, Math.min(1, v * amp)) * (p.h / 2 - 4);
        const x = p.x + t * p.w;
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }

  private drawWaves(
    ctx: CanvasRenderingContext2D,
    f: ViewFrame,
    bins: Uint8Array,
    binHz: number,
    amp: number,
  ): void {
    const x0 = WAVES.x + 210;
    const x1 = WAVES.x + WAVES.w - 128;
    const rowH = (WAVES.h - 50) / WAVE_BANDS.length;
    const points = 110;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    for (let w = 0; w < WAVE_BANDS.length; w++) {
      const [, hz, cycles] = WAVE_BANDS[w]!;
      const raw = Math.min(1, meterLevel(bandPeak(bins, binHz, hz), INSTRUMENT_SPAN) * amp);
      const current = this.waveLevel[w]!;
      this.waveLevel[w] = raw > current ? raw : current + (raw - current) * Math.min(1, f.dt * 7);
      const height = (0.06 + this.waveLevel[w]! * 0.94) * (rowH / 2 - 3);
      const cy = WAVES.y + 44 + rowH * (w + 0.5);
      const phase = f.time * (2 + Math.sqrt(cycles) * 2.2);
      ctx.strokeStyle = w % 2 ? this.css.secondary : this.css.primary;
      ctx.globalAlpha = 0.35 + this.waveLevel[w]! * 0.65;
      ctx.beginPath();
      for (let k = 0; k < points; k++) {
        const t = k / (points - 1);
        const y = cy - Math.sin(t * cycles * Math.PI * 2 - phase) * height;
        const x = x0 + t * (x1 - x0);
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private drawWaterfall(ctx: CanvasRenderingContext2D, dt: number): void {
    const layer = this.fall.ctx;
    if (layer) {
      this.fallRow ??= layer.createImageData?.(FALL_W, 1) ?? null;
      const row = this.fallRow;
      this.fallDebt = Math.min(4, this.fallDebt + dt * FALL_ROWS_PER_SECOND);
      if (row?.data) {
        while (this.fallDebt >= 1) {
          this.fallDebt -= 1;
          layer.drawImage(this.fall.canvas, 0, 1);
          const data = row.data;
          for (let x = 0; x < FALL_W; x++) {
            const v = Math.round(this.level[Math.floor((x * COLS) / FALL_W)]! * 255) * 3;
            data[x * 4] = this.lut[v]!;
            data[x * 4 + 1] = this.lut[v + 1]!;
            data[x * 4 + 2] = this.lut[v + 2]!;
            data[x * 4 + 3] = 255;
          }
          layer.putImageData(row, 0, 0);
        }
      }
    }
    const p = FALL_PLOT;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.fall.canvas, p.x, p.y, p.w, p.h);
  }

  private drawStats(ctx: CanvasRenderingContext2D, f: ViewFrame): void {
    const r = this.readout;
    const { x, y, w } = STATS;
    ctx.textBaseline = "alphabetic";

    ctx.textAlign = "right";
    ctx.font = monoFont(19);
    ctx.fillStyle = this.css.text;
    ctx.fillText(r.header, PANEL_W - 26, 52);

    drawSevenSegment(ctx, r.tempo, x + 40, y + 70, 92, this.css.primary, this.css.off);

    // Beat phase: a bar that fills across each beat.
    const bx = x + 500;
    const bw = w - 540;
    const locked = f.bpmConfident && f.audio.bpm > 0;
    ctx.fillStyle = locked ? this.css.secondary : this.css.dim;
    ctx.fillRect(bx, y + 88, bw * (locked ? f.beatPhase : 0), 20);
    ctx.fillStyle = this.css.accent;
    ctx.globalAlpha = locked ? Math.max(0, 1 - f.beatPhase * 3) : 0;
    ctx.fillRect(bx, y + 80, bw, 4);
    ctx.globalAlpha = 1;
    ctx.textAlign = "left";
    ctx.font = monoFont(21);
    ctx.fillStyle = this.css.text;
    ctx.fillText(r.timing, bx, y + 146);
    ctx.textAlign = "right";
    ctx.fillStyle = locked ? this.css.secondary : this.css.dim;
    ctx.font = labelFont(16);
    ctx.fillText(locked ? "LOCKED" : "UNLOCKED", bx + bw, y + 68);

    const values = [r.dominant, r.note, r.wavelength, r.centroid, r.level, r.crest];
    ctx.textAlign = "left";
    ctx.font = monoFont(40);
    ctx.fillStyle = this.css.primary;
    for (let i = 0; i < 6; i++) {
      ctx.fillText(values[i]!, x + 40 + (i % 3) * 340, y + 262 + Math.floor(i / 3) * 96);
    }

    const bars = [f.audio.bass, f.audio.mid, f.audio.high, f.audio.onsetStrength];
    for (let i = 0; i < 4; i++) {
      const barX = x + 40 + i * 255;
      const v = Math.max(0, Math.min(1, bars[i]!));
      ctx.fillStyle = i === 3 ? this.css.accent : this.css.secondary;
      ctx.fillRect(barX, y + 438, 215 * v, 12);
    }
  }

  // ----------------------------------------------------------------- fixed

  private buildLut(): void {
    const stops: Array<[number, number, number, number]> = [
      [0, 2, 5, 9],
      [0.3, ...this.rgb(this.accent, 0.25)],
      [0.65, ...this.rgb(this.primary, 0.6)],
      [0.9, ...this.rgb(this.secondary, 0.85)],
      [1, 255, 240, 210],
    ];
    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      let s = 1;
      while (s < stops.length - 1 && t > stops[s]![0]) s++;
      const a = stops[s - 1]!;
      const b = stops[s]!;
      const k = (t - a[0]) / (b[0] - a[0] || 1);
      for (let c = 0; c < 3; c++) this.lut[i * 3 + c] = a[c + 1]! + (b[c + 1]! - a[c + 1]!) * k;
    }
  }

  private rgb(c: THREE.Color, scale: number): [number, number, number] {
    const hex = c.getHex(THREE.SRGBColorSpace);
    return [(hex >> 16) * scale, ((hex >> 8) & 255) * scale, (hex & 255) * scale];
  }

  private frame(ctx: CanvasRenderingContext2D, b: Box, title: string, tag: string): void {
    ctx.fillStyle = "rgba(4,10,16,0.9)";
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = this.css.faint;
    ctx.lineWidth = 1;
    ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
    // Corner brackets.
    ctx.strokeStyle = this.css.primary;
    ctx.lineWidth = 2;
    const c = 16;
    for (const [cx, cy, sx, sy] of [
      [b.x, b.y, 1, 1],
      [b.x + b.w, b.y, -1, 1],
      [b.x, b.y + b.h, 1, -1],
      [b.x + b.w, b.y + b.h, -1, -1],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(cx + sx * c, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + sy * c);
      ctx.stroke();
    }
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.font = labelFont(16);
    ctx.fillStyle = this.css.primary;
    ctx.fillText(title, b.x + 18, b.y + 27);
    ctx.textAlign = "right";
    ctx.font = monoFont(18);
    ctx.fillStyle = this.css.dim;
    ctx.fillText(tag, b.x + b.w - 18, b.y + 27);
  }

  private frequencyAxis(ctx: CanvasRenderingContext2D, p: Box, lines: boolean): void {
    ctx.font = monoFont(18);
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    for (const [hz, label] of FREQ_TICKS) {
      const x = Math.round(p.x + freqT(hz) * p.w) + 0.5;
      if (lines) {
        ctx.strokeStyle = this.css.faint;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, p.y);
        ctx.lineTo(x, p.y + p.h);
        ctx.stroke();
      }
      ctx.fillStyle = this.css.dim;
      ctx.fillText(label, x, p.y + p.h + 22);
    }
  }

  private drawFixed(): void {
    const ctx = this.fixed.ctx;
    if (!ctx) return;
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#020509";
    ctx.fillRect(0, 0, PANEL_W, PANEL_H);
    // Fine background graticule.
    ctx.fillStyle = withAlpha(this.primary, 0.035);
    for (let gx = 0; gx < PANEL_W; gx += 40) ctx.fillRect(gx, 0, 1, PANEL_H);
    for (let gy = 0; gy < PANEL_H; gy += 40) ctx.fillRect(0, gy, PANEL_W, 1);

    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.font = labelFont(22);
    ctx.fillStyle = this.css.primary;
    ctx.fillText("SPECTRUM AURA", 26, 54);
    const titleEnd = 26 + (ctx.measureText("SPECTRUM AURA").width || 280);
    ctx.fillStyle = this.css.dim;
    ctx.fillText("/ SIGNAL LAB", titleEnd + 16, 54);
    ctx.fillStyle = this.css.faint;
    ctx.fillRect(24, 70, PANEL_W - 48, 1);

    this.frame(ctx, SPEC, "SPECTRUM", "30 Hz - 18 kHz  LOG");
    const sp = SPEC_PLOT;
    this.frequencyAxis(ctx, sp, true);
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.font = monoFont(18);
    for (let q = 0; q <= 4; q++) {
      const y = Math.round(sp.y + sp.h - (q / 4) * sp.h) + 0.5;
      ctx.strokeStyle = this.css.faint;
      ctx.beginPath();
      ctx.moveTo(sp.x, y);
      ctx.lineTo(sp.x + sp.w, y);
      ctx.stroke();
      ctx.fillStyle = this.css.dim;
      ctx.fillText(String(q * 25), sp.x - 10, y);
    }

    this.frame(ctx, SCOPE, "OSCILLOSCOPE", "TRIG RISING  AUTO");
    const sc = SCOPE_PLOT;
    ctx.strokeStyle = this.css.faint;
    ctx.lineWidth = 1;
    for (let d = 0; d <= 8; d++) {
      const gx = Math.round(sc.x + (d / 8) * sc.w) + 0.5;
      ctx.beginPath();
      ctx.moveTo(gx, sc.y);
      ctx.lineTo(gx, sc.y + sc.h);
      ctx.stroke();
    }
    for (let d = 0; d <= 4; d++) {
      const gy = Math.round(sc.y + (d / 4) * sc.h) + 0.5;
      ctx.strokeStyle = d === 2 ? this.css.dim : this.css.faint;
      ctx.beginPath();
      ctx.moveTo(sc.x, gy);
      ctx.lineTo(sc.x + sc.w, gy);
      ctx.stroke();
    }

    this.frame(ctx, WAVES, "BAND WAVES", "WAVELENGTH IN AIR");
    const rowH = (WAVES.h - 50) / WAVE_BANDS.length;
    ctx.textBaseline = "middle";
    for (let w = 0; w < WAVE_BANDS.length; w++) {
      const [name, hz] = WAVE_BANDS[w]!;
      const cy = WAVES.y + 44 + rowH * (w + 0.5);
      ctx.textAlign = "left";
      ctx.font = labelFont(16);
      ctx.fillStyle = this.css.dim;
      ctx.fillText(name, WAVES.x + 18, cy);
      ctx.font = monoFont(18);
      ctx.fillStyle = this.css.text;
      ctx.fillText(formatHz(hz), WAVES.x + 116, cy);
      ctx.textAlign = "right";
      ctx.fillText(formatWavelength(hz), WAVES.x + WAVES.w - 18, cy);
    }

    this.frame(ctx, FALL, "WATERFALL", "5 s HISTORY");
    const fp = FALL_PLOT;
    this.frequencyAxis(ctx, fp, false);
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.font = monoFont(18);
    ctx.fillStyle = this.css.dim;
    for (let s = 0; s <= 5; s++) {
      ctx.fillText(
        s === 0 ? "now" : `-${s}s`,
        fp.x - 10,
        fp.y + (s / 5) * fp.h + (s === 0 ? 8 : 0),
      );
    }

    this.frame(ctx, STATS, "READOUTS", "LIVE");
    const { x, y, w } = STATS;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.font = labelFont(16);
    ctx.fillStyle = this.css.dim;
    ctx.fillText("TEMPO", x + 40, y + 58);
    ctx.fillText("BPM", x + 410, y + 162);
    ctx.fillText("BEAT PHASE", x + 500, y + 68);
    ctx.strokeStyle = this.css.faint;
    ctx.strokeRect(x + 500 - 0.5, y + 88 - 0.5, w - 540 + 1, 21);
    ctx.fillStyle = this.css.faint;
    ctx.fillRect(x + 28, y + 190, w - 56, 1);
    const labels = ["DOMINANT", "NOTE", "WAVELENGTH", "CENTROID", "LEVEL RMS", "CREST FACTOR"];
    ctx.fillStyle = this.css.dim;
    for (let i = 0; i < 6; i++) {
      ctx.fillText(labels[i]!, x + 40 + (i % 3) * 340, y + 222 + Math.floor(i / 3) * 96);
    }
    ctx.fillStyle = this.css.faint;
    ctx.fillRect(x + 28, y + 392, w - 56, 1);
    const barLabels = ["LOW", "MID", "HIGH", "ONSET"];
    for (let i = 0; i < 4; i++) {
      const barX = x + 40 + i * 255;
      ctx.fillStyle = this.css.dim;
      ctx.fillText(barLabels[i]!, barX, y + 426);
      ctx.fillStyle = this.css.off;
      ctx.fillRect(barX, y + 438, 215, 12);
    }
  }

  dispose(): void {
    this.panel.dispose();
  }
}
