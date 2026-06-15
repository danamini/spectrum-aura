import * as THREE from "three";

// Custom shader-pass definitions and the sphere displacement shader.

export const ChromaticAberrationShader = {
  uniforms: {
    tDiffuse: { value: null },
    amount: { value: 0.0025 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float amount;
    varying vec2 vUv;
    void main() {
      vec2 dir = vUv - 0.5;
      float r = texture2D(tDiffuse, vUv + dir * amount).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - dir * amount).b;
      gl_FragColor = vec4(r,g,b,1.0);
    }
  `,
};

export const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    amount: { value: 1.0 },
  },
  vertexShader: ChromaticAberrationShader.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float amount;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float d = distance(vUv, vec2(0.5));
      float v = smoothstep(0.8, 0.2, d * amount);
      gl_FragColor = vec4(c.rgb * v, c.a);
    }
  `,
};

export const PixelateShader = {
  uniforms: {
    tDiffuse: { value: null },
    pixelSize: { value: 4.0 },
    resolution: { value: [1024, 1024] as [number, number] },
  },
  vertexShader: ChromaticAberrationShader.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float pixelSize;
    uniform vec2 resolution;
    varying vec2 vUv;
    void main() {
      vec2 dxy = pixelSize / resolution;
      vec2 coord = dxy * floor(vUv / dxy);
      gl_FragColor = texture2D(tDiffuse, coord);
    }
  `,
};

export const TiltShiftShader = {
  uniforms: {
    tDiffuse: { value: null },
    amount: { value: 1.0 },
  },
  vertexShader: ChromaticAberrationShader.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float amount;
    varying vec2 vUv;
    void main() {
      float dy = abs(vUv.y - 0.5);
      // Vignette-style focus band at center; blur at top/bottom (UV space — not / resolution).
      float band = smoothstep(0.06, 0.46, dy);
      float blur = band * amount * 0.022;
      vec2 o = vec2(blur * 1.15, blur * 1.35);
      vec4 c0 = texture2D(tDiffuse, vUv);
      vec4 c1 = texture2D(tDiffuse, vUv + vec2(o.x, 0.0));
      vec4 c2 = texture2D(tDiffuse, vUv - vec2(o.x, 0.0));
      vec4 c3 = texture2D(tDiffuse, vUv + vec2(0.0, o.y));
      vec4 c4 = texture2D(tDiffuse, vUv - vec2(0.0, o.y));
      vec4 c5 = texture2D(tDiffuse, vUv + o * 0.65);
      vec4 c6 = texture2D(tDiffuse, vUv - o * 0.65);
      gl_FragColor = c0 * 0.34 + (c1 + c2 + c3 + c4) * 0.13 + (c5 + c6) * 0.1;
    }
  `,
};

export const KaleidoscopeShader = {
  uniforms: {
    tDiffuse: { value: null },
    sides: { value: 6.0 },
    angle: { value: 0.0 },
  },
  vertexShader: ChromaticAberrationShader.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float sides;
    uniform float angle;
    varying vec2 vUv;

    void main() {
      vec2 center = vec2(0.5, 0.5);
      vec2 p = vUv - center;
      float r = length(p);
      float a = atan(p.y, p.x) + angle;
      float n = max(2.0, sides);
      float seg = 6.28318530718 / n;
      a = mod(a, seg);
      a = abs(a - seg * 0.5);
      vec2 uv = center + vec2(cos(a), sin(a)) * r;
      uv = clamp(uv, 0.0, 1.0);
      gl_FragColor = texture2D(tDiffuse, uv);
    }
  `,
};

export const MirrorShader = {
  uniforms: {
    tDiffuse: { value: null },
    mode: { value: 0.0 }, // 0=horizontal, 1=vertical, 2=quad
    offset: { value: 0.0 },
  },
  vertexShader: ChromaticAberrationShader.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float mode;
    uniform float offset;
    varying vec2 vUv;

    void main() {
      vec2 center = vec2(0.5 + offset, 0.5 + offset);
      vec2 uv = vUv;
      if (mode < 0.5) {
        uv.x = center.x + abs(vUv.x - center.x);
      } else if (mode < 1.5) {
        uv.y = center.y + abs(vUv.y - center.y);
      } else {
        uv.x = center.x + abs(vUv.x - center.x);
        uv.y = center.y + abs(vUv.y - center.y);
      }
      uv = clamp(uv, 0.0, 1.0);
      gl_FragColor = texture2D(tDiffuse, uv);
    }
  `,
};

export const CRTCShader = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2(1920, 1080) },
    scanlineIntensity: { value: 0.35 },
    curvature: { value: 0.22 },
    vignette: { value: 0.45 },
    time: { value: 0.0 },
  },
  vertexShader: ChromaticAberrationShader.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float scanlineIntensity;
    uniform float curvature;
    uniform float vignette;
    uniform float time;
    varying vec2 vUv;

    vec2 crtWarp(vec2 uv, float amount) {
      vec2 p = uv * 2.0 - 1.0;
      vec2 p2 = p * p;
      p.x *= 1.0 + p2.y * amount;
      p.y *= 1.0 + p2.x * amount;
      return p * 0.5 + 0.5;
    }

    void main() {
      vec2 uv = crtWarp(vUv, curvature);
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
      }

      float px = 1.0 / max(1.0, resolution.x);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + vec2(px * 1.2, 0.0)).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - vec2(px * 1.2, 0.0)).b;

      float scan = 0.5 + 0.5 * sin((uv.y * resolution.y) * 1.18 + time * 22.0);
      col *= 1.0 - scan * scanlineIntensity;

      float mask = 0.985 + 0.015 * sin((uv.x * resolution.x) * 3.14159);
      col *= mask;

      float d = distance(uv, vec2(0.5));
      col *= 1.0 - smoothstep(0.45, 0.85, d) * vignette;

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export const ProjectorFilmShader = {
  uniforms: {
    tDiffuse: { value: null },
    amount: { value: 0.45 },
    jitter: { value: 0.25 },
    flicker: { value: 0.35 },
    time: { value: 0.0 },
  },
  vertexShader: ChromaticAberrationShader.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float amount;
    uniform float jitter;
    uniform float flicker;
    uniform float time;
    varying vec2 vUv;

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 34.45);
      return fract(p.x * p.y);
    }

    float lineScratch(vec2 uv, float xCenter, float width, float drift, float strength) {
      float x = uv.x + drift * (uv.y - 0.5);
      float d = abs(x - xCenter);
      float core = 1.0 - smoothstep(width, width * 4.0, d);
      float breakup = smoothstep(0.25, 1.0, hash(vec2(floor(uv.y * 420.0), xCenter * 971.0)));
      return core * breakup * strength;
    }

    float blotch(vec2 uv, vec2 center, float radius, float feather) {
      float d = distance(uv, center);
      return 1.0 - smoothstep(radius, radius + feather, d);
    }

    void main() {
      float frame = floor(time * 24.0);
      float gate = step(0.89, hash(vec2(frame, 0.17)));
      float yJitter = (hash(vec2(frame, 0.73)) - 0.5) * jitter * gate * 0.035;
      float xJitter = (hash(vec2(frame, 0.31)) - 0.5) * jitter * gate * 0.02;
      vec2 uv = clamp(vUv + vec2(xJitter, yJitter), 0.0, 1.0);

      vec4 base = texture2D(tDiffuse, uv);

      float flick = 1.0 + (hash(vec2(frame, 0.53)) - 0.5) * flicker * 0.28;
      base.rgb *= flick;

      // Fine dust specks (both bright and dark), randomized per frame.
      float dustSeed = hash(vec2(floor(uv * 1024.0) + frame * 0.73));
      float brightDust = step(0.9974, dustSeed);
      float darkDust = step(0.9982, hash(vec2(floor(uv * 840.0) + frame * 1.13)));
      base.rgb = mix(base.rgb, vec3(1.0, 0.96, 0.86), brightDust * amount * 0.9);
      base.rgb *= 1.0 - darkDust * amount * 0.42;

      // Sparse, organic vertical/diagonal scratches (not periodic grid lines).
      float s1x = hash(vec2(frame, 2.1));
      float s2x = hash(vec2(frame * 0.37, 5.7));
      float s3x = hash(vec2(frame * 0.19, 8.3));
      float s1 = lineScratch(uv, s1x, 0.0018, (hash(vec2(frame, 12.4)) - 0.5) * 0.09, 0.8);
      float s2 = lineScratch(uv, s2x, 0.0012, (hash(vec2(frame, 15.7)) - 0.5) * 0.13, 0.55);
      float s3 = lineScratch(uv, s3x, 0.0024, (hash(vec2(frame, 18.9)) - 0.5) * 0.06, 0.45);
      float scratchMix = (s1 + s2 + s3) * amount;
      base.rgb = mix(base.rgb, vec3(0.92, 0.88, 0.76), scratchMix * 0.45);

      // Occasional emulsion blotches / dirt clumps.
      float blotchGate = step(0.78, hash(vec2(frame * 0.21, 4.9)));
      vec2 c1 = vec2(hash(vec2(frame, 22.0)), hash(vec2(frame, 24.0)));
      vec2 c2 = vec2(hash(vec2(frame * 0.43, 26.0)), hash(vec2(frame * 0.61, 28.0)));
      float b1 = blotch(uv, c1, 0.018 + hash(vec2(frame, 30.0)) * 0.04, 0.03);
      float b2 = blotch(uv, c2, 0.012 + hash(vec2(frame, 32.0)) * 0.03, 0.025);
      float blotchMix = (b1 * 0.65 + b2 * 0.45) * blotchGate * amount;
      base.rgb *= 1.0 - blotchMix * 0.35;

      // Rare frame-burn / hot edge flash.
      float burnGate = step(0.965, hash(vec2(frame * 0.12, 44.0)));
      float edge = smoothstep(0.0, 0.08, uv.x) + smoothstep(0.0, 0.08, 1.0 - uv.x);
      edge += smoothstep(0.0, 0.08, uv.y) + smoothstep(0.0, 0.08, 1.0 - uv.y);
      base.rgb += vec3(1.0, 0.62, 0.22) * edge * burnGate * amount * 0.08;

      gl_FragColor = vec4(base.rgb, base.a);
    }
  `,
};

export const GodRaysShader = {
  uniforms: {
    tDiffuse: { value: null },
    center: { value: [0.5, 0.5] as [number, number] },
    amount: { value: 0.5 },
  },
  vertexShader: ChromaticAberrationShader.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 center;
    uniform float amount;
    varying vec2 vUv;
    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      vec2 dir = vUv - center;
      vec3 acc = vec3(0.0);
      const int SAMPLES = 32;
      for (int i = 0; i < SAMPLES; i++) {
        float t = float(i) / float(SAMPLES);
        vec2 p = vUv - dir * t * 0.4;
        vec3 s = texture2D(tDiffuse, p).rgb;
        // only bright bits contribute
        float lum = max(max(s.r, s.g), s.b);
        s *= smoothstep(0.4, 1.0, lum);
        acc += s * (1.0 - t);
      }
      acc /= float(SAMPLES);
      gl_FragColor = vec4(base.rgb + acc * amount, base.a);
    }
  `,
};

export const ColorGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    exposure: { value: 1.0 },
    contrast: { value: 1.0 },
    saturation: { value: 1.0 },
    hue: { value: 0.0 },
  },
  vertexShader: ChromaticAberrationShader.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float exposure;
    uniform float contrast;
    uniform float saturation;
    uniform float hue;
    varying vec2 vUv;

    vec3 rgb2hsv(vec3 c){
      vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
      vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
      vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
      float d = q.x - min(q.w, q.y);
      float e = 1.0e-10;
      return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
    }
    vec3 hsv2rgb(vec3 c){
      vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
      vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
      return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    }

    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb * exposure;
      col = (col - 0.5) * contrast + 0.5;
      vec3 hsv = rgb2hsv(col);
      hsv.x = fract(hsv.x + hue);
      hsv.y *= saturation;
      col = hsv2rgb(hsv);
      gl_FragColor = vec4(col, c.a);
    }
  `,
};

export const RadialBlurShader = {
  uniforms: {
    tDiffuse: { value: null },
    center: { value: new THREE.Vector2(0.5, 0.5) },
    strength: { value: 0.0 },
    zoom: { value: 0.35 },
  },
  vertexShader: ChromaticAberrationShader.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 center;
    uniform float strength;
    uniform float zoom;
    varying vec2 vUv;

    void main() {
      vec2 dir = center - vUv;
      vec4 acc = vec4(0.0);
      float total = 0.0;

      const int SAMPLES = 10;
      for (int i = 0; i < SAMPLES; i++) {
        float t = float(i) / float(SAMPLES - 1);
        float w = 1.0 - t;
        vec2 uv = vUv + dir * t * zoom * strength;
        acc += texture2D(tDiffuse, uv) * w;
        total += w;
      }

      gl_FragColor = total > 0.0 ? acc / total : texture2D(tDiffuse, vUv);
    }
  `,
};

export const LensFlareShader = {
  uniforms: {
    tDiffuse: { value: null },
    amount: { value: 0.6 },
  },
  vertexShader: ChromaticAberrationShader.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float amount;
    varying vec2 vUv;

    float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      vec2 center = vec2(0.5);

      // --- Anamorphic horizontal streak ---
      // Each pixel accumulates bleed from bright horizontal neighbours,
      // creating a cinema-style streak through bright sources.
      vec3 streak = vec3(0.0);
      const int SW = 32;
      for (int i = 0; i < SW; i++) {
        float t = (float(i) / float(SW - 1)) * 2.0 - 1.0; // -1..1
        vec2 uv = vec2(clamp(vUv.x + t * 0.62, 0.0, 1.0), vUv.y);
        vec3 s = texture2D(tDiffuse, uv).rgb;
        float l = luma(s);
        // Threshold: only the upper brightness range bleeds
        float bright = max(0.0, l - 0.28) * 1.39;
        float falloff = exp(-abs(t) * 3.2);
        streak += vec3(0.18, 0.52, 1.0) * bright * falloff * 0.38;
      }

      // --- Lens ghost reflections ---
      // Bright sources produce coloured ghost blobs reflected through screen centre.
      vec2 toCenter = center - vUv;
      vec3 ghosts = vec3(0.0);

      // Ghost 1 – warm orange, 1.5× past centre
      vec2 g1 = clamp(center + toCenter * 1.5, 0.0, 1.0);
      vec3 gc1 = texture2D(tDiffuse, g1).rgb;
      float gb1 = max(0.0, luma(gc1) - 0.25) * 1.33;
      ghosts += vec3(1.0, 0.62, 0.18) * gb1 * 0.55;

      // Ghost 2 – cyan, 2.3× past centre
      vec2 g2 = clamp(center + toCenter * 2.3, 0.0, 1.0);
      vec3 gc2 = texture2D(tDiffuse, g2).rgb;
      float gb2 = max(0.0, luma(gc2) - 0.25) * 1.33;
      ghosts += vec3(0.2, 0.88, 1.0) * gb2 * 0.30;

      // Ghost 3 – purple, 0.45× (between source and centre)
      vec2 g3 = clamp(center + toCenter * 0.45, 0.0, 1.0);
      vec3 gc3 = texture2D(tDiffuse, g3).rgb;
      float gb3 = max(0.0, luma(gc3) - 0.25) * 1.33;
      ghosts += vec3(0.78, 0.28, 1.0) * gb3 * 0.38;

      gl_FragColor = vec4(base.rgb + (streak + ghosts) * amount, base.a);
    }
  `,
};

export const AssetOverlayShader = {
  uniforms: {
    tDiffuse: { value: null },
    tOverlayA: { value: null },
    tOverlayB: { value: null },
    tOverlayC: { value: null },
    tOverlayA2: { value: null },
    tOverlayB2: { value: null },
    tOverlayC2: { value: null },
    amount: { value: 0.6 },
    pulse: { value: 0.0 },
    time: { value: 0.0 },
    transition: { value: 1.0 },
  },
  vertexShader: ChromaticAberrationShader.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tOverlayA;
    uniform sampler2D tOverlayB;
    uniform sampler2D tOverlayC;
    uniform sampler2D tOverlayA2;
    uniform sampler2D tOverlayB2;
    uniform sampler2D tOverlayC2;
    uniform float amount;
    uniform float pulse;
    uniform float time;
    uniform float transition;
    varying vec2 vUv;

    vec3 screenBlend(vec3 base, vec3 blend) {
      return 1.0 - (1.0 - base) * (1.0 - blend);
    }

    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      vec2 uvA = vec2(fract(vUv.x * 1.12 + time * 0.028), fract(vUv.y * 1.06 + time * 0.012));
      vec2 uvB = vec2(fract(vUv.x * 0.84 - time * 0.02), fract(vUv.y * 1.22 + time * 0.015));
      vec2 uvC = vec2(fract(vUv.x * 1.35 + time * 0.011), fract(vUv.y * 0.78 - time * 0.024));

      vec3 layerA = texture2D(tOverlayA, uvA).rgb;
      vec3 layerB = texture2D(tOverlayB, uvB).rgb;
      vec3 layerC = texture2D(tOverlayC, uvC).rgb;
      vec3 layerA2 = texture2D(tOverlayA2, uvA).rgb;
      vec3 layerB2 = texture2D(tOverlayB2, uvB).rgb;
      vec3 layerC2 = texture2D(tOverlayC2, uvC).rgb;

      vec3 layerAOut = mix(layerA, layerA2, transition);
      vec3 layerBOut = mix(layerB, layerB2, transition);
      vec3 layerCOut = mix(layerC, layerC2, transition);

      float wobble = 0.5 + 0.5 * sin(time * 0.43 + (vUv.x + vUv.y) * 6.2831);
      vec3 overlay = mix(
        mix(layerAOut, layerBOut, 0.5 + wobble * 0.25),
        layerCOut,
        0.35 + wobble * 0.2
      );
      overlay *= 0.5 + pulse * 1.05;
      vec3 color = screenBlend(base.rgb, overlay * amount);
      gl_FragColor = vec4(color, base.a);
    }
  `,
};

export const BlueprintSobelShader = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2(1920, 1080) },
    edgeStrength: { value: 1.5 },
    threshold: { value: 0.15 },
    bgColor: { value: new THREE.Color("#07111f") },
    lineColor: { value: new THREE.Color("#7fdcff") },
    fillMix: { value: 0.08 },
  },
  vertexShader: ChromaticAberrationShader.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float edgeStrength;
    uniform float threshold;
    uniform vec3 bgColor;
    uniform vec3 lineColor;
    uniform float fillMix;
    varying vec2 vUv;

    float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

    void main() {
      vec2 texel = 1.0 / resolution;

      float tl = luma(texture2D(tDiffuse, vUv + texel * vec2(-1.0, -1.0)).rgb);
      float l = luma(texture2D(tDiffuse, vUv + texel * vec2(-1.0, 0.0)).rgb);
      float bl = luma(texture2D(tDiffuse, vUv + texel * vec2(-1.0, 1.0)).rgb);
      float tr = luma(texture2D(tDiffuse, vUv + texel * vec2(1.0, -1.0)).rgb);
      float r = luma(texture2D(tDiffuse, vUv + texel * vec2(1.0, 0.0)).rgb);
      float br = luma(texture2D(tDiffuse, vUv + texel * vec2(1.0, 1.0)).rgb);
      float top = luma(texture2D(tDiffuse, vUv + texel * vec2(0.0, -1.0)).rgb);
      float bot = luma(texture2D(tDiffuse, vUv + texel * vec2(0.0, 1.0)).rgb);

      float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br;
      float gy = -tl - 2.0 * top - tr + bl + 2.0 * bot + br;
      float edge = length(vec2(gx, gy)) * edgeStrength;
      edge = smoothstep(threshold, threshold + 0.2, edge);

      float base = luma(texture2D(tDiffuse, vUv).rgb) * fillMix;
      vec3 color = mix(bgColor + base, lineColor, edge);
      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

// Sphere displacement: vertex shader uses simplex-like noise (cheap hash noise).
export const sphereVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uBass;
  uniform float uMid;
  uniform float uDisp;
  varying vec3 vNormal;
  varying vec3 vView;

  // hash-based noise
  float hash(vec3 p){ p = fract(p*0.3183099+.1); p*=17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
  float noise(vec3 p){
    vec3 i = floor(p); vec3 f = fract(p);
    f = f*f*(3.0-2.0*f);
    return mix(mix(mix(hash(i+vec3(0,0,0)), hash(i+vec3(1,0,0)), f.x),
                   mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x),
                   mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y), f.z);
  }

  void main(){
    vNormal = normalize(normalMatrix * normal);
    float n = noise(normal * 2.0 + uTime * 0.4);
    float disp = uDisp * (uBass * 0.9 + uMid * 0.4) * (0.5 + n);
    vec3 pos = position + normal * disp;
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

export const sphereFragmentShader = /* glsl */ `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorC;
  uniform float uTime;
  uniform float uBass;
  varying vec3 vNormal;
  varying vec3 vView;

  void main(){
    float fres = pow(1.0 - max(dot(vNormal, vView), 0.0), 2.5);
    float t = 0.5 + 0.5 * sin(uTime * 0.6 + vNormal.y * 3.0);
    vec3 base = mix(uColorA, uColorB, t);
    base = mix(base, uColorC, fres);
    base += uColorA * uBass * 0.6;
    gl_FragColor = vec4(base * (0.5 + fres), 1.0);
  }
`;
