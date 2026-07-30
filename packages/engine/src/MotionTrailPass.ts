import * as THREE from "three";
import { FullScreenQuad, Pass } from "three/examples/jsm/postprocessing/Pass.js";

const FullscreenVert = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const TrailFrag = /* glsl */ `
  uniform sampler2D tCurrent;
  uniform sampler2D tHistory;
  uniform float decay;
  uniform float inject;
  uniform float threshold;
  varying vec2 vUv;

  float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

  void main() {
    vec4 cur = texture2D(tCurrent, vUv);
    vec4 prev = texture2D(tHistory, vUv) * decay;

    float mask = smoothstep(threshold, threshold + 0.2, luma(cur.rgb));
    vec3 trailed = max(prev.rgb, cur.rgb * inject * mask);
    vec3 outCol = max(cur.rgb, trailed);

    gl_FragColor = vec4(outCol, 1.0);
  }
`;

export class MotionTrailPass extends Pass {
  private historyA: THREE.WebGLRenderTarget;
  private historyB: THREE.WebGLRenderTarget;
  private readonly material: THREE.ShaderMaterial;
  private readonly quad: FullScreenQuad;

  constructor(width: number, height: number) {
    super();

    const targetOptions: THREE.RenderTargetOptions = {
      depthBuffer: false,
      stencilBuffer: false,
      magFilter: THREE.LinearFilter,
      minFilter: THREE.LinearFilter,
    };
    this.historyA = new THREE.WebGLRenderTarget(
      Math.max(1, width >> 1),
      Math.max(1, height >> 1),
      targetOptions,
    );
    this.historyB = this.historyA.clone();
    this.historyA.texture.name = "MotionTrailPass.historyA";
    this.historyB.texture.name = "MotionTrailPass.historyB";

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tCurrent: { value: null },
        tHistory: { value: this.historyA.texture },
        decay: { value: 0.92 },
        inject: { value: 1.15 },
        threshold: { value: 0.1 },
      },
      vertexShader: FullscreenVert,
      fragmentShader: TrailFrag,
      depthTest: false,
      depthWrite: false,
    });

    this.quad = new FullScreenQuad(this.material);
  }

  setParameters({
    decay,
    inject,
    threshold,
  }: {
    decay: number;
    inject: number;
    threshold: number;
  }) {
    this.material.uniforms.decay.value = decay;
    this.material.uniforms.inject.value = inject;
    this.material.uniforms.threshold.value = threshold;
  }

  reset(renderer?: THREE.WebGLRenderer) {
    const previousTarget = renderer?.getRenderTarget() ?? null;
    renderer?.setRenderTarget(this.historyA);
    renderer?.clear(true, true, true);
    renderer?.setRenderTarget(this.historyB);
    renderer?.clear(true, true, true);
    renderer?.setRenderTarget(previousTarget);
  }

  setSize(width: number, height: number) {
    const w = Math.max(1, width >> 1);
    const h = Math.max(1, height >> 1);
    this.historyA.setSize(w, h);
    this.historyB.setSize(w, h);
    this.reset();
  }

  render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
  ) {
    this.material.uniforms.tCurrent.value = readBuffer.texture;
    this.material.uniforms.tHistory.value = this.historyA.texture;

    renderer.setRenderTarget(this.historyB);
    renderer.clear();
    this.quad.render(renderer);

    this.material.uniforms.tCurrent.value = this.historyB.texture;
    this.material.uniforms.tHistory.value = this.historyB.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);

    [this.historyA, this.historyB] = [this.historyB, this.historyA];
  }

  dispose() {
    this.historyA.dispose();
    this.historyB.dispose();
    this.material.dispose();
    this.quad.dispose();
  }
}
