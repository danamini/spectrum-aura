import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { FilmPass } from "three/examples/jsm/postprocessing/FilmPass.js";
import { BokehPass } from "three/examples/jsm/postprocessing/BokehPass.js";
import { GlitchPass } from "three/examples/jsm/postprocessing/GlitchPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import {
  ChromaticAberrationShader,
  VignetteShader,
  PixelateShader,
  TiltShiftShader,
  GodRaysShader,
  ColorGradeShader,
} from "./shaders";
import { BLOOM_STRENGTH_MAX_NORMAL, type Settings } from "../store";

export class Composer {
  composer: EffectComposer;
  renderPass: RenderPass;
  bloom: UnrealBloomPass;
  chroma: ShaderPass;
  film: FilmPass;
  vignette: ShaderPass;
  bokeh: BokehPass;
  glitch: GlitchPass;
  godRays: ShaderPass;
  pixelate: ShaderPass;
  tiltShift: ShaderPass;
  grade: ShaderPass;
  smaa: SMAAPass;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    width: number,
    height: number,
  ) {
    this.composer = new EffectComposer(renderer);
    this.composer.setSize(width, height);

    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

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

    this.pixelate = new ShaderPass(PixelateShader);
    (this.pixelate.uniforms.resolution.value as [number, number]) = [width, height];
    this.composer.addPass(this.pixelate);

    this.film = new FilmPass(0.25, false);
    this.composer.addPass(this.film);

    this.glitch = new GlitchPass();
    this.composer.addPass(this.glitch);

    this.grade = new ShaderPass(ColorGradeShader);
    this.composer.addPass(this.grade);

    this.vignette = new ShaderPass(VignetteShader);
    this.composer.addPass(this.vignette);

    this.smaa = new SMAAPass();
    this.smaa.setSize(width, height);
    this.composer.addPass(this.smaa);
  }

  apply(s: Settings) {
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

    this.grade.enabled = s.grading;
    this.grade.uniforms.exposure.value = s.exposure;
    this.grade.uniforms.contrast.value = s.contrast;
    this.grade.uniforms.saturation.value = s.saturation;
    this.grade.uniforms.hue.value = s.hue;
  }

  resize(w: number, h: number) {
    this.composer.setSize(w, h);
    (this.pixelate.uniforms.resolution.value as [number, number]) = [w, h];
    this.bloom.setSize(w, h);
  }

  render(delta: number) {
    this.composer.render(delta);
  }

  dispose() {
    this.composer.dispose();
  }
}
