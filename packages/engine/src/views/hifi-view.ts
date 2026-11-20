import { NeedleBallistics, VU_SCALE, bandPeak, vuPosition, waveLevels } from "./instrument-math";
import {
  InstrumentPanel,
  PANEL_H,
  PANEL_W,
  createLayer,
  cssColor,
  drawLamp,
  drawSevenSegment,
  labelFont,
  monoFont,
  roundRect,
  type Layer,
} from "./instrument-panel";
import { meterLevel, type LazyView, type ViewFrame } from "./types";

/** Analyser bands: ISO two-thirds-octave centres, as printed on the glass. */
const BANDS_HZ = [40, 63, 100, 160, 250, 400, 630, 1000, 1600, 2500, 4000, 6300, 10000, 16000];
const BAND_LABELS = "40 63 100 160 250 400 630 1k 1.6k 2.5k 4k 6.3k 10k 16k".split(" ");
const BANDS = BANDS_HZ.length;
const SEGMENTS = 14;
/** Scale lettering beside the analyser, by segment row counted from the bottom. */
const DB_ROWS: ReadonlyArray<readonly [row: number, label: string]> = [
  [14, "+6"],
  [12, "+3"],
  [10, "0"],
  [8, "-5"],
  [6, "-10"],
  [4, "-20"],
  [2, "-30"],
];

// Layout, in canvas pixels.
const UNIT_X = 60;
const UNIT_W = PANEL_W - UNIT_X * 2;
const AMP = { y: 36, h: 400 };
const VU = { w: 600, h: 290, y: 76, xs: [350, 970] as const, labels: ["LEFT", "RIGHT"] as const };
const NEEDLE_R = 290;
const NEEDLE_SWEEP = 42;
const EQ = { y: 452, h: 410 };
const GLASS = { x: 190, y: 486, w: 1330, h: 342 };
const SEG = { w: 66, h: 13, pitchY: 19.4, pad: 30 };
const TUNER = { y: 874, h: 170 };
const DIAL = { x: 190, y: 900, w: 1130, h: 118, pad: 40, lo: 60, hi: 180 };
const COUNTER = { x: 1350, y: 900, w: 300, h: 118 };

/** Full scale sits at the top of the analyser range, so loud music keeps headroom. */
const INSTRUMENT_SPAN = 0.6;
/** Lowest RMS level, in dBFS, the VU reference will assume as "full scale". */
const VU_REFERENCE_FLOOR = -30;
const DEFAULT_COLORS = { low: "#8cf0ff", mid: "#ffb84a", top: "#ff4a3a" };
const FACE_TEXT = "#e4e6ea";
const FACE_DIM = "#a3a7ae";

const bandX = (b: number) =>
  GLASS.x + SEG.pad + ((GLASS.w - SEG.pad * 2) / BANDS) * (b + 0.5) - SEG.w / 2;
const segY = (row: number) => GLASS.y + GLASS.h - 52 - row * SEG.pitchY;
const dialX = (bpm: number) =>
  DIAL.x + DIAL.pad + ((bpm - DIAL.lo) / (DIAL.hi - DIAL.lo)) * (DIAL.w - DIAL.pad * 2);

/**
 * A rack of seventies hi-fi separates. Top: a power amp with left and right
 * moving-coil VU meters whose needles have real mass. Middle: a fluorescent spectrum
 * analyser with segment bars and falling peak-hold markers. Bottom: a tuner
 * whose dial pointer finds the tempo instead of a radio station.
 *
 * Faceplates, scales and lettering are drawn once into a cached layer; each
 * frame copies that layer and draws only what moves.
 */
export class HifiView implements LazyView {
  private readonly panel = new InstrumentPanel();
  readonly group = this.panel.group;
  private readonly fixed: Layer = createLayer();
  private fixedKey = "";
  private readonly needles = [new NeedleBallistics(), new NeedleBallistics()];
  private readonly peakLed = [0, 0];
  private readonly levels = { rmsDb: -Infinity, peakDb: -Infinity };
  private readonly channelDb = [-20, -20];
  private vuReference = VU_REFERENCE_FLOOR;
  private readonly level = new Float32Array(BANDS);
  private readonly peak = new Float32Array(BANDS);
  private readonly hold = new Float32Array(BANDS);
  private pointerBpm = 120;
  private beatGlow = 0;
  private lastPhase = 0;
  private colors = DEFAULT_COLORS;

  constructor() {
    this.panel.raiseDisc(1712, AMP.y + 170, 72, 0.32);
    for (const x of [1600, 1690, 1780]) this.panel.raiseDisc(x, EQ.y + 338, 30, 0.2);
  }

  update(f: ViewFrame): void {
    const { dt, opts } = f;
    this.panel.frameCamera(f, opts.hifiFullscreen);
    const ctx = this.panel.ctx;
    if (!ctx) return;

    const usePalette = opts.hifiUsePalette;
    const key = `${this.panel.fontsVersion}|${usePalette ? f.palette.map(cssColor).join() : ""}`;
    if (key !== this.fixedKey) {
      this.fixedKey = key;
      this.colors = usePalette
        ? { low: cssColor(f.palette[2]), mid: cssColor(f.palette[0]), top: "#ffffff" }
        : DEFAULT_COLORS;
      this.drawFixed();
    }
    ctx.globalAlpha = 1;
    ctx.drawImage(this.fixed.canvas, 0, 0);

    const amp = Math.max(0.05, opts.hifiAmplitude);
    // Analyser first: the needles read the band levels it has just updated.
    this.drawAnalyser(ctx, f, amp);
    this.drawMeters(ctx, f);
    this.drawTuner(ctx, f);

    this.lastPhase = f.beatPhase;
    this.beatGlow = Math.max(0, this.beatGlow - dt * 5);
    this.panel.commit();
  }

  // ---------------------------------------------------------------- moving

  /**
   * Fills `channelDb` with the left and right levels in VU. A stereo source
   * gives each needle its own channel; a mono one moves both together. A VU
   * meter reads average level, so this is the RMS of the waveform.
   *
   * Both needles are read against one shared reference that follows the
   * louder channel's recent peaks, the way a listener sets the record level
   * once for a tape: music swings the needles up to 0 VU whatever the input
   * level, and the difference between left and right is kept. The reference
   * never drops below a floor, so a quiet room still rests on the stop.
   */
  private readChannels(f: ViewFrame): void {
    const { audio, opts, dt } = f;
    const trim = 20 * Math.log10(Math.max(0.05, opts.hifiAmplitude));
    const sides = audio.stereo ? [audio.stereo.left, audio.stereo.right] : [audio.wave, audio.wave];
    if (!sides[0] || sides[0].length === 0) {
      // No waveform (the synthetic ambient source): use the analyser bars.
      let level = 0;
      for (let b = 0; b < BANDS; b++) level = Math.max(level, this.level[b]!);
      this.channelDb[0] = this.channelDb[1] = -20 + level * 23;
      return;
    }
    let loudest = -Infinity;
    for (let m = 0; m < 2; m++) {
      waveLevels(sides[m]!, this.levels);
      this.channelDb[m] = this.levels.rmsDb;
      loudest = Math.max(loudest, this.levels.rmsDb);
    }
    this.vuReference = Math.max(VU_REFERENCE_FLOOR, loudest, this.vuReference - dt * 1.5);
    for (let m = 0; m < 2; m++) this.channelDb[m] = this.channelDb[m]! - this.vuReference + trim;
  }

  private drawMeters(ctx: CanvasRenderingContext2D, f: ViewFrame): void {
    const { dt } = f;
    this.readChannels(f);
    for (let m = 0; m < 2; m++) {
      const at = this.needles[m]!.step(vuPosition(this.channelDb[m]!), dt);
      const wx = VU.xs[m]!;
      const cx = wx + VU.w / 2;
      const py = VU.y + VU.h + 70;
      const a = ((-NEEDLE_SWEEP + NEEDLE_SWEEP * 2 * at) * Math.PI) / 180;
      const tipX = cx + Math.sin(a) * (NEEDLE_R + 26);
      const tipY = py - Math.cos(a) * (NEEDLE_R + 26);

      ctx.save();
      ctx.beginPath();
      ctx.rect(wx, VU.y, VU.w, VU.h);
      ctx.clip();
      ctx.lineCap = "round";
      // The needle's shadow on the dial card, then the needle.
      ctx.strokeStyle = "rgba(60,40,0,0.22)";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(cx + 7, py + 5);
      ctx.lineTo(tipX + 7, tipY + 5);
      ctx.stroke();
      ctx.strokeStyle = "#191512";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx, py);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();
      ctx.restore();

      // Peak lamp: lights above +2 VU and lingers so a short hit is seen.
      if (at > vuPosition(2)) this.peakLed[m] = 1;
      else this.peakLed[m] = Math.max(0, this.peakLed[m]! - dt * 2.5);
      drawLamp(ctx, wx + VU.w - 40, VU.y + 40, 9, "#ff3b2f", this.peakLed[m]!);
    }
  }

  private drawAnalyser(ctx: CanvasRenderingContext2D, f: ViewFrame, amp: number): void {
    const { audio, dt, opts } = f;
    // An instrument shows the measured spectrum, not the contrast-shaped one.
    const bins = audio.rawBins ?? audio.bins;
    const binHz =
      audio.timing.fftWindowMs > 0
        ? 1000 / audio.timing.fftWindowMs
        : 24000 / Math.max(1, bins.length);
    for (let b = 0; b < BANDS; b++) {
      const raw = Math.min(
        1,
        meterLevel(bandPeak(bins, binHz, BANDS_HZ[b]!), INSTRUMENT_SPAN) * amp,
      );
      const current = this.level[b]!;
      this.level[b] = raw > current ? raw : current + (raw - current) * Math.min(1, dt * 9);
      if (this.level[b]! >= this.peak[b]!) {
        this.peak[b] = this.level[b]!;
        this.hold[b] = 0.8;
      } else {
        this.hold[b] = this.hold[b]! - dt;
        if (this.hold[b]! <= 0) this.peak[b] = Math.max(0, this.peak[b]! - dt * 0.9);
      }
    }
    // Draw one colour zone at a time so fillStyle changes three times, not 196.
    const zones: ReadonlyArray<readonly [from: number, to: number, color: string]> = [
      [1, 10, this.colors.low],
      [11, 12, this.colors.mid],
      [13, 14, this.colors.top],
    ];
    for (const [from, to, color] of zones) {
      ctx.fillStyle = color;
      for (let b = 0; b < BANDS; b++) {
        const lit = Math.round(this.level[b]! * SEGMENTS);
        const x = bandX(b);
        for (let row = from; row <= Math.min(to, lit); row++) {
          ctx.fillRect(x, segY(row), SEG.w, SEG.h);
        }
        if (opts.hifiPeakHold) {
          const peakRow = Math.round(this.peak[b]! * SEGMENTS);
          if (peakRow > lit && peakRow >= from && peakRow <= to) {
            ctx.fillRect(x, segY(peakRow), SEG.w, SEG.h);
          }
        }
      }
    }
    drawLamp(ctx, 1578, EQ.y + 222, 7, "#ffb84a", opts.hifiPeakHold ? 1 : 0);
  }

  private drawTuner(ctx: CanvasRenderingContext2D, f: ViewFrame): void {
    const { audio, dt } = f;
    const locked = f.bpmConfident && audio.bpm > 0;
    if (locked) {
      const target = Math.max(DIAL.lo, Math.min(DIAL.hi, audio.bpm));
      this.pointerBpm += (target - this.pointerBpm) * Math.min(1, dt * 3);
    }
    const beat = locked ? f.beatPhase < this.lastPhase && this.lastPhase > 0.5 : audio.beat;
    if (beat) this.beatGlow = 1;

    // Dial pointer: a lit red hairline with a soft halo.
    const x = dialX(this.pointerBpm);
    ctx.fillStyle = "rgba(255,59,47,0.18)";
    ctx.fillRect(x - 9, DIAL.y + 4, 18, DIAL.h - 8);
    ctx.fillStyle = "rgba(255,59,47,0.4)";
    ctx.fillRect(x - 4, DIAL.y + 4, 8, DIAL.h - 8);
    ctx.fillStyle = "#ff6a55";
    ctx.fillRect(x - 1.5, DIAL.y + 4, 3, DIAL.h - 8);

    drawSevenSegment(
      ctx,
      locked ? audio.bpm.toFixed(1).padStart(5, " ") : " --- ",
      COUNTER.x + 34,
      COUNTER.y + 24,
      70,
      this.colors.low,
      "rgba(140,240,255,0.06)",
    );
    drawLamp(ctx, 1700, TUNER.y + 62, 8, "#58ff8a", locked ? 1 : 0);
    drawLamp(ctx, 1700, TUNER.y + 112, 8, "#ff3b2f", this.beatGlow);
  }

  // ----------------------------------------------------------------- fixed

  private drawFixed(): void {
    const ctx = this.fixed.ctx;
    if (!ctx) return;
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#050506";
    ctx.fillRect(0, 0, PANEL_W, PANEL_H);
    this.faceplate(ctx, AMP.y, AMP.h);
    this.faceplate(ctx, EQ.y, EQ.h);
    this.faceplate(ctx, TUNER.y, TUNER.h);
    this.fixedAmp(ctx);
    this.fixedAnalyser(ctx);
    this.fixedTuner(ctx);
  }

  private faceplate(ctx: CanvasRenderingContext2D, y: number, h: number): void {
    const body = ctx.createLinearGradient(0, y, 0, y + h);
    body.addColorStop(0, "#5a5d63");
    body.addColorStop(0.04, "#3a3c41");
    body.addColorStop(0.96, "#2b2d31");
    body.addColorStop(1, "#131416");
    ctx.fillStyle = body;
    roundRect(ctx, UNIT_X, y, UNIT_W, h, 10);
    ctx.fill();
    // Brushed-metal grain: faint horizontal hairlines.
    ctx.save();
    roundRect(ctx, UNIT_X, y, UNIT_W, h, 10);
    ctx.clip();
    for (let i = 0; i < h; i += 2) {
      const shade = (Math.sin(i * 12.9898 + y) * 43758.5453) % 1;
      ctx.fillStyle = `rgba(255,255,255,${0.012 + Math.abs(shade) * 0.022})`;
      ctx.fillRect(UNIT_X, y + i, UNIT_W, 1);
    }
    ctx.restore();
    // Rack screws.
    for (const sx of [UNIT_X + 20, UNIT_X + UNIT_W - 20]) {
      for (const sy of [y + 22, y + h - 22]) {
        ctx.fillStyle = "#0b0b0c";
        ctx.beginPath();
        ctx.arc(sx, sy, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#3a3c41";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(sx - 5, sy - 2);
        ctx.lineTo(sx + 5, sy + 2);
        ctx.stroke();
      }
    }
  }

  private knob(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, turn: number): void {
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.1, x, y, r);
    g.addColorStop(0, "#5b5e65");
    g.addColorStop(0.6, "#2a2c30");
    g.addColorStop(1, "#111214");
    ctx.fillStyle = "#050506";
    ctx.beginPath();
    ctx.arc(x, y + 3, r + 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#e6e7ea";
    ctx.lineWidth = Math.max(2, r * 0.07);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x + Math.sin(turn) * r * 0.45, y - Math.cos(turn) * r * 0.45);
    ctx.lineTo(x + Math.sin(turn) * r * 0.88, y - Math.cos(turn) * r * 0.88);
    ctx.stroke();
  }

  private fixedAmp(ctx: CanvasRenderingContext2D): void {
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.fillStyle = FACE_TEXT;
    ctx.font = labelFont(25);
    ctx.fillText("SPECTRUM", 104, AMP.y + 92);
    ctx.fillText("AURA", 104, AMP.y + 126);
    ctx.fillStyle = FACE_DIM;
    ctx.font = labelFont(15);
    ctx.fillText("DUAL POWER METER", 104, AMP.y + 162);
    ctx.fillText("SA-9600", 104, AMP.y + 184);
    ctx.fillText("POWER", 134, AMP.y + 338);
    // Power lamp, always on.
    ctx.fillStyle = "rgba(255,59,47,0.25)";
    ctx.beginPath();
    ctx.arc(112, AMP.y + 333, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ff5a48";
    ctx.beginPath();
    ctx.arc(112, AMP.y + 333, 6, 0, Math.PI * 2);
    ctx.fill();

    this.knob(ctx, 1712, AMP.y + 170, 72, -0.7);
    ctx.fillStyle = FACE_DIM;
    ctx.textAlign = "center";
    ctx.fillText("METER RANGE", 1712, AMP.y + 290);
    ctx.fillText("-20dB          0dB", 1712, AMP.y + 68);

    for (let m = 0; m < 2; m++) {
      const wx = VU.xs[m]!;
      const cx = wx + VU.w / 2;
      const py = VU.y + VU.h + 70;
      // Recessed bezel, then the lamp-lit dial card.
      ctx.fillStyle = "#040404";
      roundRect(ctx, wx - 10, VU.y - 10, VU.w + 20, VU.h + 20, 8);
      ctx.fill();
      const card = ctx.createRadialGradient(
        cx,
        VU.y + VU.h * 1.05,
        40,
        cx,
        VU.y + VU.h,
        VU.w * 0.72,
      );
      card.addColorStop(0, "#e6c479");
      card.addColorStop(0.55, "#c99a45");
      card.addColorStop(1, "#6e4a16");
      ctx.fillStyle = card;
      ctx.fillRect(wx, VU.y, VU.w, VU.h);

      const point = (at: number, r: number): [number, number] => {
        const a = ((-NEEDLE_SWEEP + NEEDLE_SWEEP * 2 * at) * Math.PI) / 180;
        return [cx + Math.sin(a) * r, py - Math.cos(a) * r];
      };
      const arc = (from: number, to: number, r: number) => {
        const a0 = ((-NEEDLE_SWEEP + NEEDLE_SWEEP * 2 * from - 90) * Math.PI) / 180;
        const a1 = ((-NEEDLE_SWEEP + NEEDLE_SWEEP * 2 * to - 90) * Math.PI) / 180;
        ctx.beginPath();
        ctx.arc(cx, py, r, a0, a1);
        ctx.stroke();
      };
      ctx.save();
      ctx.beginPath();
      ctx.rect(wx, VU.y, VU.w, VU.h);
      ctx.clip();
      const zero = vuPosition(0);
      ctx.lineCap = "butt";
      ctx.strokeStyle = "#1a1512";
      ctx.lineWidth = 3;
      arc(0, zero, NEEDLE_R);
      ctx.strokeStyle = "#c8281e";
      ctx.lineWidth = 9;
      arc(zero, 1, NEEDLE_R - 3);
      ctx.font = monoFont(22);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const [db, at] of VU_SCALE) {
        const red = db > 0;
        ctx.strokeStyle = red ? "#c8281e" : "#1a1512";
        ctx.fillStyle = red ? "#c8281e" : "#1a1512";
        ctx.lineWidth = 3;
        const [x0, y0] = point(at, NEEDLE_R);
        const [x1, y1] = point(at, NEEDLE_R + 20);
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        const [tx, ty] = point(at, NEEDLE_R + 42);
        ctx.fillText(db > 0 ? `+${db}` : `${Math.abs(db)}`, tx, ty);
      }
      // Minor ticks between the lettered marks.
      ctx.strokeStyle = "#1a1512";
      ctx.lineWidth = 1.5;
      for (let db = -19; db < 3; db += db < -10 ? 1 : 0.5) {
        const [x0, y0] = point(vuPosition(db), NEEDLE_R);
        const [x1, y1] = point(vuPosition(db), NEEDLE_R + 9);
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
      ctx.fillStyle = "#1a1512";
      ctx.font = labelFont(46);
      ctx.fillText("VU", cx, VU.y + VU.h - 78);
      ctx.font = labelFont(15);
      ctx.fillText("PEAK", wx + VU.w - 40, VU.y + 68);
      // Unlit peak lens.
      ctx.fillStyle = "#4a1410";
      ctx.beginPath();
      ctx.arc(wx + VU.w - 40, VU.y + 40, 9, 0, Math.PI * 2);
      ctx.fill();
      // Pivot cover along the bottom edge.
      ctx.fillStyle = "#0c0c0d";
      ctx.fillRect(wx, VU.y + VU.h - 30, VU.w, 30);
      ctx.restore();
      // A soft highlight on the glass.
      const glare = ctx.createLinearGradient(0, VU.y, 0, VU.y + VU.h);
      glare.addColorStop(0, "rgba(255,255,255,0.08)");
      glare.addColorStop(0.35, "rgba(255,255,255,0)");
      ctx.fillStyle = glare;
      ctx.fillRect(wx, VU.y, VU.w, VU.h);

      ctx.fillStyle = FACE_TEXT;
      ctx.font = labelFont(15);
      ctx.textBaseline = "alphabetic";
      ctx.fillText(VU.labels[m]!, cx, AMP.y + AMP.h - 22);
    }
  }

  private fixedAnalyser(ctx: CanvasRenderingContext2D): void {
    // Smoked glass.
    ctx.fillStyle = "#020304";
    roundRect(ctx, GLASS.x - 8, GLASS.y - 8, GLASS.w + 16, GLASS.h + 16, 8);
    ctx.fill();
    const glass = ctx.createLinearGradient(0, GLASS.y, 0, GLASS.y + GLASS.h);
    glass.addColorStop(0, "#07101a");
    glass.addColorStop(1, "#03060a");
    ctx.fillStyle = glass;
    ctx.fillRect(GLASS.x, GLASS.y, GLASS.w, GLASS.h);

    // Unlit segments, faintly visible like a real fluorescent tube at rest.
    const ghost: ReadonlyArray<readonly [from: number, to: number, color: string]> = [
      [1, 10, this.colors.low],
      [11, 12, this.colors.mid],
      [13, 14, this.colors.top],
    ];
    ctx.globalAlpha = 0.07;
    for (const [from, to, color] of ghost) {
      ctx.fillStyle = color;
      for (let b = 0; b < BANDS; b++) {
        for (let row = from; row <= to; row++) ctx.fillRect(bandX(b), segY(row), SEG.w, SEG.h);
      }
    }
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = this.colors.low;
    ctx.font = monoFont(19);
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    for (let b = 0; b < BANDS; b++) {
      ctx.fillText(BAND_LABELS[b]!, bandX(b) + SEG.w / 2, GLASS.y + GLASS.h - 16);
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = FACE_TEXT;
    ctx.font = monoFont(18);
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (const [row, label] of DB_ROWS) ctx.fillText(label, GLASS.x - 20, segY(row) + SEG.h / 2);
    ctx.fillStyle = FACE_DIM;
    ctx.font = labelFont(15);
    // Above the scale, clear of the top mark.
    ctx.fillText("dB", GLASS.x - 20, GLASS.y - 14);
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("Hz", GLASS.x - 34, GLASS.y + GLASS.h - 16);

    ctx.textAlign = "left";
    ctx.fillStyle = FACE_TEXT;
    ctx.font = labelFont(19);
    ctx.fillText("14 BAND", 1560, EQ.y + 78);
    ctx.fillText("SPECTRUM", 1560, EQ.y + 106);
    ctx.fillText("ANALYZER", 1560, EQ.y + 134);
    ctx.fillStyle = FACE_DIM;
    ctx.font = labelFont(15);
    ctx.fillText("SA-8000", 1560, EQ.y + 164);
    ctx.fillText("PEAK HOLD", 1600, EQ.y + 227);
    ctx.fillText("RESPONSE  FAST", 1600, EQ.y + 262);
    ctx.fillStyle = "#3a2a10";
    ctx.beginPath();
    ctx.arc(1578, EQ.y + 222, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#58ff8a";
    ctx.beginPath();
    ctx.arc(1578, EQ.y + 257, 6, 0, Math.PI * 2);
    ctx.fill();
    this.knob(ctx, 1600, EQ.y + 338, 30, 0.5);
    this.knob(ctx, 1690, EQ.y + 338, 30, -1.1);
    this.knob(ctx, 1780, EQ.y + 338, 30, 0.1);
  }

  private fixedTuner(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = "#020304";
    roundRect(ctx, DIAL.x - 8, DIAL.y - 8, DIAL.w + 16, DIAL.h + 16, 8);
    ctx.fill();
    // Back-lit dial: a warm wash behind white lettering.
    const lit = ctx.createLinearGradient(0, DIAL.y, 0, DIAL.y + DIAL.h);
    lit.addColorStop(0, "#1a1206");
    lit.addColorStop(0.5, "#2a1d08");
    lit.addColorStop(1, "#120c04");
    ctx.fillStyle = lit;
    ctx.fillRect(DIAL.x, DIAL.y, DIAL.w, DIAL.h);
    ctx.strokeStyle = "#f1e2b4";
    ctx.fillStyle = "#f1e2b4";
    ctx.font = monoFont(22);
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    for (let bpm = DIAL.lo; bpm <= DIAL.hi; bpm += 2) {
      const major = bpm % 20 === 0;
      const mid = bpm % 10 === 0;
      const x = dialX(bpm);
      ctx.lineWidth = major ? 2.5 : 1.2;
      ctx.beginPath();
      ctx.moveTo(x, DIAL.y + DIAL.h - 16);
      ctx.lineTo(x, DIAL.y + DIAL.h - (major ? 50 : mid ? 38 : 28));
      ctx.stroke();
      if (major) ctx.fillText(String(bpm), x, DIAL.y + 44);
    }
    ctx.fillStyle = FACE_TEXT;
    ctx.font = labelFont(15);
    ctx.textAlign = "left";
    ctx.fillText("TEMPO", 96, TUNER.y + 78);
    ctx.fillText("TUNER", 96, TUNER.y + 102);
    ctx.fillStyle = FACE_DIM;
    ctx.font = labelFont(14);
    ctx.fillText("BPM", 96, TUNER.y + 126);

    ctx.fillStyle = "#020304";
    roundRect(ctx, COUNTER.x - 8, COUNTER.y - 8, COUNTER.w + 16, COUNTER.h + 16, 8);
    ctx.fill();
    ctx.fillStyle = "#04080c";
    ctx.fillRect(COUNTER.x, COUNTER.y, COUNTER.w, COUNTER.h);
    ctx.fillStyle = FACE_DIM;
    ctx.font = labelFont(15);
    ctx.fillText("LOCK", 1722, TUNER.y + 67);
    ctx.fillText("BEAT", 1722, TUNER.y + 117);
    ctx.fillStyle = "#143320";
    ctx.beginPath();
    ctx.arc(1700, TUNER.y + 62, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#4a1410";
    ctx.beginPath();
    ctx.arc(1700, TUNER.y + 112, 8, 0, Math.PI * 2);
    ctx.fill();
  }

  dispose(): void {
    this.panel.dispose();
  }
}
