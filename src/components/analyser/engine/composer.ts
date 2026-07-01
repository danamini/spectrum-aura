import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { FilmPass } from "three/examples/jsm/postprocessing/FilmPass.js";
import { BokehPass } from "three/examples/jsm/postprocessing/BokehPass.js";
import { GlitchPass } from "three/examples/jsm/postprocessing/GlitchPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { SSAOPass } from "three/examples/jsm/postprocessing/SSAOPass.js";
import {
  BlueprintSobelShader,
  ChromaticAberrationShader,
  VignetteShader,
  PixelateShader,
  TiltShiftShader,
  GodRaysShader,
  ColorGradeShader,
  RadialBlurShader,
  LensFlareShader,
  AssetOverlayShader,
  KaleidoscopeShader,
  MirrorShader,
  CRTCShader,
  ProjectorFilmShader,
} from "./shaders";
import { BLOOM_STRENGTH_MAX_NORMAL, type Settings } from "../store";
import { MotionTrailPass } from "./MotionTrailPass";

/** Glitch duty-cycle window length in frames (~1s at 60fps) — see `glitchIntensity`. */
const GLITCH_DUTY_WINDOW_FRAMES = 60;

/**
 * AssetOverlay texture-swap timing. Two independent estimates of "how long to
 * hold the current texture" are blended: one derived from the beat period
 * (tighter as BPM confidence rises), one from raw audio energy (shorter as
 * the track gets louder/more active). Both are clamped to the same overall
 * bounds so neither can produce an implausibly short or long hold.
 */
const ASSET_OVERLAY_SWITCH_INTERVAL_MAX_S = 3.2;
/** `beatSyncedInterval = beatPeriod * (BASE - confidence * CONFIDENCE_SCALE)`. */
const ASSET_OVERLAY_BEAT_SYNC_MIN_S = 0.45;
const ASSET_OVERLAY_BEAT_SYNC_BASE = 2.2;
const ASSET_OVERLAY_BEAT_SYNC_CONFIDENCE_SCALE = 1.2;
/** `energyInterval = BASE - activity * ACTIVITY_SCALE - pulse * PULSE_SCALE`. */
const ASSET_OVERLAY_ENERGY_INTERVAL_MIN_S = 0.35;
const ASSET_OVERLAY_ENERGY_INTERVAL_BASE = 2.6;
const ASSET_OVERLAY_ENERGY_ACTIVITY_SCALE = 1.45;
const ASSET_OVERLAY_ENERGY_PULSE_SCALE = 0.75;
/** How strongly the beat-synced estimate pulls the blend once BPM is confident. */
const ASSET_OVERLAY_BEAT_SYNC_BLEND_WEIGHT = 0.85;

export type PostFxReactiveState = {
  bass: number;
  mid: number;
  high: number;
  centroid: number;
  beat: boolean;
  bpm: number;
  bpmConfidence: number;
  pulse: number;
  performance: boolean;
  /** Auto-detected quality tier (0 = full, 1 = moderate pressure, 2 = severe) — see `computeQualityTier`. */
  qualityTier: 0 | 1 | 2;
};

const TIER_DOWNGRADE_TO_2_FPS = 30;
const TIER_DOWNGRADE_TO_1_FPS = 45;
const TIER_UPGRADE_TO_1_FPS = 52;
const TIER_UPGRADE_TO_0_FPS = 58;

/**
 * Hysteresis-based performance tier from smoothed FPS: downgrades immediately
 * under pressure (a stutter should get relief right away), but only upgrades
 * once FPS has recovered past a higher margin than the downgrade threshold —
 * without that gap, FPS hovering near a single cutoff would flap the tier
 * every frame. Never skips a tier when recovering (2 -> 1 -> 0), so quality
 * comes back gradually rather than snapping straight to full.
 */
export function computeQualityTier(smoothedFps: number, currentTier: 0 | 1 | 2): 0 | 1 | 2 {
  if (smoothedFps < TIER_DOWNGRADE_TO_2_FPS) return 2;
  if (smoothedFps < TIER_DOWNGRADE_TO_1_FPS) return currentTier >= 1 ? currentTier : 1;
  if (currentTier === 2) return smoothedFps >= TIER_UPGRADE_TO_1_FPS ? 1 : 2;
  if (currentTier === 1) return smoothedFps >= TIER_UPGRADE_TO_0_FPS ? 0 : 1;
  return 0;
}

export class Composer {
  renderer: THREE.WebGLRenderer;
  composer: EffectComposer;
  renderPass: RenderPass;
  ssao: SSAOPass;
  motionTrails: MotionTrailPass;
  bloom: UnrealBloomPass;
  chroma: ShaderPass;
  film: FilmPass;
  vignette: ShaderPass;
  bokeh: BokehPass;
  glitch: GlitchPass;
  godRays: ShaderPass;
  lensFlare: ShaderPass;
  assetOverlay: ShaderPass;
  pixelate: ShaderPass;
  tiltShift: ShaderPass;
  kaleidoscope: ShaderPass;
  mirrorFx: ShaderPass;
  crtFx: ShaderPass;
  projectorFilmFx: ShaderPass;
  radialBlur: ShaderPass;
  grade: ShaderPass;
  sobel: ShaderPass;
  smaa: SMAAPass;
  width: number;
  height: number;
  private assetOverlayTime = 0;
  private assetOverlayTextures: THREE.Texture[] = [];
  private assetOverlayPool: THREE.Texture[] = [];
  private assetOverlayCurrentSlots: [number, number, number] = [0, 1, 2];
  private assetOverlayNextSlots: [number, number, number] = [0, 1, 2];
  private assetOverlayTransition = 1;
  private assetOverlaySwitchElapsed = 0;
  private assetOverlaySwitchEvery = 1.35;
  private assetOverlayBeatHoldoff = 0;
  private retroFxTime = 0;
  private glitchDutyFrame = 0;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    width: number,
    height: number,
  ) {
    this.renderer = renderer;
    this.width = width;
    this.height = height;
    this.composer = new EffectComposer(renderer);
    this.composer.setSize(width, height);

    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    this.ssao = new SSAOPass(scene, camera, width, height);
    this.ssao.kernelRadius = 8;
    this.ssao.minDistance = 0.002;
    this.ssao.maxDistance = 0.08;
    this.ssao.enabled = false;
    this.composer.addPass(this.ssao);

    this.motionTrails = new MotionTrailPass(width, height);
    this.motionTrails.enabled = false;
    this.composer.addPass(this.motionTrails);

    this.bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 1.1, 0.7, 0.15);
    this.composer.addPass(this.bloom);

    this.godRays = new ShaderPass(GodRaysShader);
    this.composer.addPass(this.godRays);

    this.lensFlare = new ShaderPass(LensFlareShader);
    this.composer.addPass(this.lensFlare);

    this.assetOverlay = new ShaderPass(AssetOverlayShader);
    this.composer.addPass(this.assetOverlay);
    const overlayTextures = this.createOverlayTextures();
    this.assetOverlayTextures = overlayTextures;
    this.assetOverlayPool = [...overlayTextures];
    this.assetOverlay.uniforms.tOverlayA.value = overlayTextures[0] ?? null;
    this.assetOverlay.uniforms.tOverlayB.value = overlayTextures[1] ?? null;
    this.assetOverlay.uniforms.tOverlayC.value = overlayTextures[2] ?? null;
    this.assetOverlay.uniforms.tOverlayA2.value = overlayTextures[0] ?? null;
    this.assetOverlay.uniforms.tOverlayB2.value = overlayTextures[1] ?? null;
    this.assetOverlay.uniforms.tOverlayC2.value = overlayTextures[2] ?? null;
    this.assetOverlay.uniforms.transition.value = 1;
    this.loadExternalOverlayTextures();

    this.bokeh = new BokehPass(scene, camera, { focus: 8, aperture: 0.0006, maxblur: 0.01 });
    this.composer.addPass(this.bokeh);

    this.chroma = new ShaderPass(ChromaticAberrationShader);
    this.composer.addPass(this.chroma);

    this.tiltShift = new ShaderPass(TiltShiftShader);
    this.composer.addPass(this.tiltShift);

    this.kaleidoscope = new ShaderPass(KaleidoscopeShader);
    this.composer.addPass(this.kaleidoscope);

    this.mirrorFx = new ShaderPass(MirrorShader);
    this.composer.addPass(this.mirrorFx);

    this.crtFx = new ShaderPass(CRTCShader);
    this.crtFx.uniforms.resolution.value.set(width, height);
    this.composer.addPass(this.crtFx);

    this.projectorFilmFx = new ShaderPass(ProjectorFilmShader);
    this.composer.addPass(this.projectorFilmFx);

    this.radialBlur = new ShaderPass(RadialBlurShader);
    this.composer.addPass(this.radialBlur);

    this.pixelate = new ShaderPass(PixelateShader);
    (this.pixelate.uniforms.resolution.value as [number, number]) = [width, height];
    this.composer.addPass(this.pixelate);

    this.film = new FilmPass(0.25, false);
    this.composer.addPass(this.film);

    this.glitch = new GlitchPass();
    this.composer.addPass(this.glitch);

    this.grade = new ShaderPass(ColorGradeShader);
    this.composer.addPass(this.grade);

    this.sobel = new ShaderPass(BlueprintSobelShader);
    this.sobel.uniforms.resolution.value.set(width, height);
    this.composer.addPass(this.sobel);

    this.vignette = new ShaderPass(VignetteShader);
    this.composer.addPass(this.vignette);

    this.smaa = new SMAAPass();
    this.smaa.setSize(width, height);
    this.composer.addPass(this.smaa);
  }

  private createOverlayTexture(variant: number) {
    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, size, size);

      if (variant === 0) {
        ctx.strokeStyle = "rgba(116, 212, 255, 0.25)";
        ctx.lineWidth = 2;
        for (let i = 32; i < size; i += 32) {
          ctx.beginPath();
          ctx.moveTo(i, 0);
          ctx.lineTo(i, size);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(0, i);
          ctx.lineTo(size, i);
          ctx.stroke();
        }
      }

      if (variant === 1) {
        ctx.strokeStyle = "rgba(156, 238, 255, 0.28)";
        ctx.lineWidth = 4;
        for (let i = 0; i < 8; i++) {
          const r = 48 + i * 30;
          ctx.beginPath();
          ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      if (variant === 2) {
        ctx.strokeStyle = "rgba(128, 220, 255, 0.25)";
        ctx.lineWidth = 3;
        for (let x = -size; x < size * 2; x += 30) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x + size, size);
          ctx.stroke();
        }
      }

      ctx.strokeStyle = "rgba(188, 243, 255, 0.3)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, 160, 0, Math.PI * 2);
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
  }

  private createOverlayTextures() {
    return [
      this.createOverlayTexture(0),
      this.createOverlayTexture(1),
      this.createOverlayTexture(2),
    ];
  }

  private loadExternalOverlayTextures() {
    const baseUrl = (import.meta.env.BASE_URL || "/").replace(/\/*$/, "/");
    const toPublicUrl = (path: string) => `${baseUrl}${path.replace(/^\/+/, "")}`;
    const imagePaths = [
      "assets/textures/overlay-grid.svg",
      "assets/textures/overlay-circles.svg",
      "assets/textures/overlay-hud.svg",
      "assets/animations/svg/layer-wave.svg",
      "assets/animations/svg/layer-scanlines.svg",
      "assets/animations/svg/layer-circuit.svg",
      "assets/animations/svg/layer-spiral.svg",
    ];
    const loader = new THREE.TextureLoader();
    imagePaths.forEach((path) => {
      loader.load(
        toPublicUrl(path),
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.minFilter = THREE.LinearFilter;
          texture.magFilter = THREE.LinearFilter;
          texture.generateMipmaps = false;
          this.assetOverlayPool.push(texture);
        },
        undefined,
        () => {
          // Keep generated fallback textures when optional overlays are missing.
        },
      );
    });
  }

  private setAssetOverlaySlots(slots: [number, number, number], target: "current" | "next") {
    const pick = (idx: number) => this.assetOverlayPool[idx % this.assetOverlayPool.length] ?? null;
    const a = pick(slots[0]);
    const b = pick(slots[1]);
    const c = pick(slots[2]);
    if (target === "current") {
      this.assetOverlay.uniforms.tOverlayA.value = a;
      this.assetOverlay.uniforms.tOverlayB.value = b;
      this.assetOverlay.uniforms.tOverlayC.value = c;
      return;
    }
    this.assetOverlay.uniforms.tOverlayA2.value = a;
    this.assetOverlay.uniforms.tOverlayB2.value = b;
    this.assetOverlay.uniforms.tOverlayC2.value = c;
  }

  apply(s: Settings, reactive: PostFxReactiveState) {
    const bass = reactive.bass ?? 0;
    const mid = reactive.mid ?? 0;
    const high = reactive.high ?? 0;
    const centroid = reactive.centroid ?? 0.5;
    const bpm = reactive.bpm ?? 0;
    const bpmConfidence = reactive.bpmConfidence ?? 0;
    const pulse = reactive.pulse ?? (reactive.beat ? 1 : 0);
    this.retroFxTime += 1 / 60;

    this.ssao.enabled = s.ssao && !reactive.performance;
    this.ssao.kernelRadius = THREE.MathUtils.clamp(s.ssaoRadius * (0.75 + mid * 0.7), 2, 18);
    this.ssao.minDistance = Math.max(0.0015, s.ssaoDistance * 0.15);
    this.ssao.maxDistance = THREE.MathUtils.clamp(s.ssaoDistance * (0.9 + bass * 0.9), 0.02, 0.2);
    const ssaoCopyMaterial = this.ssao.copyMaterial as THREE.ShaderMaterial;
    if (ssaoCopyMaterial.uniforms.opacity) {
      ssaoCopyMaterial.uniforms.opacity.value = THREE.MathUtils.clamp(
        s.ssaoIntensity * (0.75 + (bass + mid) * 0.35),
        0,
        1,
      );
    }

    this.motionTrails.enabled = s.motionTrails;
    this.motionTrails.setParameters({
      decay: THREE.MathUtils.clamp(
        s.trailDecay - high * 0.08 - (reactive.beat ? 0.05 : 0),
        0.72,
        0.99,
      ),
      inject: THREE.MathUtils.clamp(s.trailInject + mid * 0.35, 0.5, 2.25),
      threshold: THREE.MathUtils.clamp(
        s.trailThreshold - bass * 0.12 - (reactive.beat ? 0.04 : 0),
        0.02,
        0.95,
      ),
    });

    this.bloom.enabled = s.bloom;
    const bloomBase = s.bloomExtreme
      ? s.bloomStrength
      : Math.min(BLOOM_STRENGTH_MAX_NORMAL, s.bloomStrength);
    // Breathe with bass, but never past the same ceiling the non-extreme cap
    // already enforced — re-clamped after the reactive multiply, not skipped.
    const bloomCeiling = s.bloomExtreme ? Infinity : BLOOM_STRENGTH_MAX_NORMAL;
    this.bloom.strength = Math.min(bloomCeiling, bloomBase * (0.85 + bass * 0.3));
    this.bloom.radius = s.bloomRadius;
    this.bloom.threshold = s.bloomThreshold;

    this.chroma.enabled = s.chroma;
    // Subtle shimmer on high-band transients (hi-hats, cymbals).
    this.chroma.uniforms.amount.value = Math.min(0.03, s.chromaAmount * (0.8 + high * 1.4));

    this.film.enabled = s.grain;
    // FilmPass exposes uniforms on its material; intensity = nIntensity uniform
    const mat = (this.film as unknown as { uniforms?: Record<string, { value: number }> }).uniforms;
    if (mat && mat.intensity) mat.intensity.value = s.grainAmount;
    else if (mat && mat.nIntensity) mat.nIntensity.value = s.grainAmount;

    this.vignette.enabled = s.vignette;
    this.vignette.uniforms.amount.value = s.vignetteAmount;

    this.bokeh.enabled = s.dof;
    const bu = this.bokeh.uniforms as Record<string, { value: number }>;
    if (bu.focus) bu.focus.value = s.dofFocus;
    if (bu.aperture) bu.aperture.value = s.dofAperture;
    if (bu.maxblur) bu.maxblur.value = s.dofMaxBlur;

    // Duty-cycle gate: GlitchPass itself has no continuous intensity knob (its
    // `amount` uniform is overwritten every frame by its own internal RNG), so
    // approximate intensity by only letting the pass actually render for a
    // fraction of each ~1s window, in one contiguous chunk rather than a
    // per-frame coin flip (which would just look like flicker).
    this.glitchDutyFrame = (this.glitchDutyFrame + 1) % GLITCH_DUTY_WINDOW_FRAMES;
    const glitchIntensity = THREE.MathUtils.clamp(s.glitchIntensity, 0, 1);
    const glitchDutyOn = this.glitchDutyFrame < glitchIntensity * GLITCH_DUTY_WINDOW_FRAMES;
    this.glitch.enabled = s.glitch && glitchDutyOn;
    this.glitch.goWild = s.glitchWild;

    this.godRays.enabled = s.godRays;
    this.godRays.uniforms.amount.value = s.godRaysAmount;

    this.lensFlare.enabled = s.lensFlare;
    this.lensFlare.uniforms.amount.value = s.lensFlareAmount;

    this.assetOverlay.enabled = s.assetOverlayFx;
    this.assetOverlayTime += 0.016 * s.assetOverlaySpeed * (0.7 + centroid * 1.2);
    this.assetOverlay.uniforms.time.value = this.assetOverlayTime;
    if (this.assetOverlayPool.length >= 3) {
      const frameStep = 1 / 60;
      this.assetOverlayBeatHoldoff = Math.max(0, this.assetOverlayBeatHoldoff - frameStep);
      const activity = THREE.MathUtils.clamp(
        bass * 0.45 + mid * 0.35 + high * 0.2 + pulse * 0.35,
        0,
        1.5,
      );
      const bpmActive = bpm > 40 && bpmConfidence > 0.2;
      const beatInterval = bpmActive ? 60 / bpm : 1;
      const beatSyncedInterval = THREE.MathUtils.clamp(
        beatInterval *
          (ASSET_OVERLAY_BEAT_SYNC_BASE -
            THREE.MathUtils.clamp(bpmConfidence, 0, 1) * ASSET_OVERLAY_BEAT_SYNC_CONFIDENCE_SCALE),
        ASSET_OVERLAY_BEAT_SYNC_MIN_S,
        ASSET_OVERLAY_SWITCH_INTERVAL_MAX_S,
      );
      const energyInterval = THREE.MathUtils.clamp(
        ASSET_OVERLAY_ENERGY_INTERVAL_BASE -
          activity * ASSET_OVERLAY_ENERGY_ACTIVITY_SCALE -
          pulse * ASSET_OVERLAY_ENERGY_PULSE_SCALE,
        ASSET_OVERLAY_ENERGY_INTERVAL_MIN_S,
        ASSET_OVERLAY_SWITCH_INTERVAL_MAX_S,
      );
      this.assetOverlaySwitchEvery = bpmActive
        ? THREE.MathUtils.lerp(
            energyInterval,
            beatSyncedInterval,
            bpmConfidence * ASSET_OVERLAY_BEAT_SYNC_BLEND_WEIGHT,
          )
        : energyInterval;
      this.assetOverlaySwitchElapsed += frameStep * (0.75 + activity * 1.4);

      const readyForTimedSwitch =
        this.assetOverlayTransition >= 1 &&
        this.assetOverlaySwitchElapsed >= this.assetOverlaySwitchEvery;
      const readyForBeatSwitch =
        this.assetOverlayTransition >= 1 &&
        reactive.beat &&
        bpmConfidence > 0.45 &&
        this.assetOverlayBeatHoldoff <= 0 &&
        this.assetOverlaySwitchElapsed >= Math.min(0.33, this.assetOverlaySwitchEvery * 0.55);

      if (readyForTimedSwitch || readyForBeatSwitch) {
        const len = this.assetOverlayPool.length;
        const strideA = 1 + Math.floor(THREE.MathUtils.clamp(high * 4 + pulse * 2, 0, 5));
        const strideB = 2 + Math.floor(THREE.MathUtils.clamp(mid * 5 + pulse * 1.5, 0, 5));
        const strideC = 3 + Math.floor(THREE.MathUtils.clamp(bass * 6 + centroid * 2, 0, 6));
        this.assetOverlayNextSlots = [
          (this.assetOverlayCurrentSlots[0] + strideA) % len,
          (this.assetOverlayCurrentSlots[1] + strideB) % len,
          (this.assetOverlayCurrentSlots[2] + strideC) % len,
        ];
        this.setAssetOverlaySlots(this.assetOverlayNextSlots, "next");
        this.assetOverlayTransition = 0;
        this.assetOverlaySwitchElapsed = 0;
        if (readyForBeatSwitch) {
          this.assetOverlayBeatHoldoff = THREE.MathUtils.clamp(beatInterval * 0.85, 0.24, 0.9);
        }
      }

      if (this.assetOverlayTransition < 1) {
        this.assetOverlayTransition = Math.min(
          1,
          this.assetOverlayTransition + frameStep * (0.9 + activity * 3.2 + pulse * 1.8),
        );
        this.assetOverlay.uniforms.transition.value = this.assetOverlayTransition;
        if (this.assetOverlayTransition >= 1) {
          this.assetOverlayCurrentSlots = this.assetOverlayNextSlots;
          this.setAssetOverlaySlots(this.assetOverlayCurrentSlots, "current");
          this.setAssetOverlaySlots(this.assetOverlayCurrentSlots, "next");
        }
      } else {
        this.assetOverlay.uniforms.transition.value = 1;
      }
    }
    this.assetOverlay.uniforms.pulse.value = THREE.MathUtils.clamp(
      pulse * 0.9 + bass * 0.4,
      0,
      1.5,
    );
    this.assetOverlay.uniforms.amount.value = THREE.MathUtils.clamp(
      s.assetOverlayAmount * (0.75 + high * 0.8),
      0,
      2,
    );

    this.pixelate.enabled = s.pixelate;
    this.pixelate.uniforms.pixelSize.value = s.pixelSize;

    this.tiltShift.enabled = s.tiltShift;
    this.tiltShift.uniforms.amount.value = s.tiltAmount;

    this.kaleidoscope.enabled = s.kaleidoscope;
    this.kaleidoscope.uniforms.sides.value = THREE.MathUtils.clamp(s.kaleidoscopeSides, 2, 24);
    this.kaleidoscope.uniforms.angle.value = s.kaleidoscopeAngle;

    this.mirrorFx.enabled = s.mirrorFx;
    this.mirrorFx.uniforms.mode.value =
      s.mirrorMode === "vertical" ? 1 : s.mirrorMode === "quad" ? 2 : 0;
    this.mirrorFx.uniforms.offset.value = THREE.MathUtils.clamp(s.mirrorOffset, -0.45, 0.45);

    this.crtFx.enabled = s.crtFx;
    this.crtFx.uniforms.scanlineIntensity.value = s.crtScanlineIntensity;
    this.crtFx.uniforms.curvature.value = s.crtCurvature;
    this.crtFx.uniforms.vignette.value = s.crtVignette;
    this.crtFx.uniforms.time.value = this.retroFxTime;

    this.projectorFilmFx.enabled = s.projectorFilmFx;
    this.projectorFilmFx.uniforms.amount.value = s.projectorFilmAmount;
    this.projectorFilmFx.uniforms.jitter.value = s.projectorFilmJitter;
    this.projectorFilmFx.uniforms.flicker.value = s.projectorFilmFlicker;
    this.projectorFilmFx.uniforms.time.value = this.retroFxTime;

    this.radialBlur.enabled = s.radialBlur && (s.radialBase > 0 || s.radialKickAmount > 0);
    this.radialBlur.uniforms.center.value.set(
      THREE.MathUtils.clamp(0.5 + (centroid - 0.5) * 0.18, 0.35, 0.65),
      THREE.MathUtils.clamp(0.5 - (centroid - 0.5) * 0.1, 0.38, 0.62),
    );
    this.radialBlur.uniforms.strength.value = THREE.MathUtils.clamp(
      s.radialBase + pulse * s.radialKickAmount,
      0,
      1.25,
    );
    this.radialBlur.uniforms.zoom.value = THREE.MathUtils.clamp(
      s.radialZoom * (0.9 + pulse * 0.2),
      0.05,
      1.2,
    );

    this.grade.enabled = s.grading;
    this.grade.uniforms.exposure.value = s.exposure;
    this.grade.uniforms.contrast.value = s.contrast;
    this.grade.uniforms.saturation.value = s.saturation;
    this.grade.uniforms.hue.value = s.hue;

    this.sobel.enabled = s.sobelMode;
    this.sobel.uniforms.edgeStrength.value = THREE.MathUtils.clamp(
      s.sobelStrength * (0.8 + high * 0.8),
      0.25,
      4,
    );
    this.sobel.uniforms.threshold.value = THREE.MathUtils.clamp(
      s.sobelThreshold - mid * 0.12,
      0.01,
      0.95,
    );
    // Manual "Performance Mode" / XR always forces the severe tier immediately,
    // regardless of measured FPS. Auto-detected pressure (qualityTier) escalates
    // gradually: tier 1 drops only the priciest/least-noticed passes (SSAO, DoF)
    // before tier 2's full cut — SSAOPass's kernel size is baked into its shader
    // at construction time, so there's no cheap continuous "lower quality" knob
    // for it; disabling it first is the graduated step actually available.
    const tier = reactive.performance ? 2 : reactive.qualityTier;
    if (tier >= 1) {
      this.ssao.enabled = false;
      this.bokeh.enabled = false;
    }
    if (tier >= 2) {
      this.smaa.enabled = false;
      this.motionTrails.enabled = false;
      this.film.enabled = false;
      this.assetOverlay.enabled = false;
      this.bloom.radius = Math.min(this.bloom.radius, 0.45);
      this.bloom.strength = Math.min(this.bloom.strength, 0.9);
    }
  }

  resize(w: number, h: number) {
    this.width = w;
    this.height = h;
    this.composer.setSize(w, h);
    (this.pixelate.uniforms.resolution.value as [number, number]) = [w, h];
    this.crtFx.uniforms.resolution.value.set(w, h);
    this.sobel.uniforms.resolution.value.set(w, h);
    this.bloom.setSize(w, h);
    this.ssao.setSize(w, h);
    this.motionTrails.setSize(w, h);
    this.motionTrails.reset(this.renderer);
  }

  render(delta: number) {
    this.composer.render(delta);
  }

  resetTemporalEffects() {
    this.motionTrails.reset(this.renderer);
  }

  dispose() {
    const textures = new Set([...this.assetOverlayTextures, ...this.assetOverlayPool]);
    textures.forEach((texture) => texture.dispose());
    this.assetOverlayTextures = [];
    this.assetOverlayPool = [];
    this.motionTrails.dispose();
    this.ssao.dispose();
    this.composer.dispose();
  }
}
