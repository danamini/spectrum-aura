import * as THREE from "three";
import { normalizedBand } from "../loudness";
import {
  MAX_COUNTRIES,
  fetchCountryOutlines,
  lonLatToXyz,
  stepBounce,
  type CountryOutlines,
} from "./globe-data";
import { displayLevel, logBin, type LazyView, type ViewFrame } from "./types";

const R = 3.2;
const RING_BARS = 160;
const NEUTRAL = [
  new THREE.Color("#35f2c4"),
  new THREE.Color("#2a6bff"),
  new THREE.Color("#ffb347"),
];

function graticule(): Float32Array {
  const out: number[] = [];
  const p = { x: 0, y: 0, z: 0 };
  const q = { x: 0, y: 0, z: 0 };
  const seg = (lon0: number, lat0: number, lon1: number, lat1: number) => {
    lonLatToXyz(lon0, lat0, R * 0.999, p);
    lonLatToXyz(lon1, lat1, R * 0.999, q);
    out.push(p.x, p.y, p.z, q.x, q.y, q.z);
  };
  for (let lat = -60; lat <= 60; lat += 30) {
    for (let lon = -180; lon < 180; lon += 6) seg(lon, lat, lon + 6, lat);
  }
  for (let lon = -180; lon < 180; lon += 30) {
    for (let lat = -84; lat < 84; lat += 6) seg(lon, lat, lon, lat + 6);
  }
  return new Float32Array(out);
}

/**
 * A neon vector Earth whose countries bounce: every country rides its own
 * slice of the spectrum on a spring, lifting off the globe and settling back,
 * with the whole map kicked outward on the beat.
 *
 * Outlines come from Natural Earth via a public CDN. With the map off (or
 * offline) the globe falls back to its graticule and spectrum ring.
 */
export class GlobeView implements LazyView {
  readonly group = new THREE.Group();
  private readonly earth = new THREE.Group();
  private readonly abort = new AbortController();
  private readonly grid: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private countries?: THREE.LineSegments<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private countryCount = 0;
  private readonly core: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private readonly halo: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private readonly ring: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private readonly ringPositions: Float32Array;
  private readonly stars: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private readonly levels = new Float32Array(MAX_COUNTRIES);
  private readonly velocity = new Float32Array(MAX_COUNTRIES);
  private readonly targets = new Float32Array(MAX_COUNTRIES);
  private readonly levelTexture: THREE.DataTexture;
  private mapRequested = false;
  private lastPhase = 0;
  private orbit = 0;
  private disposed = false;

  constructor() {
    const lineMaterial = (opacity: number) =>
      new THREE.LineBasicMaterial({
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      });

    const gridGeo = new THREE.BufferGeometry();
    gridGeo.setAttribute("position", new THREE.BufferAttribute(graticule(), 3));
    this.grid = new THREE.LineSegments(gridGeo, lineMaterial(0.16));

    // Opaque core hides the far side so the globe reads as a solid body.
    this.core = new THREE.Mesh(
      new THREE.SphereGeometry(R * 0.985, 48, 32),
      new THREE.MeshBasicMaterial({ color: 0x02040a, fog: false }),
    );

    this.halo = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.18, 48, 32),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        uniforms: { uColor: { value: new THREE.Color() }, uPower: { value: 1 } },
        vertexShader: /* glsl */ `
          varying vec3 vNormalV;
          varying vec3 vViewDir;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vNormalV = normalize(normalMatrix * normal);
            vViewDir = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor;
          uniform float uPower;
          varying vec3 vNormalV;
          varying vec3 vViewDir;
          void main() {
            // Back faces: brightest where the shell grazes the globe's limb.
            float rim = pow(clamp(dot(-vNormalV, vViewDir), 0.0, 1.0), 3.2);
            gl_FragColor = vec4(uColor * rim * uPower, rim);
          }
        `,
      }),
    );

    // One float per country, read in the vertex shader to lift its outline.
    this.levelTexture = new THREE.DataTexture(
      this.levels,
      MAX_COUNTRIES,
      1,
      THREE.RedFormat,
      THREE.FloatType,
    );
    this.levelTexture.magFilter = THREE.NearestFilter;
    this.levelTexture.minFilter = THREE.NearestFilter;
    this.levelTexture.needsUpdate = true;

    this.ringPositions = new Float32Array(RING_BARS * 6);
    const ringGeo = new THREE.BufferGeometry();
    ringGeo.setAttribute("position", new THREE.BufferAttribute(this.ringPositions, 3));
    this.ring = new THREE.LineSegments(ringGeo, lineMaterial(0.85));
    this.ring.frustumCulled = false;
    this.ring.rotation.x = 0.42;

    const starCount = 1400;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      // Uniform on a shell, deterministic so the sky does not reshuffle per build.
      const u = ((i * 0.618034) % 1) * 2 - 1;
      const a = i * 2.399963;
      const s = Math.sqrt(1 - u * u);
      const radius = 40 + ((i * 7.13) % 30);
      starPositions[i * 3] = Math.cos(a) * s * radius;
      starPositions[i * 3 + 1] = u * radius;
      starPositions[i * 3 + 2] = Math.sin(a) * s * radius;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    this.stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({
        size: 1.6,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        fog: false,
      }),
    );

    this.earth.add(this.core, this.grid);
    this.earth.rotation.z = 0.41; // axial tilt
    this.group.add(this.stars, this.earth, this.halo, this.ring);
  }

  private buildCountries(outlines: CountryOutlines) {
    const pointCount = outlines.segments.length / 2;
    if (pointCount === 0) return;
    const positions = new Float32Array(pointCount * 3);
    const p = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < pointCount; i++) {
      lonLatToXyz(outlines.segments[i * 2]!, outlines.segments[i * 2 + 1]!, R, p);
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aOwner", new THREE.BufferAttribute(outlines.owners, 1));
    this.countryCount = Math.min(MAX_COUNTRIES, outlines.countryCount);
    this.countries = new THREE.LineSegments(
      geo,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          tLevels: { value: this.levelTexture },
          uLift: { value: 0.3 },
          uColorA: { value: new THREE.Color() },
          uColorB: { value: new THREE.Color() },
        },
        vertexShader: /* glsl */ `
          uniform sampler2D tLevels;
          uniform float uLift;
          attribute float aOwner;
          varying float vLevel;
          void main() {
            float level = texture2D(tLevels, vec2((aOwner + 0.5) / ${MAX_COUNTRIES.toFixed(1)}, 0.5)).r;
            vLevel = level;
            // Radial lift: each country leaves the surface along its own normal.
            vec3 lifted = position * (1.0 + max(level, -0.15) * uLift);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(lifted, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uColorA;
          uniform vec3 uColorB;
          varying float vLevel;
          void main() {
            float l = clamp(vLevel, 0.0, 1.4);
            vec3 col = mix(uColorA, uColorB, smoothstep(0.15, 0.9, l));
            gl_FragColor = vec4(col * (0.55 + l * 1.9), 1.0);
          }
        `,
      }),
    );
    // Lifted vertices leave the geometry's bounding sphere.
    this.countries.frustumCulled = false;
    this.earth.add(this.countries);
  }

  private requestMap() {
    if (this.mapRequested) return;
    this.mapRequested = true;
    fetchCountryOutlines(this.abort.signal)
      .then((outlines) => {
        if (!this.disposed) this.buildCountries(outlines);
      })
      .catch(() => {
        // Offline or blocked: the graticule globe still works.
      });
  }

  update(f: ViewFrame): void {
    const { dt, time, audio, opts, camera } = f;
    const amp = Math.max(0.05, opts.globeAmplitude);
    const palette = opts.globeUsePalette ? f.palette : NEUTRAL;
    const bass = normalizedBand(audio.bass);
    const bins = audio.bins;
    const live = opts.globeLiveData;
    if (live) this.requestMap();

    this.earth.rotation.y += dt * opts.globeSpinSpeed * (0.12 + audio.mid * 0.25);
    this.grid.material.color.copy(palette[1]);
    this.grid.material.opacity = 0.14 + audio.high * 0.2;
    this.halo.material.uniforms.uColor!.value.copy(palette[1]).lerp(palette[0], bass);
    this.halo.material.uniforms.uPower!.value = (1.3 + bass * 2 + f.kick * 0.8) * amp;
    // A faint body colour so the unlit side still reads as a sphere.
    this.core.material.color.copy(palette[1]).multiplyScalar(0.07);
    this.stars.material.opacity = 0.45 + audio.high * 0.5;

    const beatEdge = f.bpmConfident
      ? f.beatPhase < this.lastPhase && this.lastPhase > 0.5
      : audio.beat;
    this.lastPhase = f.beatPhase;

    if (this.countries) {
      this.countries.visible = live;
      const n = this.countryCount;
      for (let i = 0; i < n; i++) {
        // Stride through the spectrum so neighbouring countries land on
        // different bands and move against each other.
        const slot = (i * 37) % n;
        this.targets[i] = bins.length > 0 ? displayLevel(bins[logBin(slot, n, bins.length)]!) : 0;
        // Every country jumps on the beat, in proportion to the bass.
        if (beatEdge) this.velocity[i]! += 2.2 + bass * 4.5;
      }
      stepBounce(this.levels, this.velocity, this.targets, n, dt);
      this.levelTexture.needsUpdate = true;
      const u = this.countries.material.uniforms;
      u.uLift!.value = 0.3 * amp;
      u.uColorA!.value.copy(palette[0]);
      u.uColorB!.value.copy(palette[2]);
    }

    // Equatorial spectrum ring.
    const ringColor = this.ring.material.color.copy(palette[2]).lerp(palette[0], audio.centroid);
    ringColor.multiplyScalar(1.1 + bass * 0.7);
    const pos = this.ringPositions;
    const inner = R * 1.55;
    for (let i = 0; i < RING_BARS; i++) {
      // Mirror the spectrum so the ring has no seam.
      const half = i < RING_BARS / 2 ? i : RING_BARS - 1 - i;
      const v = bins.length > 0 ? displayLevel(bins[logBin(half, RING_BARS / 2, bins.length)]!) : 0;
      const outer = inner + 0.08 + v * 1.7 * amp;
      const a = (i / RING_BARS) * Math.PI * 2 + time * 0.05;
      const cx = Math.cos(a);
      const cz = Math.sin(a);
      pos[i * 6] = cx * inner;
      pos[i * 6 + 1] = 0;
      pos[i * 6 + 2] = cz * inner;
      pos[i * 6 + 3] = cx * outer;
      pos[i * 6 + 4] = 0;
      pos[i * 6 + 5] = cz * outer;
    }
    (this.ring.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;

    if (f.xrMode) return;
    if (opts.cameraMouse) {
      const r = f.mouseZoom * 0.85;
      camera.position.set(
        Math.sin(f.mouseYaw) * Math.cos(f.mousePitch) * r,
        Math.sin(f.mousePitch) * r * 0.7,
        Math.cos(f.mouseYaw) * Math.cos(f.mousePitch) * r,
      );
    } else {
      this.orbit += dt * (opts.orbitSpeed * 0.5 + 0.03);
      const r = 11 + Math.sin(time * 0.13) * 1.2 * f.drift;
      camera.position.set(
        Math.sin(this.orbit) * r,
        1.6 + Math.sin(time * 0.21) * 1.4 * (0.3 + f.drift),
        Math.cos(this.orbit) * r,
      );
    }
    camera.position.y += f.kick * 0.5;
    camera.fov += (48 - f.kick * 5 - camera.fov) * Math.min(1, dt * 10);
    camera.updateProjectionMatrix();
    camera.lookAt(0, 0, 0);
  }

  dispose(): void {
    this.disposed = true;
    this.abort.abort();
    for (const object of [this.grid, this.countries, this.ring, this.stars, this.core, this.halo]) {
      object?.geometry.dispose();
      object?.material.dispose();
    }
    this.levelTexture.dispose();
  }
}
