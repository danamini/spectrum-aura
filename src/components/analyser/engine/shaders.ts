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
