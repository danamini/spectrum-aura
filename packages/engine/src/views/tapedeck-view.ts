import { NeedleBallistics, bandPeak, reelRadii, waveLevels } from "./instrument-math";
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

// Layout, in canvas pixels.
const UNIT_X = 60;
const UNIT_W = PANEL_W - UNIT_X * 2;
const DECK = { y: 30, h: 490 };
const AMP = { y: 540, h: 510 };
/** Shared by both units: where the name, model line and power button sit. */
const HEADER = { x: 92, modelX: 340 };
const POWER = { dy: 70, size: 66 };

// Cassette well.
const DOOR = { x: 210, y: 84, w: 620, h: 330 };
const SHELL = { x: 270, y: 92, w: 500, h: 286 };
const SHELL_MID = SHELL.x + SHELL.w / 2;
const HUB_Y = SHELL.y + 140;
const HUB_X = [SHELL_MID - 106, SHELL_MID + 106] as const;
/** Flange of the miniature open reel on each hub; the tape pack never outgrows it. */
const REEL_R = 88;
const PACK = { empty: 40, full: 84 };
/** Height of the tape where it runs across the open edge of the shell, past the heads. */
const TAPE_Y = SHELL.y + 256;
/** Guide rollers at the bottom corners of the shell, where the tape turns toward the heads. */
const ROLLER_X = [SHELL.x + 40, SHELL.x + SHELL.w - 40] as const;
/** The clear strip in the cassette door; the rest of the door is dark. */
const WINDOW = { x: DOOR.x + 70, y: HUB_Y - 62, w: DOOR.w - 140, h: 124 };
/** Seconds for one side of the tape, and the tape speed in pixels a second. */
const SIDE_SECONDS = 180;
const TAPE_SPEED = 110;
const KEYS = {
  x: 880,
  y: 420,
  w: 640,
  h: 58,
  labels: ["REW", "STOP", "PLAY", "FF", "REC", "PAUSE"] as const,
};
const KEY_W = KEYS.w / KEYS.labels.length;

// Display window: counter and transport state on the left, level bars on the right.
const GLASS = { x: 880, y: 84, w: 640, h: 230 };
const BAR = { x: GLASS.x + 270, w: 340, h: 24, ys: [GLASS.y + 58, GLASS.y + 128] as const };
const BAR_SEGMENTS = 40;
const BAR_DB = { lo: -40, hi: 8 };
const BAR_LABELS = ["L", "R"] as const;
const BAR_MARKS = [-40, -30, -20, -10, -5, 0, 5];
const COUNTER_COLOR = "#ff8a3c";
/** Digital full scale sits this far above the deck's 0 dB mark. */
const HEADROOM_DB = 6;
/** Raw waveform peak, in dBFS, below which the transport treats the input as silence. */
const SILENCE_DBFS = -45;
/** Seconds below that level before the transport stops, so a quiet passage plays through. */
const SILENCE_SECONDS = 5;

// Power amp meters: one long window holding both dials.
const METER = { x: 330, y: AMP.y + 62, w: 1260, h: 280 };
/** Centre line of the amplifier's lower row of controls. */
const AMP_ROW_Y = AMP.y + 436;
const DIAL_CX = [METER.x + METER.w * 0.25, METER.x + METER.w * 0.75] as const;
const DIAL_PY = METER.y + METER.h + 150;
const DIAL_R = 340;
const DIAL_SWEEP = 38;
const DIAL_LABELS = ["LEFT", "RIGHT"] as const;
/** Needle position of the 100 W / 0 dB mark; each decade of power is a fifth of that. */
const FULL_POWER_AT = 0.87;
const WATTS = ["0.001", "0.01", "0.1", "1", "10", "100"] as const;
/** Bands sampled for a level estimate when the source provides no waveform. */
const FALLBACK_HZ = [63, 100, 160, 250, 1600, 2500, 4000, 6300, 10000];
const INSTRUMENT_SPAN = 0.6;

const DEFAULT_COLORS = { fl: "#8fe9ff", over: "#ff5a3c", face: "#9fc6dc" };
/** Dark lettering on the lit dial cards. */
const INK = "#16181b";
/** Silver-white lettering on the black faceplates. */
const FACE_TEXT = "#eef0f2";
const FACE_DIM = "#cdd0d5";

const dialPoint = (cx: number, at: number, r: number): [number, number] => {
  const a = ((-DIAL_SWEEP + DIAL_SWEEP * 2 * at) * Math.PI) / 180;
  return [cx + Math.sin(a) * r, DIAL_PY - Math.cos(a) * r];
};
const barAt = (db: number) => Math.max(0, Math.min(1, (db - BAR_DB.lo) / (BAR_DB.hi - BAR_DB.lo)));

/**
 * A black cassette deck stacked on a power amplifier. Through the window in
 * the deck's door the cassette's reels turn while there is signal, the tape
 * pack moving from one hub to the other and reversing at the end of the
 * side. The deck's bars and the amplifier's two pale-blue dials are left and
 * right peak meters; a mono source moves both channels together.
 *
 * As with the Hi-Fi rack, everything that does not move is drawn once into a
 * cached layer.
 */
export class TapeDeckView implements LazyView {
  private readonly panel = new InstrumentPanel();
  readonly group = this.panel.group;
  private readonly fixed: Layer = createLayer();
  private fixedKey = "";
  private colors = DEFAULT_COLORS;

  private readonly needles = [new NeedleBallistics(150, 20), new NeedleBallistics(150, 20)];
  private readonly clip = [0, 0];

  private readonly levels = { rmsDb: -Infinity, peakDb: -Infinity };
  /** Left and right level in dB on the deck's scale, and the dial position for each. */
  private readonly channelDb = [BAR_DB.lo, BAR_DB.lo];
  private readonly channelAt = [0, 0];
  private readonly bar = [0, 0];
  private readonly barPeak = [0, 0];
  private readonly barHold = [0, 0];

  private readonly radii = { supply: PACK.full, takeUp: PACK.empty };
  private readonly hubAngle = [0, 0];
  private played = 0.12;
  private direction = 1;
  private running = 0;
  private quietFor = 0;
  private counter = 0;

  constructor() {
    const p = this.panel;
    // Deck: record level, sockets, power and eject, function buttons, transport keys.
    p.raiseDisc(1700, DECK.y + 166, 94, 0.36);
    for (const x of [1640, 1740, 1808]) p.raiseDisc(x, DECK.y + 410, 19, 0.05);
    for (const unit of [DECK, AMP])
      p.raiseBox(HEADER.x + 4, unit.y + POWER.dy, POWER.size, POWER.size, 0.07);
    p.raiseBox(96, DECK.y + 216, 80, 26, 0.05);
    for (let i = 0; i < 4; i++) p.raiseBox(GLASS.x + 10 + i * 160, DECK.y + 320, 110, 20, 0.05);
    for (let i = 0; i < KEYS.labels.length; i++) {
      p.raiseBox(KEYS.x + i * KEY_W + 3, KEYS.y, KEY_W - 6, KEYS.h, 0.09);
    }
    // Amplifier: volume, tone controls, power, input and speaker buttons.
    p.raiseDisc(1728, AMP.y + 196, 92, 0.36);
    for (let i = 0; i < 3; i++) p.raiseDisc(1020 + i * 150, AMP_ROW_Y - 8, 30, 0.2);
    for (let i = 0; i < 4; i++)
      p.raiseBox(METER.x + 50 + i * 120 - 34, AMP_ROW_Y - 8, 68, 20, 0.05);
    for (const dx of [-28, 28]) p.raiseBox(1560 + dx - 20, AMP_ROW_Y - 8, 40, 20, 0.05);
  }

  update(f: ViewFrame): void {
    const { opts } = f;
    this.panel.frameCamera(f, opts.tapedeckFullscreen);
    const ctx = this.panel.ctx;
    if (!ctx) return;

    const usePalette = opts.tapedeckUsePalette;
    const key = `${this.panel.fontsVersion}|${usePalette ? f.palette.map(cssColor).join() : ""}`;
    if (key !== this.fixedKey) {
      this.fixedKey = key;
      this.colors = usePalette
        ? { fl: cssColor(f.palette[2]), over: cssColor(f.palette[0]), face: cssColor(f.palette[1]) }
        : DEFAULT_COLORS;
      this.drawFixed();
    }
    ctx.globalAlpha = 1;
    ctx.drawImage(this.fixed.canvas, 0, 0);

    const amp = Math.max(0.05, opts.tapedeckAmplitude);
    this.readLevels(f, amp);
    this.drawTransport(ctx, f.dt);
    this.drawBars(ctx, opts.tapedeckPeakHold);
    this.drawDials(ctx, f.dt);
    this.panel.commit();
  }

  // ---------------------------------------------------------------- levels

  private readLevels(f: ViewFrame, amp: number): void {
    const { audio, dt } = f;
    const trim = 20 * Math.log10(amp) + HEADROOM_DB;
    const hasWave = !!audio.wave && audio.wave.length > 0;
    let signal: boolean;
    if (audio.stereo) {
      // True left and right peak levels.
      const sides = [audio.stereo.left, audio.stereo.right];
      for (let i = 0; i < 2; i++) {
        waveLevels(sides[i]!, this.levels);
        this.channelDb[i] = this.levels.peakDb + trim;
      }
      waveLevels(audio.wave!, this.levels);
      signal = this.levels.peakDb > SILENCE_DBFS;
    } else if (hasWave) {
      // A mono source drives both channels alike, as a mono tape would.
      waveLevels(audio.wave!, this.levels);
      this.channelDb[0] = this.channelDb[1] = this.levels.peakDb + trim;
      signal = this.levels.peakDb > SILENCE_DBFS;
    } else {
      // No waveform (the synthetic ambient source): estimate from the spectrum.
      const bins = audio.rawBins ?? audio.bins;
      const binHz =
        audio.timing.fftWindowMs > 0
          ? 1000 / audio.timing.fftWindowMs
          : 24000 / Math.max(1, bins.length);
      let loudest = 0;
      for (const hz of FALLBACK_HZ) {
        loudest = Math.max(loudest, meterLevel(bandPeak(bins, binHz, hz), INSTRUMENT_SPAN));
      }
      loudest = Math.min(1, loudest * amp);
      this.channelDb[0] = this.channelDb[1] = BAR_DB.lo + loudest * (BAR_DB.hi - BAR_DB.lo);
      signal = loudest > 0.3;
    }

    for (let i = 0; i < 2; i++) {
      const db = this.channelDb[i]!;
      // The dials read the same level on their watts scale: 0 dB is 100 W.
      this.channelAt[i] = Math.max(0, Math.min(1.05, FULL_POWER_AT * (1 + db / 50)));
      const target = barAt(db);
      const current = this.bar[i]!;
      this.bar[i] =
        target > current
          ? current + (target - current) * Math.min(1, dt * 60)
          : Math.max(target, current - dt * 1.4);
      if (this.bar[i]! >= this.barPeak[i]!) {
        this.barPeak[i] = this.bar[i]!;
        this.barHold[i] = 1.2;
      } else {
        this.barHold[i] = this.barHold[i]! - dt;
        if (this.barHold[i]! <= 0) this.barPeak[i] = Math.max(0, this.barPeak[i]! - dt * 0.6);
      }
    }

    // The transport stops after a few seconds without signal.
    if (signal) this.quietFor = 0;
    else this.quietFor += dt;
  }

  // ---------------------------------------------------------------- moving

  private drawTransport(ctx: CanvasRenderingContext2D, dt: number): void {
    const playing = this.quietFor < SILENCE_SECONDS;
    this.running += ((playing ? 1 : 0) - this.running) * Math.min(1, dt * (playing ? 4 : 2.2));
    const speed = this.running * this.direction;
    this.played += (speed * dt) / SIDE_SECONDS;
    if (this.played >= 1 || this.played <= 0) {
      // Auto-reverse at the end of the side.
      this.played = Math.max(0, Math.min(1, this.played));
      this.direction = -this.direction;
    }
    reelRadii(this.played, PACK.empty, PACK.full, this.radii);
    const packs = [this.radii.supply, this.radii.takeUp];
    for (let i = 0; i < 2; i++) {
      const turn = ((TAPE_SPEED * speed) / packs[i]!) * dt;
      this.hubAngle[i] = this.hubAngle[i]! + turn;
      if (i === 1) this.counter += Math.abs(turn) / (Math.PI * 2);
    }

    // Only the strip of cassette behind the door's window is seen.
    ctx.save();
    roundRect(ctx, WINDOW.x, WINDOW.y, WINDOW.w, WINDOW.h, 8);
    ctx.clip();
    // Tape: off each pack, round the corner guide, and across the heads.
    ctx.strokeStyle = "#2b1a11";
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(HUB_X[0] - packs[0]!, HUB_Y);
    ctx.lineTo(ROLLER_X[0] - 9, TAPE_Y - 8);
    ctx.lineTo(ROLLER_X[0], TAPE_Y);
    ctx.lineTo(ROLLER_X[1], TAPE_Y);
    ctx.lineTo(ROLLER_X[1] + 9, TAPE_Y - 8);
    ctx.lineTo(HUB_X[1] + packs[1]!, HUB_Y);
    ctx.stroke();
    for (let i = 0; i < 2; i++) this.reel(ctx, HUB_X[i]!, HUB_Y, packs[i]!, this.hubAngle[i]!);
    // Smoked glass over the reels, with a soft reflection.
    const glass = ctx.createLinearGradient(0, WINDOW.y, 0, WINDOW.y + WINDOW.h);
    glass.addColorStop(0, "rgba(255,255,255,0.1)");
    glass.addColorStop(0.3, "rgba(10,8,6,0.12)");
    glass.addColorStop(1, "rgba(10,8,6,0.3)");
    ctx.fillStyle = glass;
    ctx.fillRect(WINDOW.x, WINDOW.y, WINDOW.w, WINDOW.h);
    ctx.restore();

    // Transport lamps: PLAY while the tape moves, PAUSE once it has stopped.
    drawLamp(ctx, KEYS.x + KEY_W * 2.5, KEYS.y - 10, 5, "#58ff8a", this.running);
    drawLamp(ctx, KEYS.x + KEY_W * 5.5, KEYS.y - 10, 5, "#ffb84a", 1 - this.running);

    // Counter and transport state, in the display window.
    const counterColor = this.colors === DEFAULT_COLORS ? COUNTER_COLOR : this.colors.over;
    const count = String(Math.floor(this.counter) % 10000).padStart(4, "0");
    drawSevenSegment(
      ctx,
      count,
      GLASS.x + 34,
      GLASS.y + 44,
      46,
      counterColor,
      "rgba(255,138,60,0.07)",
    );
    ctx.fillStyle = counterColor;
    const ax = GLASS.x + 52;
    const ay = GLASS.y + 176;
    const d = this.direction;
    ctx.globalAlpha = 0.2 + 0.8 * this.running;
    ctx.beginPath();
    ctx.moveTo(ax - 12 * d, ay - 14);
    ctx.lineTo(ax + 12 * d, ay);
    ctx.lineTo(ax - 12 * d, ay + 14);
    ctx.closePath();
    ctx.fill();
    ctx.font = labelFont(15);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("PLAY", GLASS.x + 78, ay);
    ctx.globalAlpha = 0.2 + 0.8 * (1 - this.running);
    ctx.fillText("PAUSE", GLASS.x + 150, ay);
    ctx.globalAlpha = 1;
  }

  /**
   * One miniature open reel: the tape pack, a metal flange with three windows
   * turning over it, and the toothed hub. The backlight shows through the
   * windows wherever the pack does not reach.
   */
  private reel(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    pack: number,
    angle: number,
  ): void {
    ctx.fillStyle = "#2b1a11";
    ctx.beginPath();
    ctx.arc(x, y, pack, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,210,160,0.35)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, pack - 1, 0, Math.PI * 2);
    ctx.stroke();

    // Flange: a disc with three windows cut out of it (even-odd fill).
    const flange = ctx.createLinearGradient(x - REEL_R, y - REEL_R, x + REEL_R, y + REEL_R);
    flange.addColorStop(0, "#f4f5f6");
    flange.addColorStop(0.5, "#c3c6ca");
    flange.addColorStop(1, "#8d9196");
    ctx.fillStyle = flange;
    ctx.beginPath();
    ctx.arc(x, y, REEL_R, 0, Math.PI * 2);
    const inner = 44;
    const outer = REEL_R - 14;
    for (let w = 0; w < 3; w++) {
      const a0 = angle + (w * Math.PI * 2) / 3 + 0.2;
      const a1 = a0 + (Math.PI * 2) / 3 - 0.4;
      ctx.moveTo(x + Math.cos(a0) * inner, y + Math.sin(a0) * inner);
      ctx.arc(x, y, outer, a0 + 0.08, a1 - 0.08);
      ctx.arc(x, y, inner, a1, a0, true);
      ctx.closePath();
    }
    ctx.fill("evenodd");
    ctx.strokeStyle = "rgba(20,22,26,0.55)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, REEL_R, 0, Math.PI * 2);
    ctx.stroke();

    // Three rivets between the windows.
    ctx.fillStyle = "rgba(40,42,46,0.8)";
    for (let w = 0; w < 3; w++) {
      const a = angle + (w * Math.PI * 2) / 3;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * 58, y + Math.sin(a) * 58, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Hub: a chrome collar with six drive teeth around the spindle hole.
    ctx.fillStyle = "#e4e5e7";
    ctx.beginPath();
    ctx.arc(x, y, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#08090a";
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#e4e5e7";
    ctx.lineWidth = 6;
    ctx.lineCap = "butt";
    for (let tooth = 0; tooth < 6; tooth++) {
      const a = angle + (tooth * Math.PI) / 3;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * 13, y + Math.sin(a) * 13);
      ctx.lineTo(x + Math.cos(a) * 24, y + Math.sin(a) * 24);
      ctx.stroke();
    }
  }

  private drawBars(ctx: CanvasRenderingContext2D, peakHold: boolean): void {
    const pitch = BAR.w / BAR_SEGMENTS;
    const firstOver = Math.round(barAt(0) * BAR_SEGMENTS);
    for (let i = 0; i < 2; i++) {
      const y = BAR.ys[i]!;
      const lit = Math.round(this.bar[i]! * BAR_SEGMENTS);
      ctx.fillStyle = this.colors.fl;
      for (let s = 0; s < Math.min(lit, firstOver); s++) {
        ctx.fillRect(BAR.x + s * pitch, y, pitch - 3, BAR.h);
      }
      ctx.fillStyle = this.colors.over;
      for (let s = firstOver; s < lit; s++) ctx.fillRect(BAR.x + s * pitch, y, pitch - 3, BAR.h);
      if (peakHold) {
        const at = Math.min(BAR_SEGMENTS, Math.round(this.barPeak[i]! * BAR_SEGMENTS)) - 1;
        if (at >= lit && at >= 0) {
          ctx.fillStyle = at >= firstOver ? this.colors.over : this.colors.fl;
          ctx.fillRect(BAR.x + at * pitch, y, pitch - 3, BAR.h);
        }
      }
    }
  }

  private drawDials(ctx: CanvasRenderingContext2D, dt: number): void {
    for (let m = 0; m < 2; m++) {
      const at = this.needles[m]!.step(this.channelAt[m]!, dt);
      const cx = DIAL_CX[m]!;
      const [tipX, tipY] = dialPoint(cx, at, DIAL_R + 30);

      ctx.save();
      ctx.beginPath();
      ctx.rect(METER.x, METER.y, METER.w, METER.h);
      ctx.clip();
      ctx.lineCap = "round";
      ctx.strokeStyle = "rgba(4,14,24,0.3)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(cx + 3, DIAL_PY + 4);
      ctx.lineTo(tipX + 3, tipY + 4);
      ctx.stroke();
      ctx.strokeStyle = "#0d0f12";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx, DIAL_PY);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();
      ctx.restore();

      if (at > FULL_POWER_AT) this.clip[m] = 1;
      else this.clip[m] = Math.max(0, this.clip[m]! - dt * 2.5);
      drawLamp(ctx, cx + 250, METER.y + 40, 8, "#ff3b2f", this.clip[m]!);
    }
  }

  // ----------------------------------------------------------------- fixed

  private drawFixed(): void {
    const ctx = this.fixed.ctx;
    if (!ctx) return;
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#050506";
    ctx.fillRect(0, 0, PANEL_W, PANEL_H);
    this.faceplate(ctx, DECK.y, DECK.h);
    this.faceplate(ctx, AMP.y, AMP.h);
    this.fixedCassette(ctx);
    this.fixedDisplay(ctx);
    this.fixedAmp(ctx);
  }

  /** Black anodised faceplate with a fine brushed grain and a lit top edge. */
  private faceplate(ctx: CanvasRenderingContext2D, y: number, h: number): void {
    const body = ctx.createLinearGradient(0, y, 0, y + h);
    body.addColorStop(0, "#b4b7bb");
    body.addColorStop(0.012, "#5f6267");
    body.addColorStop(0.5, "#4e5156");
    body.addColorStop(0.985, "#3d3f44");
    body.addColorStop(1, "#0a0a0b");
    ctx.fillStyle = body;
    roundRect(ctx, UNIT_X, y, UNIT_W, h, 6);
    ctx.fill();
    ctx.save();
    roundRect(ctx, UNIT_X, y, UNIT_W, h, 6);
    ctx.clip();
    for (let i = 0; i < h; i += 2) {
      const shade = (Math.sin(i * 12.9898 + y) * 43758.5453) % 1;
      ctx.fillStyle = `rgba(255,255,255,${0.01 + Math.abs(shade) * 0.03})`;
      ctx.fillRect(UNIT_X, y + i, UNIT_W, 1);
    }
    ctx.restore();
    // Feet.
    ctx.fillStyle = "#0a0a0b";
    for (const fx of [UNIT_X + 110, UNIT_X + UNIT_W - 190]) ctx.fillRect(fx, y + h, 80, 8);
  }

  /** A black knob with a bright bevel and a white pointer line. */
  private knob(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, turn: number): void {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.arc(x + 2, y + 5, r + 4, 0, Math.PI * 2);
    ctx.fill();
    const rim = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
    rim.addColorStop(0, "#c9ccd0");
    rim.addColorStop(0.35, "#5a5d62");
    rim.addColorStop(1, "#121315");
    ctx.fillStyle = rim;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    const cap = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
    cap.addColorStop(0, "#7d8085");
    cap.addColorStop(1, "#2c2e32");
    ctx.fillStyle = cap;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.86, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#f2f3f4";
    ctx.lineWidth = Math.max(2, r * 0.06);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x + Math.sin(turn) * r * 0.5, y - Math.cos(turn) * r * 0.5);
    ctx.lineTo(x + Math.sin(turn) * r * 0.82, y - Math.cos(turn) * r * 0.82);
    ctx.stroke();
  }

  /** A flat push button set into the faceplate. */
  private button(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    ctx.fillStyle = "#050506";
    roundRect(ctx, x - 2, y - 2, w + 4, h + 4, 4);
    ctx.fill();
    const face = ctx.createLinearGradient(0, y, 0, y + h);
    face.addColorStop(0, "#c3c6ca");
    face.addColorStop(0.1, "#74777c");
    face.addColorStop(1, "#54575c");
    ctx.fillStyle = face;
    roundRect(ctx, x, y, w, h, 3);
    ctx.fill();
  }

  /**
   * What every unit in the range shares: the maker's name and the model line
   * along the top edge, and the power button with its lamp at top left, all
   * in the same place so stacked units line up.
   */
  private unitHeader(ctx: CanvasRenderingContext2D, y: number, model: string): void {
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.fillStyle = FACE_TEXT;
    ctx.font = labelFont(18);
    ctx.fillText("SPECTRUM AURA", HEADER.x, y + 36);
    ctx.fillStyle = FACE_DIM;
    ctx.font = labelFont(14);
    ctx.fillText(model, HEADER.modelX, y + 36);
    this.button(ctx, HEADER.x + 4, y + POWER.dy, POWER.size, POWER.size);
    ctx.font = labelFont(13);
    ctx.fillStyle = FACE_DIM;
    ctx.fillText("power", HEADER.x + 4, y + POWER.dy - 8);
    const lampX = HEADER.x + 4 + POWER.size / 2;
    ctx.fillStyle = "rgba(255,59,47,0.25)";
    ctx.beginPath();
    ctx.arc(lampX, y + POWER.dy + POWER.size + 24, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ff5a48";
    ctx.beginPath();
    ctx.arc(lampX, y + POWER.dy + POWER.size + 24, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  private fixedCassette(ctx: CanvasRenderingContext2D): void {
    this.unitHeader(ctx, DECK.y, "Stereo Cassette Deck  SA-M85");
    this.button(ctx, 96, DECK.y + 216, 80, 26);
    ctx.fillStyle = FACE_DIM;
    ctx.font = labelFont(13);
    ctx.fillText("eject", 96, DECK.y + 208);

    // The well is lit from behind by a warm lamp, so the clear cassette and
    // its reels show against the glow.
    ctx.fillStyle = "#020203";
    roundRect(ctx, DOOR.x - 10, DOOR.y - 10, DOOR.w + 20, DOOR.h + 20, 10);
    ctx.fill();
    ctx.save();
    roundRect(ctx, DOOR.x, DOOR.y, DOOR.w, DOOR.h, 6);
    ctx.clip();
    const lamp = ctx.createRadialGradient(
      SHELL_MID,
      HUB_Y + 10,
      40,
      SHELL_MID,
      HUB_Y + 10,
      DOOR.w * 0.6,
    );
    lamp.addColorStop(0, "#ffe6b0");
    lamp.addColorStop(0.4, "#e2ac58");
    lamp.addColorStop(0.78, "#5f3c12");
    lamp.addColorStop(1, "#0e0903");
    ctx.fillStyle = lamp;
    ctx.fillRect(DOOR.x, DOOR.y, DOOR.w, DOOR.h);
    ctx.restore();

    // Clear shell: bright edges, a faint tint, and the moulded ridge inside.
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    roundRect(ctx, SHELL.x, SHELL.y, SHELL.w, SHELL.h, 12);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,250,235,0.75)";
    ctx.lineWidth = 2.5;
    roundRect(ctx, SHELL.x, SHELL.y, SHELL.w, SHELL.h, 12);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,250,235,0.3)";
    ctx.lineWidth = 1.5;
    roundRect(ctx, SHELL.x + 9, SHELL.y + 9, SHELL.w - 18, SHELL.h - 18, 8);
    ctx.stroke();
    // The raised trapezoid along the open edge.
    ctx.beginPath();
    ctx.moveTo(SHELL.x + 70, SHELL.y + SHELL.h);
    ctx.lineTo(SHELL.x + 96, SHELL.y + SHELL.h - 62);
    ctx.lineTo(SHELL.x + SHELL.w - 96, SHELL.y + SHELL.h - 62);
    ctx.lineTo(SHELL.x + SHELL.w - 70, SHELL.y + SHELL.h);
    ctx.stroke();
    // Label strip along the top edge.
    ctx.fillStyle = "rgba(244,240,228,0.92)";
    roundRect(ctx, SHELL.x + 24, SHELL.y + 12, SHELL.w - 48, 36, 5);
    ctx.fill();
    ctx.fillStyle = "#b5452c";
    ctx.fillRect(SHELL.x + 24, SHELL.y + 41, SHELL.w - 48, 4);
    ctx.fillStyle = INK;
    ctx.font = labelFont(15);
    ctx.fillText("SPECTRUM AURA", SHELL.x + 38, SHELL.y + 35);
    ctx.textAlign = "right";
    ctx.font = monoFont(15);
    ctx.fillText("OPEN REEL  TYPE II  C-60", SHELL.x + SHELL.w - 38, SHELL.y + 34);
    // Corner guide rollers, the pressure pad, and the shell screws.
    for (const x of ROLLER_X) {
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath();
      ctx.arc(x, TAPE_Y - 11, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#3a3c41";
      ctx.beginPath();
      ctx.arc(x, TAPE_Y - 11, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#b8792e";
    ctx.fillRect(SHELL_MID - 20, TAPE_Y - 12, 40, 9);
    ctx.strokeStyle = "#8a8d92";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(SHELL_MID - 44, TAPE_Y - 30);
    ctx.lineTo(SHELL_MID - 20, TAPE_Y - 8);
    ctx.moveTo(SHELL_MID + 44, TAPE_Y - 30);
    ctx.lineTo(SHELL_MID + 20, TAPE_Y - 8);
    ctx.stroke();
    for (const [dx, dy] of [
      [16, 16],
      [SHELL.w - 16, 16],
      [16, SHELL.h - 16],
      [SHELL.w - 16, SHELL.h - 16],
      [SHELL.w / 2, SHELL.h - 76],
    ] as const) {
      ctx.fillStyle = "#c9ccd0";
      ctx.beginPath();
      ctx.arc(SHELL.x + dx, SHELL.y + dy, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#3a3c41";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(SHELL.x + dx - 4, SHELL.y + dy);
      ctx.lineTo(SHELL.x + dx + 4, SHELL.y + dy);
      ctx.stroke();
    }
    // The door itself: dark smoked plastic that hides all but a window strip.
    ctx.save();
    // roundRect starts the path, so the outer rectangle is added after it.
    roundRect(ctx, WINDOW.x, WINDOW.y, WINDOW.w, WINDOW.h, 8);
    ctx.rect(DOOR.x, DOOR.y, DOOR.w, DOOR.h);
    ctx.clip("evenodd");
    const door = ctx.createLinearGradient(0, DOOR.y, 0, DOOR.y + DOOR.h);
    door.addColorStop(0, "rgba(34,36,40,0.97)");
    door.addColorStop(1, "rgba(14,15,17,0.97)");
    ctx.fillStyle = door;
    roundRect(ctx, DOOR.x, DOOR.y, DOOR.w, DOOR.h, 6);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = "#050506";
    ctx.lineWidth = 4;
    roundRect(ctx, WINDOW.x, WINDOW.y, WINDOW.w, WINDOW.h, 8);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth = 1.5;
    roundRect(ctx, WINDOW.x - 3, WINDOW.y - 3, WINDOW.w + 6, WINDOW.h + 6, 10);
    ctx.stroke();
    ctx.fillStyle = FACE_DIM;
    ctx.textAlign = "left";
    ctx.font = labelFont(13);
    ctx.fillText("AUTO TAPE SELECTOR", DOOR.x + 24, DOOR.y + DOOR.h - 22);
    ctx.textAlign = "right";
    ctx.fillText("HX PRO", DOOR.x + DOOR.w - 24, DOOR.y + 34);
    // Reflection across the door.
    const glare = ctx.createLinearGradient(DOOR.x, DOOR.y, DOOR.x + DOOR.w * 0.6, DOOR.y + DOOR.h);
    glare.addColorStop(0, "rgba(255,255,255,0.1)");
    glare.addColorStop(0.4, "rgba(255,255,255,0)");
    ctx.fillStyle = glare;
    roundRect(ctx, DOOR.x, DOOR.y, DOOR.w, DOOR.h, 6);
    ctx.fill();

    // The band under the door.
    ctx.textAlign = "left";
    ctx.fillStyle = FACE_TEXT;
    ctx.font = labelFont(30);
    ctx.fillText("HX PRO", DOOR.x + 8, DECK.y + 456);
    ctx.fillStyle = FACE_DIM;
    ctx.font = labelFont(13);
    ctx.fillText("HEADROOM EXTENSION SYSTEM", DOOR.x + 210, DECK.y + 426);
    ctx.fillText("DOLBY B \u00b7 C \u00b7 S NOISE REDUCTION", DOOR.x + 210, DECK.y + 446);
    ctx.fillText("AUTO REVERSE \u00b7 3 MOTOR \u00b7 DUAL CAPSTAN", DOOR.x + 210, DECK.y + 466);
  }

  private fixedDisplay(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = "#020304";
    roundRect(ctx, GLASS.x - 8, GLASS.y - 8, GLASS.w + 16, GLASS.h + 16, 6);
    ctx.fill();
    const glass = ctx.createLinearGradient(0, GLASS.y, 0, GLASS.y + GLASS.h);
    glass.addColorStop(0, "#0a0d12");
    glass.addColorStop(1, "#040506");
    ctx.fillStyle = glass;
    ctx.fillRect(GLASS.x, GLASS.y, GLASS.w, GLASS.h);

    const pitch = BAR.w / BAR_SEGMENTS;
    const firstOver = Math.round(barAt(0) * BAR_SEGMENTS);
    ctx.globalAlpha = 0.09;
    for (const y of BAR.ys) {
      for (let s = 0; s < BAR_SEGMENTS; s++) {
        ctx.fillStyle = s >= firstOver ? this.colors.over : this.colors.fl;
        ctx.fillRect(BAR.x + s * pitch, y, pitch - 3, BAR.h);
      }
    }
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = this.colors.fl;
    ctx.textBaseline = "middle";
    ctx.textAlign = "right";
    ctx.font = labelFont(14);
    BAR_LABELS.forEach((label, i) => ctx.fillText(label, BAR.x - 14, BAR.ys[i]! + BAR.h / 2));
    ctx.font = monoFont(16);
    ctx.textAlign = "center";
    const scaleY = (BAR.ys[0] + BAR.h + BAR.ys[1]) / 2;
    for (const db of BAR_MARKS) {
      ctx.fillStyle = db > 0 ? this.colors.over : this.colors.fl;
      ctx.fillText(db > 0 ? `+${db}` : `${db}`, BAR.x + barAt(db) * BAR.w, scaleY);
    }
    ctx.fillStyle = this.colors.fl;
    ctx.textAlign = "right";
    ctx.fillText("dB", BAR.x - 26, scaleY);
    ctx.textAlign = "left";
    ctx.font = labelFont(12);
    ctx.fillText("peak level", BAR.x, GLASS.y + 34);
    ctx.fillText("tape counter", GLASS.x + 34, GLASS.y + 26);
    ctx.fillText("operation", GLASS.x + 34, GLASS.y + 144);
    // Status row: tape type and noise reduction, with the selected one lit.
    const status = (text: string, x: number, lit: boolean, color: string) => {
      ctx.globalAlpha = lit ? 0.95 : 0.4;
      ctx.fillStyle = color;
      ctx.fillText(text, BAR.x + x, GLASS.y + 196);
    };
    status("TAPE", 0, true, this.colors.fl);
    status("I", 56, false, this.colors.fl);
    status("II", 72, true, this.colors.fl);
    status("IV", 98, false, this.colors.fl);
    status("DOLBY NR", 150, true, this.colors.over);
    status("B", 248, false, this.colors.over);
    status("C", 270, true, this.colors.over);
    status("S", 292, false, this.colors.over);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = this.colors.over;
    ctx.textAlign = "right";
    ctx.fillText("HX PRO", BAR.x + BAR.w, GLASS.y + 34);
    ctx.textAlign = "left";
    ctx.globalAlpha = 1;
    // A divider between the counter and the meters.
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(GLASS.x + 212, GLASS.y + 16, 1.5, GLASS.h - 32);

    // Record level: the big knob, with its scale printed round it.
    const kx = 1700;
    const ky = DECK.y + 166;
    ctx.strokeStyle = FACE_DIM;
    ctx.fillStyle = FACE_DIM;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = monoFont(14);
    for (let n = 0; n <= 10; n++) {
      const a = ((-135 + n * 27) * Math.PI) / 180;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(kx + Math.sin(a) * 104, ky - Math.cos(a) * 104);
      ctx.lineTo(kx + Math.sin(a) * 114, ky - Math.cos(a) * 114);
      ctx.stroke();
      if (n % 2 === 0) ctx.fillText(String(n), kx + Math.sin(a) * 128, ky - Math.cos(a) * 128);
    }
    this.knob(ctx, kx, ky, 94, 0.55);
    ctx.fillStyle = FACE_DIM;
    ctx.font = labelFont(13);
    ctx.textBaseline = "alphabetic";
    ctx.fillText("rec level", kx, DECK.y + 28);

    // Small function buttons under the display.
    ["timer", "counter reset", "tape select", "dolby nr"].forEach((label, i) => {
      const x = GLASS.x + 10 + i * 160;
      this.button(ctx, x, DECK.y + 320, 110, 20);
      ctx.fillStyle = FACE_DIM;
      ctx.fillText(label, x + 55, DECK.y + 362);
    });

    // Soft-touch transport keys.
    KEYS.labels.forEach((label, i) => {
      const x = KEYS.x + i * KEY_W;
      this.button(ctx, x + 3, KEYS.y, KEY_W - 6, KEYS.h);
      const cx = x + KEY_W / 2;
      const cy = KEYS.y + 22;
      ctx.fillStyle = label === "REC" ? "#ff5a48" : FACE_TEXT;
      const tri = (at: number, dir: number) => {
        ctx.beginPath();
        ctx.moveTo(at - 7 * dir, cy - 8);
        ctx.lineTo(at + 7 * dir, cy);
        ctx.lineTo(at - 7 * dir, cy + 8);
        ctx.closePath();
        ctx.fill();
      };
      if (label === "REW") {
        tri(cx - 7, -1);
        tri(cx + 7, -1);
      } else if (label === "FF") {
        tri(cx - 7, 1);
        tri(cx + 7, 1);
      } else if (label === "PLAY") tri(cx, 1);
      else if (label === "STOP") ctx.fillRect(cx - 7, cy - 7, 14, 14);
      else if (label === "PAUSE") {
        ctx.fillRect(cx - 7, cy - 8, 5, 16);
        ctx.fillRect(cx + 2, cy - 8, 5, 16);
      } else {
        ctx.beginPath();
        ctx.arc(cx, cy, 7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = FACE_DIM;
      ctx.font = labelFont(11);
      ctx.fillText(label.toLowerCase(), cx, KEYS.y + 49);
    });

    // Sockets.
    ctx.font = labelFont(13);
    (
      [
        ["phones", 1640],
        ["mic L", 1740],
        ["R", 1808],
      ] as const
    ).forEach(([label, x]) => {
      ctx.fillStyle = "#8a8d92";
      ctx.beginPath();
      ctx.arc(x, DECK.y + 410, 19, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#0b0c0d";
      ctx.beginPath();
      ctx.arc(x, DECK.y + 410, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#2c2e32";
      ctx.beginPath();
      ctx.arc(x, DECK.y + 410, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = FACE_DIM;
      ctx.fillText(label, x, DECK.y + 456);
    });
  }

  private fixedAmp(ctx: CanvasRenderingContext2D): void {
    this.unitHeader(ctx, AMP.y, "Stereo Power Amplifier  SA-A5");

    // One long window with both dials behind it.
    ctx.fillStyle = "#040404";
    roundRect(ctx, METER.x - 12, METER.y - 12, METER.w + 24, METER.h + 24, 8);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.rect(METER.x, METER.y, METER.w, METER.h);
    ctx.clip();
    ctx.fillStyle = "#1c2a33";
    ctx.fillRect(METER.x, METER.y, METER.w, METER.h);
    for (let m = 0; m < 2; m++) {
      const cx = DIAL_CX[m]!;
      // Back-lit pale-blue card, brightest behind the scale.
      const card = ctx.createRadialGradient(
        cx,
        METER.y + METER.h * 0.55,
        30,
        cx,
        METER.y + 150,
        420,
      );
      card.addColorStop(0, this.colors.face);
      card.addColorStop(1, "rgba(20,34,44,0)");
      ctx.fillStyle = card;
      ctx.fillRect(METER.x + m * (METER.w / 2), METER.y, METER.w / 2, METER.h);

      const arc = (from: number, to: number, r: number) => {
        const a0 = ((-DIAL_SWEEP + DIAL_SWEEP * 2 * from - 90) * Math.PI) / 180;
        const a1 = ((-DIAL_SWEEP + DIAL_SWEEP * 2 * to - 90) * Math.PI) / 180;
        ctx.beginPath();
        ctx.arc(cx, DIAL_PY, r, a0, a1);
        ctx.stroke();
      };
      ctx.lineCap = "butt";
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;
      arc(0, FULL_POWER_AT, DIAL_R);
      ctx.strokeStyle = "#b3261c";
      ctx.lineWidth = 8;
      arc(FULL_POWER_AT, 1, DIAL_R - 2.5);

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const step = FULL_POWER_AT / (WATTS.length - 1);
      for (let i = 0; i < WATTS.length; i++) {
        const at = i * step;
        ctx.strokeStyle = INK;
        ctx.fillStyle = INK;
        ctx.lineWidth = 3;
        const [x0, y0] = dialPoint(cx, at, DIAL_R - 12);
        const [x1, y1] = dialPoint(cx, at, DIAL_R + 18);
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        ctx.font = monoFont(22);
        const [wx, wy] = dialPoint(cx, at, DIAL_R + 40);
        ctx.fillText(WATTS[i]!, wx, wy);
        ctx.font = monoFont(18);
        const [dx, dy] = dialPoint(cx, at, DIAL_R - 30);
        ctx.fillText(i === WATTS.length - 1 ? "0" : `-${(WATTS.length - 1 - i) * 10}`, dx, dy);
        // Minor ticks: 2, 4, 6 and 8 times each decade.
        if (i < WATTS.length - 1) {
          ctx.lineWidth = 1.5;
          for (const k of [2, 4, 6, 8]) {
            const minor = at + Math.log10(k) * step;
            const [a0, b0] = dialPoint(cx, minor, DIAL_R);
            const [a1, b1] = dialPoint(cx, minor, DIAL_R + 10);
            ctx.beginPath();
            ctx.moveTo(a0, b0);
            ctx.lineTo(a1, b1);
            ctx.stroke();
          }
        }
      }
      ctx.fillStyle = INK;
      ctx.font = labelFont(15);
      const [ux, uy] = dialPoint(cx, -0.07, DIAL_R + 40);
      ctx.fillText("W", ux, uy);
      const [vx, vy] = dialPoint(cx, -0.07, DIAL_R - 30);
      ctx.fillText("dB", vx, vy);
      ctx.font = labelFont(30);
      ctx.fillText(DIAL_LABELS[m]!, cx, METER.y + 204);
      ctx.font = labelFont(15);
      ctx.fillText("PEAK POWER  8Ω", cx, METER.y + 234);
      ctx.fillText("CLIP", cx + 250, METER.y + 66);
      ctx.fillStyle = "#4a1410";
      ctx.beginPath();
      ctx.arc(cx + 250, METER.y + 40, 8, 0, Math.PI * 2);
      ctx.fill();
    }
    // Pivot cover along the bottom, a centre post, and a highlight on the glass.
    ctx.fillStyle = "#0c0d0e";
    ctx.fillRect(METER.x, METER.y + METER.h - 26, METER.w, 26);
    ctx.fillRect(METER.x + METER.w / 2 - 5, METER.y, 10, METER.h);
    const glare = ctx.createLinearGradient(0, METER.y, 0, METER.y + METER.h);
    glare.addColorStop(0, "rgba(255,255,255,0.07)");
    glare.addColorStop(0.3, "rgba(255,255,255,0)");
    ctx.fillStyle = glare;
    ctx.fillRect(METER.x, METER.y, METER.w, METER.h);
    ctx.restore();

    // Volume, then the row of smaller controls under the window.
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "center";
    this.knob(ctx, 1728, AMP.y + 196, 92, -0.5);
    ctx.fillStyle = FACE_DIM;
    ctx.font = labelFont(15);
    ctx.fillText("volume", 1728, AMP.y + 330);
    ctx.fillText("-∞", 1640, AMP.y + 300);
    ctx.fillText("0", 1816, AMP.y + 300);

    const rowY = AMP_ROW_Y;
    ["tuner", "phono", "aux", "tape"].forEach((label, i) => {
      const x = METER.x + 50 + i * 120;
      const on = label === "tape";
      ctx.fillStyle = on ? "rgba(88,255,138,0.25)" : "rgba(0,0,0,0)";
      ctx.beginPath();
      ctx.arc(x, rowY - 28, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = on ? "#58ff8a" : "#22352a";
      ctx.beginPath();
      ctx.arc(x, rowY - 28, 6, 0, Math.PI * 2);
      ctx.fill();
      this.button(ctx, x - 34, rowY - 8, 68, 20);
      ctx.fillStyle = FACE_DIM;
      ctx.fillText(label, x, rowY + 36);
    });
    (
      [
        ["bass", 0.3],
        ["treble", -0.2],
        ["balance", 0],
      ] as const
    ).forEach(([label, turn], i) => {
      const x = 1020 + i * 150;
      this.knob(ctx, x, rowY - 8, 30, turn);
      ctx.fillStyle = FACE_DIM;
      ctx.fillText(label, x, rowY + 46);
    });
    ctx.fillStyle = FACE_DIM;
    ctx.fillText("speakers  A  B", 1560, rowY + 36);
    for (const dx of [-28, 28]) {
      this.button(ctx, 1560 + dx - 20, rowY - 8, 40, 20);
    }
  }

  dispose(): void {
    this.panel.dispose();
  }
}
