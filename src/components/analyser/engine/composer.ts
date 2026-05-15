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
} from "./shaders";
import { BLOOM_STRENGTH_MAX_NORMAL, type Settings } from "../store";
import { MotionTrailPass } from "./MotionTrailPass";

export type PostFxReactiveState = {
  bass: number;
  mid: number;
  high: number;
  centroid: number;
  beat: boolean;
  pulse: number;
  performance: boolean;
};

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
  pixelate: ShaderPass;
  tiltShift: ShaderPass;
  radialBlur: ShaderPass;
  grade: ShaderPass;
  sobel: ShaderPass;
  smaa: SMAAPass;
  width: number;
  height: number;

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

    this.bokeh = new BokehPass(scene, camera, { focus: 8, aperture: 0.0006, maxblur: 0.01 });
    this.composer.addPass(this.bokeh);

    this.chroma = new ShaderPass(ChromaticAberrationShader);
    this.composer.addPass(this.chroma);

    this.tiltShift = new ShaderPass(TiltShiftShader);
    this.composer.addPass(this.tiltShift);

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

  apply(s: Settings, reactive: PostFxReactiveState) {
    const bass = reactive.bass ?? 0;
    const mid = reactive.mid ?? 0;
    const high = reactive.high ?? 0;
    const centroid = reactive.centroid ?? 0.5;
    const pulse = reactive.pulse ?? (reactive.beat ? 1 : 0);

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
    const bloomStrength = s.bloomExtreme
      ? s.bloomStrength
      : Math.min(BLOOM_STRENGTH_MAX_NORMAL, s.bloomStrength);
    this.bloom.strength = bloomStrength;
    this.bloom.radius = s.bloomRadius;
    this.bloom.threshold = s.bloomThreshold;

    this.chroma.enabled = s.chroma;
    this.chroma.uniforms.amount.value = s.chromaAmount;

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

    this.glitch.enabled = s.glitch;
    this.glitch.goWild = s.glitchWild;

    this.godRays.enabled = s.godRays;
    this.godRays.uniforms.amount.value = s.godRaysAmount;

    this.pixelate.enabled = s.pixelate;
    this.pixelate.uniforms.pixelSize.value = s.pixelSize;

    this.tiltShift.enabled = s.tiltShift;
    this.tiltShift.uniforms.amount.value = s.tiltAmount;

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
    this.sobel.uniforms.fillMix.value = THREE.MathUtils.clamp(
      s.sobelFillMix * (0.85 + bass * 0.5),
      0,
      1,
    );
  }

  resize(w: number, h: number) {
    this.width = w;
    this.height = h;
    this.composer.setSize(w, h);
    (this.pixelate.uniforms.resolution.value as [number, number]) = [w, h];
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
    this.motionTrails.dispose();
    this.ssao.dispose();
    this.composer.dispose();
  }
}
