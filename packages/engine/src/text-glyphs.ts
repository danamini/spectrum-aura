import * as THREE from "three";
import type { AudioBands } from "./audio";
import type { TextStyleId } from "./text-sources/registry";
import { displayLevel, logBin } from "./views/types";

/** Most characters a per-character style will ever place. */
export const MAX_GLYPHS = 200;
const ATLAS_CELLS = 16;
const ATLAS_SIZE = 1024;
const CELL = ATLAS_SIZE / ATLAS_CELLS;
/** Monospace advance as a fraction of glyph height. */
const ADVANCE = 0.62;
const LINE_HEIGHT = 1.25;
const RAIN_COLS = 22;
const RAIN_ROWS = 7;

/** Greedy word wrap; a word longer than the line is split rather than overflowing. */
export function wrapText(text: string, maxChars: number): string[] {
  const limit = Math.max(1, Math.floor(maxChars));
  const lines: string[] = [];
  let line = "";
  for (const raw of text.split(/\s+/).filter(Boolean)) {
    let word = raw;
    while (word.length > limit) {
      if (line) {
        lines.push(line);
        line = "";
      }
      lines.push(word.slice(0, limit));
      word = word.slice(limit);
    }
    if (!line) line = word;
    else if (line.length + 1 + word.length <= limit) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export type GlyphLayout = {
  chars: string[];
  x: Float32Array;
  y: Float32Array;
  /** Glyph height in overlay units. */
  size: number;
  count: number;
};

/**
 * Lays a phrase out as centred, wrapped lines and returns one entry per
 * visible character (spaces advance the pen but place nothing).
 */
export function layoutGlyphs(
  text: string,
  maxWidth: number,
  maxCharsPerLine = 26,
  maxGlyphs = MAX_GLYPHS,
): GlyphLayout {
  const lines = wrapText(text, maxCharsPerLine);
  const longest = lines.reduce((n, line) => Math.max(n, line.length), 1);
  const size = Math.min(0.52, maxWidth / (longest * ADVANCE));
  const chars: string[] = [];
  const xs: number[] = [];
  const ys: number[] = [];
  lines.forEach((line, row) => {
    const y = ((lines.length - 1) / 2 - row) * size * LINE_HEIGHT;
    const left = (-(line.length - 1) / 2) * size * ADVANCE;
    for (let i = 0; i < line.length && chars.length < maxGlyphs; i++) {
      if (line[i] === " ") continue;
      chars.push(line[i]!);
      xs.push(left + i * size * ADVANCE);
      ys.push(y);
    }
  });
  return {
    chars,
    x: new Float32Array(xs),
    y: new Float32Array(ys),
    size,
    count: chars.length,
  };
}

export type GlyphFrame = {
  dt: number;
  time: number;
  audio: AudioBands;
  intensity: number;
  scale: number;
  /** Palette ramp, 0–1 → colour, written into `out`. */
  colorAt: (t: number, out: THREE.Color) => THREE.Color;
};

/**
 * Text drawn one character at a time: an instanced quad per glyph, sampling a
 * glyph atlas that grows as new characters are met. Every character has its
 * own transform, colour and opacity, which is what lets a phrase ripple as an
 * equaliser, type itself out, fly together or fall as rain — none of which a
 * single phrase texture can do.
 */
export class GlyphField {
  readonly mesh: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly atlasCanvas: HTMLCanvasElement | null;
  private readonly atlasCtx: CanvasRenderingContext2D | null;
  private readonly atlas: THREE.Texture;
  private readonly cells = new Map<string, number>();
  private readonly cellAttr: THREE.InstancedBufferAttribute;
  private readonly colorAttr: THREE.InstancedBufferAttribute;
  private readonly alphaAttr: THREE.InstancedBufferAttribute;
  private readonly seedA = new Float32Array(MAX_GLYPHS);
  private readonly seedB = new Float32Array(MAX_GLYPHS);
  private readonly dummy = new THREE.Object3D();
  private readonly color = new THREE.Color();
  private readonly white = new THREE.Color(1, 1, 1);
  private layout: GlyphLayout = layoutGlyphs("", 1);
  private text = "";
  private style: TextStyleId | "" = "";
  private age = 0;
  private kick = 0;
  private ringAngle = 0;

  constructor() {
    this.atlasCanvas = typeof document === "undefined" ? null : document.createElement("canvas");
    if (this.atlasCanvas) {
      this.atlasCanvas.width = ATLAS_SIZE;
      this.atlasCanvas.height = ATLAS_SIZE;
    }
    this.atlasCtx = this.atlasCanvas?.getContext("2d") ?? null;
    this.atlas = this.atlasCanvas ? new THREE.CanvasTexture(this.atlasCanvas) : new THREE.Texture();
    this.atlas.minFilter = THREE.LinearFilter;
    this.atlas.magFilter = THREE.LinearFilter;
    this.atlas.generateMipmaps = false;

    const geometry = new THREE.PlaneGeometry(1, 1);
    this.cellAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_GLYPHS), 1);
    this.colorAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_GLYPHS * 3), 3);
    this.alphaAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_GLYPHS), 1);
    for (const attr of [this.cellAttr, this.colorAttr, this.alphaAttr]) {
      attr.setUsage(THREE.DynamicDrawUsage);
    }
    geometry.setAttribute("aCell", this.cellAttr);
    geometry.setAttribute("aColor", this.colorAttr);
    geometry.setAttribute("aAlpha", this.alphaAttr);

    this.mesh = new THREE.InstancedMesh(
      geometry,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
        uniforms: { tAtlas: { value: this.atlas } },
        vertexShader: /* glsl */ `
          attribute float aCell;
          attribute vec3 aColor;
          attribute float aAlpha;
          varying vec2 vUv;
          varying vec3 vColor;
          varying float vAlpha;
          void main() {
            float col = mod(aCell, ${ATLAS_CELLS.toFixed(1)});
            float row = floor(aCell / ${ATLAS_CELLS.toFixed(1)});
            // Atlas rows are drawn top-down; texture v runs bottom-up.
            vUv = (vec2(col, ${(ATLAS_CELLS - 1).toFixed(1)} - row) + uv) / ${ATLAS_CELLS.toFixed(1)};
            vColor = aColor;
            vAlpha = aAlpha;
            gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform sampler2D tAtlas;
          varying vec2 vUv;
          varying vec3 vColor;
          varying float vAlpha;
          void main() {
            float a = texture2D(tAtlas, vUv).a * vAlpha;
            if (a < 0.01) discard;
            gl_FragColor = vec4(vColor, a);
          }
        `,
      }),
      MAX_GLYPHS,
    );
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.visible = false;
    for (let i = 0; i < MAX_GLYPHS; i++) {
      this.seedA[i] = Math.random();
      this.seedB[i] = Math.random();
    }
  }

  /** Atlas cell for `ch`, drawing it on first use. */
  private cellFor(ch: string): number {
    const known = this.cells.get(ch);
    if (known !== undefined) return known;
    const index = this.cells.size;
    if (index >= ATLAS_CELLS * ATLAS_CELLS) return this.cells.get("?") ?? 0;
    this.cells.set(ch, index);
    const ctx = this.atlasCtx;
    if (ctx) {
      const cx = (index % ATLAS_CELLS) * CELL + CELL / 2;
      const cy = Math.floor(index / ATLAS_CELLS) * CELL + CELL / 2;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `700 ${Math.round(CELL * 0.72)}px "Courier New", monospace`;
      ctx.fillStyle = "#ffffff";
      // A soft halo in the alpha channel gives every glyph its own glow.
      ctx.shadowColor = "#ffffff";
      ctx.shadowBlur = 7;
      ctx.fillText(ch, cx, cy + 2);
      this.atlas.needsUpdate = true;
    }
    return index;
  }

  private put(
    i: number,
    ch: string,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    rotY: number,
    rotZ: number,
    color: THREE.Color,
    alpha: number,
  ) {
    this.dummy.position.set(x, y, z);
    this.dummy.rotation.set(0, rotY, rotZ);
    this.dummy.scale.set(sx, sy, 1);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(i, this.dummy.matrix);
    this.cellAttr.array[i] = this.cellFor(ch);
    this.colorAttr.array[i * 3] = color.r;
    this.colorAttr.array[i * 3 + 1] = color.g;
    this.colorAttr.array[i * 3 + 2] = color.b;
    this.alphaAttr.array[i] = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
  }

  hide(): void {
    this.mesh.visible = false;
    this.style = "";
  }

  /** Lays out `text` if it changed and animates every glyph for `style`. */
  update(style: TextStyleId, text: string, f: GlyphFrame): void {
    this.mesh.visible = true;
    if (text !== this.text || style !== this.style) {
      this.text = text;
      this.style = style;
      this.age = 0;
      // A ring is one long line; everything else wraps to a readable block.
      this.layout =
        style === "ring"
          ? layoutGlyphs(text, 1e6, 1e6, 90)
          : layoutGlyphs(text, 7.6 * f.scale, 26, MAX_GLYPHS);
      for (let i = 0; i < MAX_GLYPHS; i++) {
        this.seedA[i] = Math.random();
        this.seedB[i] = Math.random();
      }
    }
    this.age += f.dt;
    this.kick = f.audio.beat ? 1 : Math.max(0, this.kick - f.dt * 4.5);

    let count: number;
    switch (style) {
      case "typewriter":
        count = this.typewriter(f);
        break;
      case "assemble":
        count = this.assemble(f);
        break;
      case "ring":
        count = this.ring(f);
        break;
      case "rain":
        count = this.rain(f);
        break;
      default:
        count = this.wave(f);
        break;
    }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.cellAttr.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;
  }

  private band(i: number, n: number, bins: Uint8Array): number {
    return bins.length > 0 ? displayLevel(bins[logBin(i, Math.max(2, n), bins.length)]!) : 0;
  }

  /** Each character is one band of an equaliser riding a travelling wave. */
  private wave(f: GlyphFrame): number {
    const { chars, x, y, size, count } = this.layout;
    const bins = f.audio.bins;
    for (let i = 0; i < count; i++) {
      const level = this.band(i, count, bins);
      const enter = Math.min(1, Math.max(0, (this.age - i * 0.018) / 0.22));
      const lift = Math.sin(f.time * 2.4 + i * 0.5) * 0.16 * (0.5 + f.intensity);
      const tall = size * (1 + level * 1.5 * f.intensity) * enter;
      const color = f
        .colorAt(count <= 1 ? 0 : i / (count - 1), this.color)
        .lerp(this.white, level * 0.28);
      this.put(
        i,
        chars[i]!,
        x[i]!,
        // Grow upward from the baseline so tall glyphs do not sink.
        y[i]! + lift + (tall - size) * 0.5,
        0,
        size * (1 + level * 0.2) * enter,
        tall,
        0,
        Math.cos(f.time * 1.7 + i * 0.5) * 0.16 * f.intensity,
        color,
        0.95,
      );
    }
    return count;
  }

  /** Types the phrase out in time with the tempo, each key landing with a pop. */
  private typewriter(f: GlyphFrame): number {
    const { chars, x, y, size, count } = this.layout;
    const confident = f.audio.bpm > 0 && f.audio.bpmConfidence > 0.45;
    // Four keystrokes per beat once the tempo is known.
    const rate = confident ? (f.audio.bpm / 60) * 4 : 14;
    const shown = Math.min(count, Math.floor(this.age * rate));
    for (let i = 0; i < shown; i++) {
      const sinceTyped = this.age - i / rate;
      const pop = Math.max(0, 1 - sinceTyped * 7);
      const s = size * (1 + pop * 0.7 + this.kick * 0.06 * f.intensity);
      const color = f
        .colorAt(count <= 1 ? 0 : i / (count - 1), this.color)
        .lerp(this.white, Math.max(pop, 0.12));
      this.put(i, chars[i]!, x[i]!, y[i]!, pop * 0.4, s, s, 0, 0, color, 1);
    }
    let used = shown;
    // Block cursor at the next position, blinking once the line is complete.
    if (count > 0 && used < MAX_GLYPHS) {
      const at = Math.min(shown, count - 1);
      const cx = shown < count ? x[at]! : x[at]! + size * ADVANCE;
      const blink = shown < count || Math.floor(f.time * 2.5) % 2 === 0 ? 1 : 0;
      this.put(used, "_", cx, y[at]!, 0, size, size, 0, 0, this.color.copy(this.white), blink);
      used += 1;
    }
    return used;
  }

  /** Characters fly in from all around, lock into the phrase, and breathe on the beat. */
  private assemble(f: GlyphFrame): number {
    const { chars, x, y, size, count } = this.layout;
    const bins = f.audio.bins;
    for (let i = 0; i < count; i++) {
      const a = this.seedA[i]! * Math.PI * 2;
      const b = (this.seedB[i]! - 0.5) * Math.PI;
      const t = Math.min(1, Math.max(0, (this.age - this.seedA[i]! * 0.35) / 0.85));
      const ease = 1 - Math.pow(1 - t, 3);
      const startX = Math.cos(a) * Math.cos(b) * 7;
      const startY = Math.sin(b) * 5;
      const startZ = Math.sin(a) * Math.cos(b) * 4 - 2;
      const level = this.band(i, count, bins);
      // On each beat the block swells outward from its centre and springs back.
      const push = 1 + this.kick * 0.16 * f.intensity;
      const jitter = (this.seedB[i]! - 0.5) * 0.06 * f.intensity * f.audio.high;
      const px = startX + (x[i]! * push - startX) * ease + jitter;
      const py = startY + (y[i]! * push - startY) * ease + jitter;
      const s = size * (0.6 + 0.4 * ease) * (1 + level * 0.5 * f.intensity);
      const color = f
        .colorAt(count <= 1 ? 0 : i / (count - 1), this.color)
        .lerp(this.white, level * 0.22 + this.kick * 0.15);
      this.put(
        i,
        chars[i]!,
        px,
        py,
        startZ * (1 - ease),
        s,
        s,
        (1 - ease) * (this.seedA[i]! - 0.5) * 8,
        (1 - ease) * (this.seedB[i]! - 0.5) * 10,
        color,
        0.15 + 0.85 * ease,
      );
    }
    return count;
  }

  /** The phrase wrapped round a turning cylinder: readable at the front, ghosted behind. */
  private ring(f: GlyphFrame): number {
    const { chars, x, count } = this.layout;
    const bins = f.audio.bins;
    const size = 0.42 * f.scale;
    // Layout x is in units of an unbounded line; rescale to this glyph size.
    const unit = this.layout.size > 0 ? size / this.layout.size : 1;
    const span = count > 0 ? (x[count - 1]! - x[0]!) * unit + size * ADVANCE * 3 : 1;
    const radius = Math.max(2.3 * f.scale, span / (Math.PI * 2));
    this.ringAngle += f.dt * (0.45 + f.audio.mid * 0.8 * f.intensity);
    for (let i = 0; i < count; i++) {
      const a = (x[i]! * unit) / radius - this.ringAngle;
      const facing = Math.cos(a);
      const level = this.band(i, count, bins);
      const s = size * (1 + level * 0.9 * f.intensity);
      const color = f
        .colorAt(count <= 1 ? 0 : i / (count - 1), this.color)
        .lerp(this.white, level * 0.5);
      const front = Math.min(1, Math.max(0, (facing + 0.15) / 0.6));
      this.put(
        i,
        chars[i]!,
        Math.sin(a) * radius,
        Math.sin(a * 2 + f.time) * 0.12 * (0.5 + f.intensity),
        facing * radius - radius * 0.55,
        s,
        s,
        a,
        0,
        color,
        0.1 + 0.9 * front,
      );
    }
    return count;
  }

  /** The phrase's own characters falling in streams, faster where the spectrum is loud. */
  private rain(f: GlyphFrame): number {
    const source = this.layout.count > 0 ? this.layout.chars : ["A", "U", "R", "A"];
    const bins = f.audio.bins;
    const size = 0.36 * f.scale;
    const step = size * 1.1;
    const top = 3.4 * f.scale;
    const span = 7.4 * f.scale;
    let used = 0;
    for (let c = 0; c < RAIN_COLS; c++) {
      const seed = this.seedA[c]!;
      const level = this.band(c, RAIN_COLS, bins);
      const speed = 1.3 + seed * 1.5 + level * 3.2 * f.intensity;
      const travel = f.time * speed + seed * 23;
      const head = top - (travel % span);
      // Characters stay put in space while the stream passes over them.
      const cellRow = Math.floor(travel / step);
      const columnX = (c - (RAIN_COLS - 1) / 2) * size * 1.25;
      for (let r = 0; r < RAIN_ROWS && used < MAX_GLYPHS; r++) {
        const index = (((c * 7 + cellRow - r) % source.length) + source.length) % source.length;
        const fade = Math.pow(1 - r / RAIN_ROWS, 1.6);
        const color =
          r === 0
            ? this.color.copy(this.white)
            : f.colorAt(c / (RAIN_COLS - 1), this.color).lerp(this.white, level * 0.3);
        this.put(
          used,
          source[index]!,
          columnX,
          head + r * step,
          -seed * 1.5,
          size,
          size,
          0,
          0,
          color,
          fade * (0.78 + level * 0.22),
        );
        used += 1;
      }
    }
    return used;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.dispose();
    this.atlas.dispose();
  }
}
