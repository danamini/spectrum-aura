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

export const AsciiShader = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2(1920, 1080) },
    cellSize: { value: 10.0 },
    colored: { value: 1.0 }, // 0 = mono phosphor tint, 1 = source colour
    gain: { value: 1.0 },
  },
  vertexShader: ChromaticAberrationShader.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float cellSize;
    uniform float colored;
    uniform float gain;
    varying vec2 vUv;

    // Each glyph is a 5x5 bitmap (bit = x + 5*y, y up) split across two floats
    // (low 13 bits / high 12 bits) so lookups stay exact in ES 1.0 floats
    // without bit ops. Constants generated from pixel art; the brightness ramp
    // " . : - + = % # * @" is ordered by lit-pixel count (0..20).
    float bitAt(float bits, float index) {
      return mod(floor(bits / exp2(index)), 2.0);
    }

    float glyphPixel(vec2 glyph, vec2 p) {
      if (p.x < 0.0 || p.x >= 1.0 || p.y < 0.0 || p.y >= 1.0) return 0.0;
      vec2 g = floor(p * 5.0);
      float index = g.x + 5.0 * g.y;
      if (index < 13.0) return bitAt(glyph.x, index);
      return bitAt(glyph.y, index - 13.0);
    }

    void main() {
      vec2 grid = resolution / max(4.0, cellSize);
      vec2 cell = floor(vUv * grid);
      vec2 cellUv = (cell + 0.5) / grid;
      vec3 src = texture2D(tDiffuse, cellUv).rgb;
      float lum = clamp(dot(src, vec3(0.2126, 0.7152, 0.0722)) * gain, 0.0, 1.0);

      float level = floor(min(lum, 0.999) * 10.0);
      vec2 glyph = vec2(0.0, 0.0);
      if (level > 0.5) glyph = vec2(128.0, 0.0);     // .
      if (level > 1.5) glyph = vec2(128.0, 16.0);    // :
      if (level > 2.5) glyph = vec2(6144.0, 1.0);    // -
      if (level > 3.5) glyph = vec2(7300.0, 531.0);  // +
      if (level > 4.5) glyph = vec2(992.0, 124.0);   // =
      if (level > 5.5) glyph = vec2(4953.0, 2476.0); // %
      if (level > 6.5) glyph = vec2(3050.0, 1405.0); // #
      if (level > 7.5) glyph = vec2(7637.0, 2747.0); // *
      if (level > 8.5) glyph = vec2(4078.0, 1919.0); // @

      // Inset the glyph so neighbouring characters never touch.
      vec2 p = (fract(vUv * grid) - 0.08) / 0.84;
      float on = glyphPixel(glyph, p);

      vec3 monoInk = vec3(0.58, 1.0, 0.76) * (0.35 + 0.65 * lum);
      vec3 colorInk = clamp(src * 1.7, 0.0, 1.0);
      vec3 ink = mix(monoInk, colorInk, colored);
      gl_FragColor = vec4(ink * on, 1.0);
    }
  `,
};

export const RetroSystemShader = {
  uniforms: {
    tDiffuse: { value: null },
    tFont: { value: null as THREE.Texture | null },
    resolution: { value: new THREE.Vector2(1920, 1080) },
    mode: { value: 0.0 }, // 0 zx, 1 c64, 2 gameboy, 3 nes, 4 cga, 5 cpc
    displayMode: { value: 0.0 }, // 0 = pixels, 1 = text (glyph cells), 2 = UDG quarter blocks
    dither: { value: 0.55 },
    border: { value: 1.0 },
    gain: { value: 1.0 },
  },
  vertexShader: ChromaticAberrationShader.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tFont;
    uniform vec2 resolution;
    uniform float mode;
    uniform float displayMode;
    uniform float dither;
    uniform float border;
    uniform float gain;
    varying vec2 vUv;

    // Emulates classic micro/console video output: native resolution, fixed
    // palette, and — for ZX Spectrum and C64 — genuine attribute limits, so
    // colourful detail inside one character cell collapses to the cell's two
    // (ZX) or four (C64 multicolor) colours: real attribute clash.

    float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
    float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
    float lumOf(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

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

    // Native pixel grid (C64/CPC use fat multicolor pixels; that's authentic).
    // 0 zx · 1 c64 · 2 gameboy · 3 nes · 4 cga · 5 cpc · 6 amiga · 7 dos ·
    // 8 vga · 9 hercules · 10 apple2
    vec2 virtualRes() {
      if (mode < 0.5) return vec2(256.0, 192.0);
      if (mode < 1.5) return vec2(160.0, 200.0);
      if (mode < 2.5) return vec2(160.0, 144.0);
      if (mode < 3.5) return vec2(256.0, 240.0);
      if (mode < 4.5) return vec2(320.0, 200.0);
      if (mode < 5.5) return vec2(160.0, 200.0);
      if (mode < 6.5) return vec2(320.0, 256.0);
      if (mode < 8.5) return vec2(320.0, 200.0);
      if (mode < 9.5) return vec2(720.0, 348.0);
      return vec2(280.0, 192.0);
    }
    // Character/attribute cell grid — 8x8 native pixels per cell everywhere,
    // which for C64 multicolor means 4x8 fat pixels per cell.
    vec2 charGrid() {
      if (mode < 0.5) return vec2(32.0, 24.0);
      if (mode < 1.5) return vec2(40.0, 25.0);
      if (mode < 2.5) return vec2(20.0, 18.0);
      if (mode < 3.5) return vec2(32.0, 30.0);
      if (mode < 4.5) return vec2(40.0, 25.0);
      if (mode < 5.5) return vec2(20.0, 25.0);
      if (mode < 6.5) return vec2(40.0, 32.0);
      if (mode < 8.5) return vec2(40.0, 25.0);
      if (mode < 9.5) return vec2(80.0, 25.0);
      return vec2(40.0, 24.0);
    }

    // ZX palette is procedural: GRB bits + one BRIGHT bank (0..7 normal at
    // 0.84, 8..14 bright — bright black duplicates black so it is skipped).
    vec3 zxColor(float i) {
      float bright = step(7.5, i);
      float j = i - bright * 7.0;
      float b = mod(j, 2.0);
      float r = mod(floor(j / 2.0), 2.0);
      float g = mod(floor(j / 4.0), 2.0);
      return vec3(r, g, b) * mix(0.84, 1.0, bright);
    }
    float zxNearest(vec3 c) {
      float best = 0.0; float bestD = 1e9;
      for (int i = 0; i < 15; i++) {
        vec3 p = zxColor(float(i));
        float d = dot(c - p, c - p);
        if (d < bestD) { bestD = d; best = float(i); }
      }
      return best;
    }

    // C64 palette (Pepto measurements).
    vec3 c64Color(float i) {
      if (i < 0.5) return vec3(0.0);
      if (i < 1.5) return vec3(1.0);
      if (i < 2.5) return vec3(0.408, 0.216, 0.169);
      if (i < 3.5) return vec3(0.439, 0.643, 0.698);
      if (i < 4.5) return vec3(0.435, 0.239, 0.525);
      if (i < 5.5) return vec3(0.345, 0.553, 0.263);
      if (i < 6.5) return vec3(0.208, 0.157, 0.475);
      if (i < 7.5) return vec3(0.722, 0.780, 0.435);
      if (i < 8.5) return vec3(0.435, 0.310, 0.145);
      if (i < 9.5) return vec3(0.263, 0.224, 0.0);
      if (i < 10.5) return vec3(0.604, 0.404, 0.349);
      if (i < 11.5) return vec3(0.267, 0.267, 0.267);
      if (i < 12.5) return vec3(0.424, 0.424, 0.424);
      if (i < 13.5) return vec3(0.604, 0.824, 0.518);
      if (i < 14.5) return vec3(0.424, 0.369, 0.710);
      return vec3(0.584, 0.584, 0.584);
    }
    float c64Nearest(vec3 c) {
      float best = 0.0; float bestD = 1e9;
      for (int i = 0; i < 16; i++) {
        vec3 p = c64Color(float(i));
        float d = dot(c - p, c - p);
        if (d < bestD) { bestD = d; best = float(i); }
      }
      return best;
    }

    // DMG Game Boy: four shades of LCD green.
    vec3 gbColor(float i) {
      if (i < 0.5) return vec3(0.059, 0.220, 0.059);
      if (i < 1.5) return vec3(0.188, 0.384, 0.188);
      if (i < 2.5) return vec3(0.545, 0.675, 0.059);
      return vec3(0.608, 0.737, 0.059);
    }

    // Standard EGA 16-colour palette (the definitive MS-DOS game look) —
    // 0xAA-level primaries, the brown exception, and bright variants.
    vec3 egaColor(float i) {
      if (i < 0.5) return vec3(0.0);
      if (i < 1.5) return vec3(0.0, 0.0, 0.667);
      if (i < 2.5) return vec3(0.0, 0.667, 0.0);
      if (i < 3.5) return vec3(0.0, 0.667, 0.667);
      if (i < 4.5) return vec3(0.667, 0.0, 0.0);
      if (i < 5.5) return vec3(0.667, 0.0, 0.667);
      if (i < 6.5) return vec3(0.667, 0.333, 0.0); // brown
      if (i < 7.5) return vec3(0.667, 0.667, 0.667);
      if (i < 8.5) return vec3(0.333, 0.333, 0.333);
      if (i < 9.5) return vec3(0.333, 0.333, 1.0);
      if (i < 10.5) return vec3(0.333, 1.0, 0.333);
      if (i < 11.5) return vec3(0.333, 1.0, 1.0);
      if (i < 12.5) return vec3(1.0, 0.333, 0.333);
      if (i < 13.5) return vec3(1.0, 0.333, 1.0);
      if (i < 14.5) return vec3(1.0, 1.0, 0.333);
      return vec3(1.0);
    }
    float egaNearest(vec3 c) {
      float best = 0.0; float bestD = 1e9;
      for (int i = 0; i < 16; i++) {
        vec3 p = egaColor(float(i));
        float d = dot(c - p, c - p);
        if (d < bestD) { bestD = d; best = float(i); }
      }
      return best;
    }

    // Fixed 32-entry Deluxe-Paint-style palette for the Amiga: grey ramp,
    // warm browns/skin, and short ramps per hue — the OCS hardware allowed
    // any 32 of 4096, and this spread is what period art tended to use.
    vec3 amigaColor(float i) {
      if (i < 0.5) return vec3(0.0);
      if (i < 1.5) return vec3(0.333);
      if (i < 2.5) return vec3(0.667);
      if (i < 3.5) return vec3(1.0);
      if (i < 4.5) return vec3(0.392, 0.196, 0.078);
      if (i < 5.5) return vec3(0.588, 0.314, 0.157);
      if (i < 6.5) return vec3(0.784, 0.471, 0.235);
      if (i < 7.5) return vec3(0.941, 0.667, 0.431);
      if (i < 8.5) return vec3(0.471, 0.078, 0.078);
      if (i < 9.5) return vec3(0.784, 0.157, 0.157);
      if (i < 10.5) return vec3(1.0, 0.314, 0.314);
      if (i < 11.5) return vec3(1.0, 0.588, 0.118);
      if (i < 12.5) return vec3(1.0, 0.863, 0.235);
      if (i < 13.5) return vec3(0.078, 0.314, 0.118);
      if (i < 14.5) return vec3(0.157, 0.549, 0.196);
      if (i < 15.5) return vec3(0.353, 0.784, 0.314);
      if (i < 16.5) return vec3(0.706, 0.941, 0.471);
      if (i < 17.5) return vec3(0.078, 0.118, 0.353);
      if (i < 18.5) return vec3(0.157, 0.275, 0.627);
      if (i < 19.5) return vec3(0.275, 0.471, 0.863);
      if (i < 20.5) return vec3(0.510, 0.706, 1.0);
      if (i < 21.5) return vec3(0.157, 0.627, 0.627);
      if (i < 22.5) return vec3(0.471, 0.863, 0.863);
      if (i < 23.5) return vec3(0.353, 0.157, 0.510);
      if (i < 24.5) return vec3(0.627, 0.275, 0.784);
      if (i < 25.5) return vec3(0.902, 0.471, 0.902);
      if (i < 26.5) return vec3(0.078, 0.275, 0.314);
      if (i < 27.5) return vec3(1.0, 0.667, 0.745);
      if (i < 28.5) return vec3(0.471, 0.471, 0.157);
      if (i < 29.5) return vec3(0.588, 0.078, 0.353);
      if (i < 30.5) return vec3(0.667, 0.863, 1.0);
      return vec3(0.863, 0.784, 0.588);
    }
    float amigaNearest(vec3 c) {
      float best = 0.0; float bestD = 1e9;
      for (int i = 0; i < 32; i++) {
        vec3 p = amigaColor(float(i));
        float d = dot(c - p, c - p);
        if (d < bestD) { bestD = d; best = float(i); }
      }
      return best;
    }

    // CGA palette 1, high intensity: black / cyan / magenta / white.
    vec3 cgaColor(float i) {
      if (i < 0.5) return vec3(0.0);
      if (i < 1.5) return vec3(0.333, 1.0, 1.0);
      if (i < 2.5) return vec3(1.0, 0.333, 1.0);
      return vec3(1.0);
    }
    float cgaNearest(vec3 c) {
      float best = 0.0; float bestD = 1e9;
      for (int i = 0; i < 4; i++) {
        vec3 p = cgaColor(float(i));
        float d = dot(c - p, c - p);
        if (d < bestD) { bestD = d; best = float(i); }
      }
      return best;
    }

    // NES approximation: 12 hue steps x 4 value tiers (grays below the
    // saturation floor) — matches the PPU palette's structure without a
    // 54-entry table lookup.
    vec3 nesQuantize(vec3 c) {
      vec3 hsv = rgb2hsv(c);
      if (hsv.y < 0.18) {
        float v = floor(clamp(hsv.z, 0.0, 0.999) * 4.0);
        if (v < 0.5) return vec3(0.0);
        if (v < 1.5) return vec3(0.31);
        if (v < 2.5) return vec3(0.63);
        return vec3(1.0);
      }
      float hue = (floor(hsv.x * 12.0) + 0.5) / 12.0;
      float tier = floor(clamp(hsv.z, 0.0, 0.999) * 4.0);
      if (tier < 0.5) return hsv2rgb(vec3(hue, 1.0, 0.34));
      if (tier < 1.5) return hsv2rgb(vec3(hue, 1.0, 0.66));
      if (tier < 2.5) return hsv2rgb(vec3(hue, 0.85, 0.94));
      return hsv2rgb(vec3(hue, 0.45, 1.0));
    }

    // Default VGA mode 13h palette structure: 16-step grey ramp for
    // desaturated colours, otherwise 24 hue steps at 3 saturation and 3
    // value tiers — far smoother than EGA but still visibly banded.
    vec3 vgaQuantize(vec3 c) {
      vec3 hsv = rgb2hsv(c);
      if (hsv.y < 0.15) {
        return vec3(floor(min(hsv.z, 0.999) * 16.0) / 15.0);
      }
      float hue = (floor(hsv.x * 24.0) + 0.5) / 24.0;
      float sat = hsv.y > 0.75 ? 1.0 : (hsv.y > 0.4 ? 0.66 : 0.35);
      float val = (floor(min(hsv.z, 0.999) * 3.0) + 1.0) / 3.0;
      return hsv2rgb(vec3(hue, sat, val));
    }

    // Apple II hi-res: black, white, and the four NTSC artifact colours.
    vec3 apple2Color(float i) {
      if (i < 0.5) return vec3(0.0);
      if (i < 1.5) return vec3(1.0);
      if (i < 2.5) return vec3(0.220, 0.796, 0.0);   // green
      if (i < 3.5) return vec3(0.780, 0.204, 1.0);   // purple
      if (i < 4.5) return vec3(0.949, 0.361, 0.098); // orange
      return vec3(0.173, 0.612, 0.949);              // medium blue
    }
    float apple2Nearest(vec3 c) {
      float best = 0.0; float bestD = 1e9;
      for (int i = 0; i < 6; i++) {
        vec3 p = apple2Color(float(i));
        float d = dot(c - p, c - p);
        if (d < bestD) { bestD = d; best = float(i); }
      }
      return best;
    }

    vec3 quantizeColor(vec3 c) {
      c = clamp(c, 0.0, 1.0);
      if (mode < 0.5) return zxColor(zxNearest(c));
      if (mode < 1.5) return c64Color(c64Nearest(c));
      if (mode < 2.5) return gbColor(floor(clamp(lumOf(c), 0.0, 0.999) * 4.0));
      if (mode < 3.5) return nesQuantize(c);
      if (mode < 4.5) return cgaColor(cgaNearest(c));
      // Amstrad CPC: 27-colour master palette = 3 levels per channel.
      if (mode < 5.5) return floor(min(c, vec3(0.999)) * 3.0) / 2.0;
      if (mode < 6.5) return amigaColor(amigaNearest(c));
      if (mode < 7.5) return egaColor(egaNearest(c));
      if (mode < 8.5) return vgaQuantize(c);
      // Hercules: 1-bit monochrome on a green phosphor; the Bayer offset the
      // caller mixed in makes this an ordered-dithered halftone.
      if (mode < 9.5) return step(0.5, lumOf(c)) * vec3(0.55, 1.0, 0.6);
      return apple2Color(apple2Nearest(c));
    }

    vec3 cellSample(vec2 base, vec2 off) {
      return clamp(texture2D(tDiffuse, base + off).rgb * gain, 0.0, 1.0);
    }

    // ZX attributes: one ink + one paper per 8x8 cell, sharing a single
    // BRIGHT bit — the paper is folded into the ink's brightness bank just
    // like the real attribute byte forces.
    void zxInkPaper(vec2 cell, vec2 grid, out vec3 ink, out vec3 paper) {
      vec2 base = (cell + 0.5) / grid;
      vec2 off = 0.25 / grid;
      float i0 = zxNearest(cellSample(base, -off));
      float i1 = zxNearest(cellSample(base, vec2(off.x, -off.y)));
      float i2 = zxNearest(cellSample(base, vec2(-off.x, off.y)));
      float i3 = zxNearest(cellSample(base, off));
      float inkIdx = i0; float paperIdx = i0;
      float inkLum = lumOf(zxColor(i0)); float paperLum = inkLum;
      float l1 = lumOf(zxColor(i1));
      if (l1 > inkLum) { inkLum = l1; inkIdx = i1; }
      if (l1 < paperLum) { paperLum = l1; paperIdx = i1; }
      float l2 = lumOf(zxColor(i2));
      if (l2 > inkLum) { inkLum = l2; inkIdx = i2; }
      if (l2 < paperLum) { paperLum = l2; paperIdx = i2; }
      float l3 = lumOf(zxColor(i3));
      if (l3 > inkLum) { inkLum = l3; inkIdx = i3; }
      if (l3 < paperLum) { paperLum = l3; paperIdx = i3; }
      float bright = step(7.5, inkIdx);
      if (paperIdx > 0.5) {
        float j = paperIdx - step(7.5, paperIdx) * 7.0;
        paperIdx = j + bright * 7.0;
      }
      // Dark scenes read as ink-on-black on real hardware: snap a dim paper
      // colour to true black instead of leaving a murky tint.
      if (paperLum < 0.16) paperIdx = 0.0;
      ink = zxColor(inkIdx);
      paper = zxColor(paperIdx);
    }

    // Ink-vs-paper choice for one pixel. Dither only kicks in near the
    // decision boundary — solid regions must stay solid (that crispness IS
    // the attribute-clash look); full-field dithering reads as noise.
    float inkChoice(vec3 srcColor, vec3 ink, vec3 paper, float bay) {
      float dInk = distance(srcColor, ink);
      float dPaper = distance(srcColor, paper);
      float tInk = dPaper / (dInk + dPaper + 1e-4);
      float conf = abs(tInk - 0.5) * 2.0;
      float jitter = (bay - 0.5) * dither * 0.6 * (1.0 - smoothstep(0.12, 0.45, conf));
      return step(0.5 + jitter, tInk);
    }

    // Generic ink/paper for text mode on non-ZX systems: brightest and
    // darkest quantized colour seen inside the cell.
    void genericInkPaper(vec2 cell, vec2 grid, out vec3 ink, out vec3 paper) {
      vec2 base = (cell + 0.5) / grid;
      vec2 off = 0.25 / grid;
      vec3 q0 = quantizeColor(cellSample(base, -off));
      vec3 q1 = quantizeColor(cellSample(base, vec2(off.x, -off.y)));
      vec3 q2 = quantizeColor(cellSample(base, vec2(-off.x, off.y)));
      vec3 q3 = quantizeColor(cellSample(base, off));
      ink = q0; paper = q0;
      if (lumOf(q1) > lumOf(ink)) ink = q1;
      if (lumOf(q1) < lumOf(paper)) paper = q1;
      if (lumOf(q2) > lumOf(ink)) ink = q2;
      if (lumOf(q2) < lumOf(paper)) paper = q2;
      if (lumOf(q3) > lumOf(ink)) ink = q3;
      if (lumOf(q3) < lumOf(paper)) paper = q3;
    }

    // C64 multicolor: each 4x8-fat-pixel cell draws from four colours; the
    // cell's corner samples nominate the candidates.
    vec3 c64CellColor(vec2 cell, vec2 grid, vec3 target) {
      vec2 base = (cell + 0.5) / grid;
      vec2 off = 0.25 / grid;
      vec3 q0 = c64Color(c64Nearest(cellSample(base, -off)));
      vec3 q1 = c64Color(c64Nearest(cellSample(base, vec2(off.x, -off.y))));
      vec3 q2 = c64Color(c64Nearest(cellSample(base, vec2(-off.x, off.y))));
      vec3 q3 = c64Color(c64Nearest(cellSample(base, off)));
      vec3 best = q0; float bestD = dot(target - q0, target - q0);
      float d = dot(target - q1, target - q1);
      if (d < bestD) { bestD = d; best = q1; }
      d = dot(target - q2, target - q2);
      if (d < bestD) { bestD = d; best = q2; }
      d = dot(target - q3, target - q3);
      if (d < bestD) { best = q3; }
      return best;
    }

    vec3 pixelMode(vec2 uv) {
      vec2 virt = virtualRes();
      vec2 pix = floor(uv * virt);
      vec2 pixUv = (pix + 0.5) / virt;
      vec3 src = clamp(texture2D(tDiffuse, pixUv).rgb * gain, 0.0, 1.0);
      float bay = bayer4(pix);
      vec3 dsrc = src + (bay - 0.5) * dither * 0.28;
      vec2 grid = charGrid();
      vec2 cell = floor(uv * grid);
      if (mode < 0.5) {
        vec3 ink; vec3 paper;
        zxInkPaper(cell, grid, ink, paper);
        // Judge against the clean source: pre-dithered input would flip
        // borderline pixels everywhere and dissolve shapes into checker.
        return mix(paper, ink, inkChoice(src, ink, paper, bay));
      }
      if (mode < 1.5) return c64CellColor(cell, grid, clamp(dsrc, 0.0, 1.0));
      return quantizeColor(dsrc);
    }

    vec3 textMode(vec2 uv) {
      vec2 grid = charGrid();
      vec2 cell = floor(uv * grid);
      vec2 cellUv = (cell + 0.5) / grid;
      vec3 src = clamp(texture2D(tDiffuse, cellUv).rgb * gain, 0.0, 1.0);
      vec3 ink; vec3 paper;
      if (mode < 0.5) zxInkPaper(cell, grid, ink, paper);
      else genericInkPaper(cell, grid, ink, paper);
      float bay = bayer4(cell);
      float level = floor(clamp(lumOf(src) + (bay - 0.5) * dither * 0.12, 0.0, 0.999) * 10.0);
      // Atlas rows are stored bottom-up to match uv orientation (flipY off).
      vec2 p = floor(fract(uv * grid) * 8.0);
      float fontRow = mode < 0.5 ? 0.0 : (mode < 1.5 ? 1.0 : 2.0);
      vec2 atlasUv = vec2(
        (level * 8.0 + p.x + 0.5) / 80.0,
        (fontRow * 8.0 + p.y + 0.5) / 24.0
      );
      float on = texture2D(tFont, atlasUv).r;
      return mix(paper, ink, on);
    }

    // UDG/quarter-block graphics: each character cell is a 2x2 grid of fat
    // quadrants (ZX block graphics chars 0x80-0x8F, PETSCII quarter blocks),
    // still bound by the cell's ink/paper attribute — the classic
    // user-defined-graphics look.
    vec3 blocksMode(vec2 uv) {
      vec2 grid = charGrid();
      vec2 cell = floor(uv * grid);
      vec3 ink; vec3 paper;
      if (mode < 0.5) zxInkPaper(cell, grid, ink, paper);
      else genericInkPaper(cell, grid, ink, paper);
      vec2 quad = floor(fract(uv * grid) * 2.0);
      vec2 quadUv = (cell + (quad + 0.5) / 2.0) / grid;
      vec3 qsrc = clamp(texture2D(tDiffuse, quadUv).rgb * gain, 0.0, 1.0);
      float bay = bayer4(cell * 2.0 + quad);
      return mix(paper, ink, inkChoice(qsrc, ink, paper, bay));
    }

    vec3 borderColor() {
      if (mode < 0.5) return vec3(0.84);
      if (mode < 1.5) return vec3(0.424, 0.369, 0.710);
      if (mode < 2.5) return vec3(0.608, 0.737, 0.059);
      if (mode < 4.5) return vec3(0.0);
      if (mode < 5.5) return vec3(0.0, 0.0, 0.5);
      if (mode < 6.5) return vec3(0.0, 0.333, 0.667); // Workbench blue
      return vec3(0.0);
    }

    void main() {
      vec2 uv = vUv;
      if (border > 0.5) {
        // Letterbox to the machine's display aspect inside a hardware border.
        float targetAspect = (mode >= 1.5 && mode < 2.5) ? 10.0 / 9.0 : 4.0 / 3.0;
        float screenAspect = resolution.x / max(1.0, resolution.y);
        vec2 size = vec2(0.86);
        if (screenAspect > targetAspect) size.x *= targetAspect / screenAspect;
        else size.y *= screenAspect / targetAspect;
        uv = (vUv - 0.5) / size + 0.5;
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
          gl_FragColor = vec4(borderColor(), 1.0);
          return;
        }
      }
      vec3 col;
      if (displayMode < 0.5) col = pixelMode(uv);
      else if (displayMode < 1.5) col = textMode(uv);
      else col = blocksMode(uv);
      gl_FragColor = vec4(col, 1.0);
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
