import * as THREE from "three";
import { SEVEN_SEGMENT } from "./instrument-math";
import type { ViewFrame } from "./types";

/** Drawing surface, in canvas pixels. All instrument layouts are authored at this size. */
export const PANEL_W = 1920;
export const PANEL_H = 1080;
const PLANE_W = 16;
const PLANE_H = 9;
const FOV = 38;
/** Scene units per canvas pixel. */
const PX = PLANE_W / PANEL_W;

const FONT_LABEL = '"Michroma", "Eurostile", "Helvetica Neue", Arial, sans-serif';
const FONT_MONO = '"Share Tech Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace';
export const labelFont = (px: number) => `${px}px ${FONT_LABEL}`;
export const monoFont = (px: number) => `${px}px ${FONT_MONO}`;

export type Layer = { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D | null };

export function createLayer(width = PANEL_W, height = PANEL_H): Layer {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return { canvas, ctx: canvas.getContext("2d") };
}

export const cssColor = (c: THREE.Color) => `#${c.getHexString()}`;

/**
 * A 2D canvas shown as a flat panel in the scene. Instrument views draw
 * dials, graphs and lettering with the canvas API (where text is cheap) and
 * the panel uploads the result as one texture, so bloom and the other post
 * effects treat it like any other scene.
 */
export class InstrumentPanel {
  readonly group = new THREE.Group();
  readonly ctx: CanvasRenderingContext2D | null;
  /** Bumped once the web fonts have loaded, so cached lettering can be redrawn. */
  fontsVersion = 0;
  private readonly canvas: HTMLCanvasElement;
  private readonly texture: THREE.CanvasTexture;
  private readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private disposed = false;
  /** Knobs, keys and sockets that stand proud of the panel in 3D. */
  private readonly hardware = new THREE.Group();
  private readonly topMaterial: THREE.MeshBasicMaterial;
  private readonly sideMaterial = new THREE.MeshStandardMaterial({
    color: 0x6b6e73,
    metalness: 0.35,
    roughness: 0.4,
  });

  constructor() {
    const layer = createLayer();
    this.canvas = layer.canvas;
    this.ctx = layer.ctx;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.generateMipmaps = false;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(PLANE_W, PLANE_H),
      new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false, fog: false }),
    );
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);
    this.topMaterial = new THREE.MeshBasicMaterial({
      map: this.texture,
      toneMapped: false,
      fog: false,
    });
    // The raised parts are the only lit surfaces: a key light from the upper
    // left, as if the rack stood under a lamp, and a little fill.
    const key = new THREE.DirectionalLight(0xffffff, 2.6);
    key.position.set(-5, 7, 9);
    this.hardware.add(key, new THREE.AmbientLight(0xffffff, 0.55));
    this.hardware.visible = false;
    this.group.add(this.hardware);

    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (fonts && typeof fonts.load === "function") {
      void Promise.all([fonts.load(labelFont(16)), fonts.load(monoFont(16))])
        .then(() => {
          if (!this.disposed) this.fontsVersion++;
        })
        .catch(() => {
          // The fallback fonts are already in use; nothing to do.
        });
    }
  }

  /**
   * Stands a round control (a knob, a socket) up off the panel. Centre and
   * radius are in canvas pixels, `depth` in scene units. The face is cut
   * from the panel's own drawing, so whatever is painted there (pointer
   * line, legend) rides on top; the sides are lit metal.
   */
  raiseDisc(cx: number, cy: number, radius: number, depth: number): void {
    const x = (cx - PANEL_W / 2) * PX;
    const y = (PANEL_H / 2 - cy) * PX;
    const r = radius * PX;
    const skirt = depth * 0.8;
    const side = new THREE.CylinderGeometry(r, r, skirt, 56, 1, true).rotateX(Math.PI / 2);
    const bevel = new THREE.CylinderGeometry(r * 0.9, r, depth - skirt, 56, 1, true).rotateX(
      Math.PI / 2,
    );
    const top = new THREE.CircleGeometry(r * 0.9, 56);
    this.mapToPanel(top, x, y, 0, top.attributes.position!.count);
    const parts: Array<[THREE.BufferGeometry, THREE.Material, number]> = [
      [side, this.sideMaterial, skirt / 2],
      [bevel, this.sideMaterial, skirt + (depth - skirt) / 2],
      [top, this.topMaterial, depth],
    ];
    for (const [geometry, material, z] of parts) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      mesh.frustumCulled = false;
      this.hardware.add(mesh);
    }
  }

  /** Stands a rectangular control (a key, a push button) up off the panel. */
  raiseBox(left: number, topPx: number, w: number, h: number, depth: number): void {
    const x = (left + w / 2 - PANEL_W / 2) * PX;
    const y = (PANEL_H / 2 - (topPx + h / 2)) * PX;
    const geometry = new THREE.BoxGeometry(w * PX, h * PX, depth);
    // Box faces are ordered +x, -x, +y, -y, +z, -z, four vertices each.
    this.mapToPanel(geometry, x, y, 16, 4);
    const side = this.sideMaterial;
    const mesh = new THREE.Mesh(geometry, [side, side, side, side, this.topMaterial, side]);
    mesh.position.set(x, y, depth / 2);
    mesh.frustumCulled = false;
    this.hardware.add(mesh);
  }

  /** Points a run of vertices' UVs at the part of the panel they sit over. */
  private mapToPanel(
    geometry: THREE.BufferGeometry,
    x: number,
    y: number,
    start: number,
    count: number,
  ): void {
    const position = geometry.attributes.position!;
    const uv = geometry.attributes.uv!;
    for (let i = start; i < start + count; i++) {
      uv.setXY(i, (x + position.getX(i)) / PLANE_W + 0.5, (y + position.getY(i)) / PLANE_H + 0.5);
    }
    uv.needsUpdate = true;
  }

  /** Call after drawing a frame. */
  commit(): void {
    this.texture.needsUpdate = true;
  }

  /**
   * Frames the panel to fill the viewport. In 3D it drifts a little, leans
   * with the mouse and nudges in on the kick. With `flat` (the view's 2D
   * mode) it is held dead square and still, like a printed faceplate.
   */
  frameCamera(f: ViewFrame, flat = false): void {
    // The printed 2D faceplate has nothing standing off it.
    this.hardware.visible = !flat;
    if (f.xrMode) return;
    const camera = f.camera;
    const half = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const aspect = camera.aspect > 0 ? camera.aspect : PLANE_W / PLANE_H;
    const fit = Math.max(PLANE_H / 2 / half, PLANE_W / 2 / (half * aspect)) * (flat ? 1 : 1.02);
    let targetX = 0;
    let targetY = 0;
    let dist = fit;
    if (!flat) {
      dist = fit * (1 - f.kick * 0.014);
      const sway = 0.3 + f.drift;
      targetX =
        Math.sin(f.time * 0.19) * dist * 0.018 * sway +
        (f.opts.cameraMouse ? Math.sin(f.mouseYaw) * dist * 0.2 : 0);
      targetY =
        Math.sin(f.time * 0.13) * dist * 0.012 * sway +
        (f.opts.cameraMouse ? Math.sin(f.mousePitch) * dist * 0.14 : 0);
    }
    const follow = Math.min(1, f.dt * (flat ? 12 : 5));
    camera.position.x += (targetX - camera.position.x) * follow;
    camera.position.y += (targetY - camera.position.y) * follow;
    camera.position.z += (dist - camera.position.z) * follow;
    if (camera.fov !== FOV) {
      camera.fov = FOV;
      camera.updateProjectionMatrix();
    }
    camera.lookAt(camera.position.x * (flat ? 1 : 0), camera.position.y * (flat ? 1 : 0), 0);
  }

  dispose(): void {
    this.disposed = true;
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.hardware.traverse((child) => {
      if (child instanceof THREE.Mesh) child.geometry.dispose();
    });
    this.topMaterial.dispose();
    this.sideMaterial.dispose();
    this.texture.dispose();
  }
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Draws `text` as a seven-segment display with its left edge at `x` and top
 * at `y`. Unlit segments are drawn in `off` so the display reads as glass
 * with dark digits behind it, like a real fluorescent or LED readout.
 * Returns the x position after the last digit.
 */
export function drawSevenSegment(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  height: number,
  on: string,
  off: string,
): number {
  const w = height * 0.52;
  const t = height * 0.11;
  const gap = height * 0.2;
  const half = height / 2;
  ctx.lineCap = "round";
  ctx.lineWidth = t;
  let cx = x;
  for (const ch of text) {
    if (ch === ".") {
      ctx.fillStyle = on;
      ctx.beginPath();
      // The point gets its own slot so it cannot merge with a neighbouring stroke.
      ctx.arc(cx - gap / 2 + t * 0.8, y + height, t * 0.62, 0, Math.PI * 2);
      ctx.fill();
      cx += t * 1.6;
      continue;
    }
    const mask = SEVEN_SEGMENT[ch] ?? 0;
    const i = t * 0.9;
    // [x1, y1, x2, y2] for segments in bit order.
    const segs = [
      [cx + i, y, cx + w - i, y],
      [cx + w, y + i, cx + w, y + half - i],
      [cx + w, y + half + i, cx + w, y + height - i],
      [cx + i, y + height, cx + w - i, y + height],
      [cx, y + half + i, cx, y + height - i],
      [cx, y + i, cx, y + half - i],
      [cx + i, y + half, cx + w - i, y + half],
    ];
    for (let s = 0; s < 7; s++) {
      const p = segs[s]!;
      ctx.strokeStyle = mask & (1 << s) ? on : off;
      ctx.beginPath();
      ctx.moveTo(p[0]!, p[1]!);
      ctx.lineTo(p[2]!, p[3]!);
      ctx.stroke();
    }
    cx += w + gap;
  }
  return cx;
}

/** An indicator lamp: nothing when off, a bright core with a halo when lit (0–1). */
export function drawLamp(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  lit: number,
): void {
  if (lit <= 0.01) return;
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.16 * lit;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.35 * lit;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = lit;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}
