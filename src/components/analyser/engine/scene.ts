import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { sphereVertexShader, sphereFragmentShader } from "./shaders";
import type { AudioBands } from "./audio";

export type Palette = [string, string, string];

/**
 * Available visualization modes for Spectrum Aura
 * - combo: Radial bars, sphere, particles
 * - classic: Horizontal LED bar analyzer
 * - ripple: Ring-wave field responsive to frequency bands
 * - datastream: Neon point-cloud terrain
 * - nebula: Pulsing volumetric shader sphere
 * - monolith: 32x32 instanced cube grid with spotlight
 * - mandala: Radial audio-reactive ribbons
 * - terrain: Wireframe waterfall displacement grid
 */
export type ViewMode =
  | "combo"
  | "classic"
  | "ripple"
  | "datastream"
  | "nebula"
  | "monolith"
  | "mandala"
  | "terrain";

/**
 * Scene: Manages all 8 visualization modes in a single Three.js scene.
 * 
 * Each view is rendered as a separate group that can be toggled visible.
 * Views share the same camera, lighting, and post-processing pipeline.
 */
export class Scene {
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  group = new THREE.Group();          // combo group
  classicGroup = new THREE.Group();   // classic group
  dataStreamGroup = new THREE.Group();
  nebulaGroup = new THREE.Group();
  monolithGroup = new THREE.Group();
  mandalaGroup = new THREE.Group();
  terrainGroup = new THREE.Group();

  bars!: THREE.InstancedMesh;
  private barCount = 0;
  private dummy = new THREE.Object3D();
  private barColor = new THREE.Color();

  sphere!: THREE.Mesh;
  sphereMat!: THREE.ShaderMaterial;

  particles!: THREE.Points;
  particleMat!: THREE.PointsMaterial;
  particleGeo!: THREE.BufferGeometry;
  private particleSeeds!: Float32Array;
  private particleCount = 0;

  // classic view
  classicBars!: THREE.InstancedMesh;
  classicPeaks!: THREE.InstancedMesh;
  private classicCount = 0;
  private classicLevels!: Float32Array;
  private classicPeakLevels!: Float32Array;

  // ripple view
  rippleGroup = new THREE.Group();
  private rippleColumnData: Array<{
    root: THREE.Group;
    meshes: THREE.Mesh[];
    mats: THREE.MeshStandardMaterial[];
  }> = [];
  private rippleGeo?: THREE.BufferGeometry;
  /** Phase per side-by-side column (max 5). */
  private ripplePhases = new Float32Array(50);
  private rippleSliceScratch = new Float32Array(50);
  private rippleCount = 40;
  private rippleCols = 1;

  // data-stream view
  dataStreamPoints?: THREE.Points;
  dataStreamMat?: THREE.ShaderMaterial;
  private dataStreamPositions?: Float32Array;
  private dataStreamBasePos?: Float32Array;
  private dataStreamColors?: Float32Array;
  private dataStreamCount = 10000;

  // nebula view
  nebula?: THREE.Mesh;
  nebulaMat?: THREE.ShaderMaterial;
  private nebulaDetail = 144;

  // monolith view
  monolith?: THREE.InstancedMesh;
  monolithSpot?: THREE.SpotLight;
  monolithFill?: THREE.PointLight;
  private monolithHeights = new Float32Array(0);
  private monolithGrid = 32;
  private monolithCount = 0;
  private monolithGravity = 7;

  // mandala view
  private mandalaRibbons: Array<{
    line: Line2;
    geometry: LineGeometry;
    material: LineMaterial;
    points: THREE.Vector3[];
    curve: THREE.CatmullRomCurve3;
    positions: number[];
  }> = [];
  private mandalaRibbonCount = 12;

  // terrain view
  terrain?: THREE.Mesh;
  private terrainGeo?: THREE.PlaneGeometry;
  private terrainHistory?: Float32Array;
  private terrainColors?: Float32Array;
  private terrainRows = 96;
  private terrainCols = 128;
  private readonly terrainWidth = 18;
  private readonly terrainDepth = 26;

  postFxBoost = { bloom: 1, glitch: 0 };

  view: ViewMode = "combo";

  private palette: Palette = ["#ff2d95", "#7a5cff", "#00e5ff"];
  private paletteThree: [THREE.Color, THREE.Color, THREE.Color];

  cameraTarget = new THREE.Vector3();
  private orbitAngle = 0;
  private kick = 0;
  private lastBpmPhase = 0;

  constructor(width: number, height: number) {
    this.scene.background = new THREE.Color("#05060a");
    this.scene.fog = new THREE.FogExp2(0x05060a, 0.025);

    this.camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 200);
    this.camera.position.set(0, 3, 12);

    this.scene.add(this.group);
    this.scene.add(this.classicGroup);
    this.scene.add(this.rippleGroup);
    this.scene.add(this.dataStreamGroup);
    this.scene.add(this.nebulaGroup);
    this.scene.add(this.monolithGroup);
    this.scene.add(this.mandalaGroup);
    this.scene.add(this.terrainGroup);
    this.classicGroup.visible = false;
    this.rippleGroup.visible = false;
    this.dataStreamGroup.visible = false;
    this.nebulaGroup.visible = false;
    this.monolithGroup.visible = false;
    this.mandalaGroup.visible = false;
    this.terrainGroup.visible = false;

    const ambient = new THREE.AmbientLight(0xffffff, 0.25);
    const dir = new THREE.DirectionalLight(0xffffff, 0.6);
    dir.position.set(5, 10, 5);
    this.scene.add(ambient, dir);

    this.paletteThree = [
      new THREE.Color(this.palette[0]),
      new THREE.Color(this.palette[1]),
      new THREE.Color(this.palette[2]),
    ];

    this.buildBars(128);
    this.buildSphere();
    this.buildParticles(6000);
    this.buildClassic(64);
    this.buildClassicGrid();
    this.buildRipple();
    this.buildDataStream(10000);
    this.buildNebula();
    this.buildMonolith();
    this.buildMandala();
    this.buildTerrain();

    // Ensure every view material/light starts with the active palette.
    this.setPalette(this.palette);
  }

  classicGrid?: THREE.LineSegments;
  private classicGridMat?: THREE.LineBasicMaterial;

  buildClassicGrid() {
    if (this.classicGrid) {
      this.classicGroup.remove(this.classicGrid);
      this.classicGrid.geometry.dispose();
      this.classicGridMat?.dispose();
    }
    const width = 15;
    const height = 7.5;
    const cols = 16;
    const rows = 10;
    const verts: number[] = [];
    const z = -0.3;
    // horizontal lines
    for (let r = 0; r <= rows; r++) {
      const y = (r / rows) * height;
      verts.push(-width / 2, y, z, width / 2, y, z);
    }
    // vertical lines
    for (let c = 0; c <= cols; c++) {
      const x = -width / 2 + (c / cols) * width;
      verts.push(x, 0, z, x, height, z);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    });
    this.classicGridMat = mat;
    this.classicGrid = new THREE.LineSegments(geo, mat);
    this.classicGroup.add(this.classicGrid);
  }

  setView(view: ViewMode) {
    if (this.view === view) return;
    this.view = view;
    this.group.visible = view === "combo";
    this.classicGroup.visible = view === "classic";
    this.rippleGroup.visible = view === "ripple";
    this.dataStreamGroup.visible = view === "datastream";
    this.nebulaGroup.visible = view === "nebula";
    this.monolithGroup.visible = view === "monolith";
    this.mandalaGroup.visible = view === "mandala";
    this.terrainGroup.visible = view === "terrain";
  }

  /**
   * Updates all palette-derived colors across all visualizations.
   * Synchronizes the 3-color palette with all materials and lights.
   * Call when user changes the active palette.
   */
  setPalette(p: Palette) {
    this.palette = p;
    this.paletteThree = [new THREE.Color(p[0]), new THREE.Color(p[1]), new THREE.Color(p[2])];
    this.sphereMat.uniforms.uColorA.value.copy(this.paletteThree[0]);
    this.sphereMat.uniforms.uColorB.value.copy(this.paletteThree[1]);
    this.sphereMat.uniforms.uColorC.value.copy(this.paletteThree[2]);
    // refresh combo bar colors
    if (this.bars?.instanceColor) {
      const arr = this.bars.instanceColor.array as Float32Array;
      for (let i = 0; i < this.barCount; i++) {
        const c = this.colorAt(i / this.barCount);
        arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b;
      }
      this.bars.instanceColor.needsUpdate = true;
    }
    // refresh classic bar colors
    if (this.classicBars?.instanceColor) {
      const arr = this.classicBars.instanceColor.array as Float32Array;
      for (let i = 0; i < this.classicCount; i++) {
        const c = this.colorAt(i / this.classicCount);
        arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b;
      }
      this.classicBars.instanceColor.needsUpdate = true;
    }

    // refresh datastream palette colors
    if (this.dataStreamColors && this.dataStreamPoints) {
      const arr = this.dataStreamColors;
      const n = this.dataStreamCount;
      for (let i = 0; i < n; i++) {
        const freqT = n <= 1 ? 0 : i / (n - 1);
        const c = this.colorAt(freqT);
        arr[i * 3] = c.r;
        arr[i * 3 + 1] = c.g;
        arr[i * 3 + 2] = c.b;
      }
      (this.dataStreamPoints.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    }

    // refresh monolith material tint
    if (this.monolith) {
      const mat = this.monolith.material as THREE.MeshStandardMaterial;
      mat.color.setRGB(1, 1, 1);
      mat.emissive.copy(this.paletteThree[2]);

      if (this.monolith.instanceColor) {
        const size = this.monolithGrid;
        const count = this.monolithCount;
        const arr = this.monolith.instanceColor.array as Float32Array;
        for (let z = 0; z < size; z++) {
          for (let x = 0; x < size; x++) {
            const i = z * size + x;
            if (i >= count) continue;
            const t = size <= 1 ? 0 : (x + z) / (2 * (size - 1));
            const c = this.colorAt(t);
            arr[i * 3] = c.r;
            arr[i * 3 + 1] = c.g;
            arr[i * 3 + 2] = c.b;
          }
        }
        this.monolith.instanceColor.needsUpdate = true;
      }
    }
    if (this.monolithSpot) {
      this.monolithSpot.color.copy(this.paletteThree[0]);
    }
    if (this.monolithFill) {
      this.monolithFill.color.copy(this.paletteThree[1]);
    }

    // refresh mandala line colors
    if (this.mandalaRibbons.length > 0) {
      const n = this.mandalaRibbons.length;
      for (let i = 0; i < n; i++) {
        const lineMat = this.mandalaRibbons[i]!.material;
        lineMat.color.copy(this.colorAt(i / n));
      }
    }

    // refresh terrain colors
    if (this.terrainGeo && this.terrainColors) {
      const rows = this.terrainRows;
      const cols = this.terrainCols;
      const arr = this.terrainColors;
      for (let r = 0; r < rows; r++) {
        const rowFade = 0.82 + 0.18 * (1 - r / Math.max(1, rows - 1));
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c;
          const freqT = cols <= 1 ? 0 : c / (cols - 1);
          const col = this.colorAt(freqT);
          arr[i * 3] = col.r * rowFade;
          arr[i * 3 + 1] = col.g * rowFade;
          arr[i * 3 + 2] = col.b * rowFade;
        }
      }
      (this.terrainGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    }

    // refresh nebula palette uniforms
    if (this.nebulaMat) {
      this.nebulaMat.uniforms.uColorA.value.copy(this.paletteThree[0]);
      this.nebulaMat.uniforms.uColorB.value.copy(this.paletteThree[1]);
      this.nebulaMat.uniforms.uColorC.value.copy(this.paletteThree[2]);
    }
  }

  comboBarMat!: THREE.MeshStandardMaterial;
  comboUniforms!: {
    uBands: { value: number };
    uColorLow: { value: THREE.Color };
    uColorMid: { value: THREE.Color };
    uColorHigh: { value: THREE.Color };
    uMidStop: { value: number };
    uHighStop: { value: number };
  };

  buildBars(count: number) {
    if (this.bars) {
      this.group.remove(this.bars);
      this.bars.geometry.dispose();
      (this.bars.material as THREE.Material).dispose();
    }
    this.barCount = count;
    const geo = new THREE.BoxGeometry(0.18, 1, 0.18);
    geo.translate(0, 0.5, 0); // pivot at base
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.6,
      roughness: 0.25,
      emissive: 0xffffff,
      emissiveIntensity: 0.2,
    });
    this.comboUniforms = {
      uBands: { value: 0 },
      uColorLow: { value: new THREE.Color("#22ff66") },
      uColorMid: { value: new THREE.Color("#ffe23a") },
      uColorHigh: { value: new THREE.Color("#ff2a2a") },
      uMidStop: { value: 0.6 },
      uHighStop: { value: 0.82 },
    };
    this.injectComboShader(mat);
    this.comboBarMat = mat;
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const t = i / count;
      const c = this.colorAt(t);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
    this.bars = mesh;
    this.group.add(mesh);
  }

  private injectComboShader(mat: THREE.MeshStandardMaterial) {
    const u = this.comboUniforms;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uBands = u.uBands;
      shader.uniforms.uColorLow = u.uColorLow;
      shader.uniforms.uColorMid = u.uColorMid;
      shader.uniforms.uColorHigh = u.uColorHigh;
      shader.uniforms.uMidStop = u.uMidStop;
      shader.uniforms.uHighStop = u.uHighStop;
      shader.vertexShader =
        "varying float vLocalY;\n" +
        shader.vertexShader.replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nvLocalY = position.y;",
        );
      const fragHead =
        "uniform float uBands;\nuniform vec3 uColorLow;\nuniform vec3 uColorMid;\nuniform vec3 uColorHigh;\n" +
        "uniform float uMidStop;\nuniform float uHighStop;\nvarying float vLocalY;\n";
      shader.fragmentShader = fragHead + shader.fragmentShader
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
           if (uBands > 0.5) {
             vec3 bandCol = uColorLow;
             bandCol = mix(bandCol, uColorMid, smoothstep(uMidStop - 0.05, uMidStop + 0.05, vLocalY));
             bandCol = mix(bandCol, uColorHigh, smoothstep(uHighStop - 0.05, uHighStop + 0.05, vLocalY));
             diffuseColor.rgb = bandCol;
           }`,
        )
        .replace(
          "#include <emissivemap_fragment>",
          `#include <emissivemap_fragment>
           if (uBands > 0.5) {
             vec3 bandCol = uColorLow;
             bandCol = mix(bandCol, uColorMid, smoothstep(uMidStop - 0.05, uMidStop + 0.05, vLocalY));
             bandCol = mix(bandCol, uColorHigh, smoothstep(uHighStop - 0.05, uHighStop + 0.05, vLocalY));
             totalEmissiveRadiance = bandCol * 0.9;
           }`,
        );
    };
    mat.needsUpdate = true;
  }


  buildSphere() {
    const geo = new THREE.IcosahedronGeometry(1.6, 24);
    const mat = new THREE.ShaderMaterial({
      vertexShader: sphereVertexShader,
      fragmentShader: sphereFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uBass: { value: 0 },
        uMid: { value: 0 },
        uDisp: { value: 0.55 },
        uColorA: { value: this.paletteThree[0].clone() },
        uColorB: { value: this.paletteThree[1].clone() },
        uColorC: { value: this.paletteThree[2].clone() },
      },
    });
    this.sphereMat = mat;
    this.sphere = new THREE.Mesh(geo, mat);
    this.group.add(this.sphere);
  }

  buildParticles(count: number) {
    if (this.particles) {
      this.group.remove(this.particles);
      this.particleGeo.dispose();
      this.particleMat.dispose();
    }
    this.particleCount = count;
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count * 3); // r, theta, phi
    for (let i = 0; i < count; i++) {
      const r = 3 + Math.random() * 6;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      seeds[i * 3] = r;
      seeds[i * 3 + 1] = theta;
      seeds[i * 3 + 2] = phi;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    this.particleSeeds = seeds;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.05,
      color: new THREE.Color(this.palette[2]),
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.particleGeo = geo;
    this.particleMat = mat;
    this.particles = new THREE.Points(geo, mat);
    this.group.add(this.particles);
  }

  private classicHoldTimers!: Float32Array;
  private classicBarMat!: THREE.MeshStandardMaterial;
  private classicUniforms!: {
    uSegments: { value: number };
    uBlocky: { value: number };
    uBands: { value: number };
    uColorLow: { value: THREE.Color };
    uColorMid: { value: THREE.Color };
    uColorHigh: { value: THREE.Color };
    uMidStop: { value: number };
    uHighStop: { value: number };
  };

  buildClassic(count: number) {
    if (this.classicBars) {
      this.classicGroup.remove(this.classicBars);
      this.classicGroup.remove(this.classicPeaks);
      this.classicBars.geometry.dispose();
      (this.classicBars.material as THREE.Material).dispose();
      this.classicPeaks.geometry.dispose();
      (this.classicPeaks.material as THREE.Material).dispose();
    }
    this.classicCount = count;
    this.classicLevels = new Float32Array(count);
    this.classicPeakLevels = new Float32Array(count);
    this.classicHoldTimers = new Float32Array(count);

    this.classicUniforms = {
      uSegments: { value: 18 },
      uBlocky: { value: 1 },
      uBands: { value: 1 },
      uColorLow: { value: new THREE.Color("#22ff66") },
      uColorMid: { value: new THREE.Color("#ffe23a") },
      uColorHigh: { value: new THREE.Color("#ff2a2a") },
      uMidStop: { value: 0.6 },
      uHighStop: { value: 0.82 },
    };

    const barGeo = new THREE.BoxGeometry(1, 1, 0.4);
    barGeo.translate(0, 0.5, 0); // pivot at base
    const barMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.3,
      roughness: 0.4,
      emissive: 0xffffff,
      emissiveIntensity: 0.5,
    });
    this.injectClassicShader(barMat);
    this.classicBarMat = barMat;
    const bars = new THREE.InstancedMesh(barGeo, barMat, count);
    bars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const c = this.colorAt(i / count);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    bars.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);

    const peakGeo = new THREE.BoxGeometry(1, 0.12, 0.42);
    const peakMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.1,
      roughness: 0.5,
      emissive: 0xffffff,
      emissiveIntensity: 1.4,
    });
    const peaks = new THREE.InstancedMesh(peakGeo, peakMat, count);
    peaks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const peakColors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      peakColors[i * 3] = 1; peakColors[i * 3 + 1] = 1; peakColors[i * 3 + 2] = 1;
    }
    peaks.instanceColor = new THREE.InstancedBufferAttribute(peakColors, 3);

    this.classicBars = bars;
    this.classicPeaks = peaks;
    this.classicGroup.add(bars);
    this.classicGroup.add(peaks);
  }

  private injectClassicShader(mat: THREE.MeshStandardMaterial) {
    const u = this.classicUniforms;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uSegments = u.uSegments;
      shader.uniforms.uBlocky = u.uBlocky;
      shader.uniforms.uBands = u.uBands;
      shader.uniforms.uColorLow = u.uColorLow;
      shader.uniforms.uColorMid = u.uColorMid;
      shader.uniforms.uColorHigh = u.uColorHigh;
      shader.uniforms.uMidStop = u.uMidStop;
      shader.uniforms.uHighStop = u.uHighStop;
      shader.vertexShader =
        "varying float vLocalY;\n" +
        shader.vertexShader.replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nvLocalY = position.y;",
        );
      const fragHead =
        "uniform float uSegments;\nuniform float uBlocky;\nuniform float uBands;\n" +
        "uniform vec3 uColorLow;\nuniform vec3 uColorMid;\nuniform vec3 uColorHigh;\n" +
        "uniform float uMidStop;\nuniform float uHighStop;\n" +
        "varying float vLocalY;\n";
      shader.fragmentShader = fragHead + shader.fragmentShader
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
           if (uBlocky > 0.5) {
             float seg = vLocalY * uSegments;
             float cell = fract(seg);
             if (cell > 0.78) discard;
           }
           if (uBands > 0.5) {
             vec3 bandCol = uColorLow;
             bandCol = mix(bandCol, uColorMid, smoothstep(uMidStop - 0.05, uMidStop + 0.05, vLocalY));
             bandCol = mix(bandCol, uColorHigh, smoothstep(uHighStop - 0.05, uHighStop + 0.05, vLocalY));
             diffuseColor.rgb = bandCol;
           }`,
        )
        .replace(
          "#include <emissivemap_fragment>",
          `#include <emissivemap_fragment>
           if (uBands > 0.5) {
             vec3 bandCol = uColorLow;
             bandCol = mix(bandCol, uColorMid, smoothstep(uMidStop - 0.05, uMidStop + 0.05, vLocalY));
             bandCol = mix(bandCol, uColorHigh, smoothstep(uHighStop - 0.05, uHighStop + 0.05, vLocalY));
             totalEmissiveRadiance = bandCol * 0.9;
           }`,
        );
    };
    mat.needsUpdate = true;
  }

  private updateClassic(
    dt: number,
    audio: AudioBands,
    peakDecay: number,
    peakHold: number,
    colorBands: boolean,
    blocky: boolean,
    segments: number,
    peakColor: string,
    peakStyle: "bar" | "thin" | "glow" | "none",
  ) {
    if (this.classicUniforms) {
      this.classicUniforms.uBands.value = colorBands ? 1 : 0;
      this.classicUniforms.uBlocky.value = blocky ? 1 : 0;
      this.classicUniforms.uSegments.value = segments;
    }

    // apply peak material style
    const peakMat = this.classicPeaks.material as THREE.MeshStandardMaterial;
    const col = new THREE.Color(peakColor);
    peakMat.color.copy(col);
    peakMat.emissive.copy(col);
    if (peakStyle === "glow") { peakMat.emissiveIntensity = 3.5; peakMat.opacity = 1; peakMat.transparent = false; }
    else if (peakStyle === "thin") { peakMat.emissiveIntensity = 1.0; peakMat.opacity = 0.85; peakMat.transparent = true; }
    else { peakMat.emissiveIntensity = 1.4; peakMat.opacity = 1; peakMat.transparent = false; }
    this.classicPeaks.visible = peakStyle !== "none";

    const bins = audio.bins;
    if (bins.length === 0) return;
    const n = this.classicCount;
    const totalWidth = 14;
    const gap = 0.15;
    const barW = (totalWidth - gap * (n - 1)) / n;
    const startX = -totalWidth / 2 + barW / 2;
    const maxH = 7;
    const peakH = peakStyle === "thin" ? 0.4 : peakStyle === "glow" ? 1.6 : 1.0;

    for (let i = 0; i < n; i++) {
      const t = i / n;
      const idx = Math.floor(Math.pow(t, 1.6) * (bins.length * 0.7));
      const v = bins[idx] / 255;
      const target = Math.pow(v, 1.3);
      this.classicLevels[i] = Math.max(target, this.classicLevels[i] * 0.85);

      if (this.classicLevels[i] >= this.classicPeakLevels[i]) {
        this.classicPeakLevels[i] = this.classicLevels[i];
        this.classicHoldTimers[i] = peakHold;
      } else if (this.classicHoldTimers[i] > 0) {
        this.classicHoldTimers[i] = Math.max(0, this.classicHoldTimers[i] - dt);
      } else {
        this.classicPeakLevels[i] = Math.max(0, this.classicPeakLevels[i] - peakDecay * dt);
      }

      const x = startX + i * (barW + gap);
      const h = 0.05 + this.classicLevels[i] * maxH;

      this.dummy.position.set(x, 0, 0);
      this.dummy.scale.set(barW, h, 1);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.classicBars.setMatrixAt(i, this.dummy.matrix);

      const py = 0.05 + this.classicPeakLevels[i] * maxH;
      this.dummy.position.set(x, py, 0);
      this.dummy.scale.set(barW, peakH, 1);
      this.dummy.updateMatrix();
      this.classicPeaks.setMatrixAt(i, this.dummy.matrix);
    }
    this.classicBars.instanceMatrix.needsUpdate = true;
    this.classicPeaks.instanceMatrix.needsUpdate = true;
  }

  private colorAt(t: number): THREE.Color {
    const [a, b, c] = this.paletteThree;
    if (t < 0.5) return a.clone().lerp(b, t * 2);
    return b.clone().lerp(c, (t - 0.5) * 2);
  }

  buildDataStream(count: number = this.dataStreamCount) {
    if (this.dataStreamPoints) {
      this.dataStreamGroup.remove(this.dataStreamPoints);
      this.dataStreamPoints.geometry.dispose();
      this.dataStreamMat?.dispose();
    }
    this.dataStreamCount = count;
    const positions = new Float32Array(count * 3);
    const base = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * 9;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      positions[i * 3] = x;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = z;
      base[i * 3] = x;
      base[i * 3 + 1] = 0;
      base[i * 3 + 2] = z;
      const freqT = count <= 1 ? 0 : i / (count - 1);
      const c = this.colorAt(freqT);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uSize: { value: 4 },
        uDpr: { value: Math.min(window.devicePixelRatio || 1, 2) },
      },
      vertexShader: /* glsl */ `
        uniform float uSize;
        uniform float uDpr;
        varying float vHeight;
        varying vec3 vPointColor;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vHeight = clamp((position.y + 5.0) / 10.0, 0.0, 1.0);
          vPointColor = color;
          gl_PointSize = max(1.0, uSize * uDpr * (1.0 / max(1.0, -mv.z * 0.12)));
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vHeight;
        varying vec3 vPointColor;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float mask = smoothstep(0.5, 0.05, length(uv));
          vec3 col = vPointColor * (0.72 + vHeight * 0.6);
          gl_FragColor = vec4(col, mask);
        }
      `,
    });
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        "varying vec3 vPointColor;",
        "varying vec3 vPointColor;\nattribute vec3 color;"
      );
    };
    mat.needsUpdate = true;
    this.dataStreamPositions = positions;
    this.dataStreamBasePos = base;
    this.dataStreamColors = colors;
    this.dataStreamMat = mat;
    this.dataStreamPoints = new THREE.Points(geo, mat);
    this.dataStreamGroup.add(this.dataStreamPoints);
  }

  private updateDataStream(
    time: number,
    audio: AudioBands,
    opts: { datastreamAmplitude: number; datastreamUsePalette: boolean },
  ) {
    if (!this.dataStreamPoints || !this.dataStreamPositions || !this.dataStreamBasePos || !this.dataStreamMat) return;
    const bins = audio.bins;
    const activeBinCount = Math.max(1, Math.floor(bins.length * 0.7));
    const arr = this.dataStreamPositions;
    const base = this.dataStreamBasePos;
    const colArr = this.dataStreamColors;
    const n = this.dataStreamCount;
    const bass = Math.max(0, Math.min(1, audio.bass));
    const high = Math.max(0, Math.min(1, audio.high));
    const mid = Math.max(0, Math.min(1, audio.mid));
    const amp = Math.max(0.05, opts.datastreamAmplitude);
    const size = (2.4 + bass * 12) * Math.max(0.1, amp);
    this.dataStreamMat.uniforms.uSize.value = size;
    for (let i = 0; i < n; i++) {
      const freqT = n <= 1 ? 0 : i / (n - 1);
      const idx = Math.floor(freqT * activeBinCount);
      const v = bins[idx] ? bins[idx]! / 255 : 0;
      const shimmer = Math.sin(time * 3.2 + i * 0.013) * 0.25;
      arr[i * 3] = base[i * 3] + Math.sin(time * 0.8 + i * 0.021) * 0.06 * high;
      arr[i * 3 + 1] = (v * 3.8 + shimmer) * (0.35 + high * 1.4) * amp;
      arr[i * 3 + 2] = base[i * 3 + 2] + (v - 0.5) * 1.4 * high * amp;
      if (colArr) {
        if (opts.datastreamUsePalette) {
          const c = this.colorAt(freqT).lerp(new THREE.Color(1, 1, 1), 0.08 + v * 0.2 + bass * 0.08);
          colArr[i * 3] = c.r;
          colArr[i * 3 + 1] = c.g;
          colArr[i * 3 + 2] = c.b;
        } else {
          const c = new THREE.Color("#7fd9ff").lerp(new THREE.Color("#d4ffff"), v);
          colArr[i * 3] = c.r;
          colArr[i * 3 + 1] = c.g;
          colArr[i * 3 + 2] = c.b;
        }
      }
    }
    (this.dataStreamPoints.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    if (colArr) (this.dataStreamPoints.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  buildNebula(detail: number = this.nebulaDetail) {
    if (this.nebula) {
      this.nebulaGroup.remove(this.nebula);
      this.nebula.geometry.dispose();
      this.nebulaMat?.dispose();
    }
    const segs = Math.max(24, Math.round(detail));
    this.nebulaDetail = segs;
    const geo = new THREE.SphereGeometry(2.2, segs, segs);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uAvgFrequency: { value: 0 },
        uColorA: { value: this.paletteThree[0].clone() },
        uColorB: { value: this.paletteThree[1].clone() },
        uColorC: { value: this.paletteThree[2].clone() },
      },
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform float uAvgFrequency;
        varying vec3 vNormalW;
        varying vec3 vWorldPos;
        float hash(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453123); }
        float noise(vec3 p){
          vec3 i = floor(p);
          vec3 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
            mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
            f.z
          );
        }
        void main() {
          float speed = 0.35 + uAvgFrequency * 1.2;
          float intensity = 0.25 + uAvgFrequency * 1.8;
          float n = noise(normal * 2.8 + uTime * speed);
          vec3 displaced = position + normal * (n - 0.5) * intensity;
          vec4 world = modelMatrix * vec4(displaced, 1.0);
          vWorldPos = world.xyz;
          vNormalW = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uAvgFrequency;
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        uniform vec3 uColorC;
        varying vec3 vNormalW;
        varying vec3 vWorldPos;
        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          float fresnel = pow(1.0 - max(dot(normalize(vNormalW), viewDir), 0.0), 2.4);
          float pulse = 0.5 + 0.5 * sin(uTime * (0.8 + uAvgFrequency * 2.0) + vWorldPos.y * 0.7);
          vec3 inner = mix(uColorA, uColorB, pulse);
          vec3 aura = mix(uColorB, uColorC, fresnel);
          vec3 col = inner * (0.45 + uAvgFrequency * 0.9) + aura * fresnel * 1.6;
          float alpha = min(1.0, 0.45 + fresnel * 0.75);
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });
    this.nebulaMat = mat;
    this.nebula = new THREE.Mesh(geo, mat);
    this.nebulaGroup.add(this.nebula);
  }

  private updateNebula(
    dt: number,
    time: number,
    audio: AudioBands,
    opts: { nebulaAmplitude: number; nebulaUsePalette: boolean },
  ) {
    if (!this.nebula || !this.nebulaMat) return;
    const amp = Math.max(0.05, opts.nebulaAmplitude);
    const avgFrequency = (audio.bass + audio.mid + audio.high) / 3;
    this.nebula.rotation.y += dt * (0.08 + avgFrequency * 0.4) * (0.4 + amp * 0.6);
    this.nebula.rotation.x += dt * 0.04 * (0.4 + amp * 0.6);
    this.nebulaMat.uniforms.uTime.value = time;
    this.nebulaMat.uniforms.uAvgFrequency.value = avgFrequency * amp;
    if (opts.nebulaUsePalette) {
      this.nebulaMat.uniforms.uColorA.value.copy(this.paletteThree[0]).lerp(this.paletteThree[1], audio.mid * 0.35);
      this.nebulaMat.uniforms.uColorB.value.copy(this.paletteThree[1]).lerp(this.paletteThree[2], audio.high * 0.4);
      this.nebulaMat.uniforms.uColorC.value.copy(this.paletteThree[2]).lerp(this.paletteThree[0], audio.bass * 0.35);
    } else {
      this.nebulaMat.uniforms.uColorA.value.set("#ffffff");
      this.nebulaMat.uniforms.uColorB.value.set("#8aa4ff");
      this.nebulaMat.uniforms.uColorC.value.set("#4fd1ff");
    }
  }

  buildMonolith(gridSize: number = this.monolithGrid) {
    if (this.monolith) {
      this.monolithGroup.remove(this.monolith);
      this.monolith.geometry.dispose();
      (this.monolith.material as THREE.Material).dispose();
    }
    if (this.monolithSpot) this.monolithGroup.remove(this.monolithSpot);
    if (this.monolithFill) this.monolithGroup.remove(this.monolithFill);
    const size = Math.max(2, Math.round(gridSize));
    this.monolithGrid = size;
    const count = size * size;
    this.monolithCount = count;
    this.monolithHeights = new Float32Array(count);
    const geo = new THREE.BoxGeometry(0.8, 1, 0.8);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: this.paletteThree[2].clone(),
      emissiveIntensity: 0.7,
      metalness: 0.08,
      roughness: 0.55,
      vertexColors: true,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const colors = new Float32Array(count * 3);
    for (let z = 0; z < size; z++) {
      for (let x = 0; x < size; x++) {
        const i = z * size + x;
        const t = size <= 1 ? 0 : (x + z) / (2 * (size - 1));
        const c = this.colorAt(t);
        colors[i * 3] = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
      }
    }
    mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
    this.monolith = mesh;
    this.monolithGroup.add(mesh);
    this.monolithSpot = new THREE.SpotLight(this.paletteThree[0].clone(), 4.2, 58, Math.PI / 7, 0.35, 1.2);
    this.monolithSpot.position.set(0, 15, 0);
    this.monolithSpot.target.position.set(0, 0, 0);
    this.monolithFill = new THREE.PointLight(this.paletteThree[1].clone(), 2.2, 75, 1.8);
    this.monolithFill.position.set(0, 9, 0);
    this.monolithGroup.add(this.monolithSpot, this.monolithSpot.target, this.monolithFill);
  }

  private updateMonolith(
    dt: number,
    audio: AudioBands,
    time: number,
    opts: { monolithAmplitude: number; monolithUsePalette: boolean },
  ) {
    const amp = Math.max(0.05, opts.monolithAmplitude);
    if (!this.monolith || !this.monolithSpot) return;
    const size = this.monolithGrid;
    const bins = audio.bins;
    const activeBinCount = Math.max(1, Math.floor(bins.length * 0.55));
    const spacing = 1;
    let highest = -1;
    let highestI = 0;
    let peakFreqT = 0;
    const colors = this.monolith.instanceColor?.array as Float32Array | undefined;
    for (let z = 0; z < size; z++) {
      for (let x = 0; x < size; x++) {
        const i = z * size + x;
        const freqT = this.monolithCount <= 1 ? 0 : i / (this.monolithCount - 1);
        const bin = bins[Math.floor(freqT * activeBinCount)] ?? 0;
        const target = 0.2 + Math.pow(bin / 255, 1.5) * 15 * amp;
        const current = this.monolithHeights[i] ?? 0;
        const next = target > current ? target : Math.max(0.2, current - this.monolithGravity * dt);
        this.monolithHeights[i] = next;
        if (next > highest) {
          highest = next;
          highestI = i;
          peakFreqT = freqT;
        }

        if (colors) {
          if (opts.monolithUsePalette) {
            const signal = Math.pow(bin / 255, 1.1);
            const paletteT = Math.min(1, Math.max(0, freqT * 0.58 + signal * 0.42));
            const c = this.colorAt(paletteT).lerp(new THREE.Color(1, 1, 1), 0.22 + signal * 0.36);
            colors[i * 3] = c.r;
            colors[i * 3 + 1] = c.g;
            colors[i * 3 + 2] = c.b;
          } else {
            colors[i * 3] = 0.78;
            colors[i * 3 + 1] = 0.86;
            colors[i * 3 + 2] = 1.0;
          }
        }

        this.dummy.position.set(
          (x - (size - 1) / 2) * spacing,
          0,
          (z - (size - 1) / 2) * spacing,
        );
        this.dummy.scale.set(1, next, 1);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.monolith.setMatrixAt(i, this.dummy.matrix);
      }
    }
    this.monolith.instanceMatrix.needsUpdate = true;
    if (this.monolith.instanceColor) this.monolith.instanceColor.needsUpdate = true;
    const peakX = highestI % size;
    const peakZ = Math.floor(highestI / size);
    const tx = (peakX - (size - 1) / 2) * spacing;
    const tz = (peakZ - (size - 1) / 2) * spacing;
    this.monolithSpot.position.x += (tx - this.monolithSpot.position.x) * Math.min(1, dt * 4);
    this.monolithSpot.position.z += (tz - this.monolithSpot.position.z) * Math.min(1, dt * 4);
    this.monolithSpot.target.position.x += (tx - this.monolithSpot.target.position.x) * Math.min(1, dt * 5);
    this.monolithSpot.target.position.z += (tz - this.monolithSpot.target.position.z) * Math.min(1, dt * 5);

    const mat = this.monolith.material as THREE.MeshStandardMaterial;
    mat.color.setRGB(1, 1, 1);
    if (opts.monolithUsePalette) {
      mat.emissive.copy(this.colorAt(peakFreqT)).lerp(new THREE.Color(1, 1, 1), 0.26 + audio.high * 0.28);
    } else {
      mat.emissive.set("#9fc4ff");
    }
    mat.emissiveIntensity = 0.95 + audio.high * 1.35;
    this.monolithSpot.intensity = 4.8 + audio.bass * 6.2;
    if (opts.monolithUsePalette) {
      this.monolithSpot.color.copy(this.colorAt(peakFreqT)).lerp(new THREE.Color(1, 1, 1), 0.08 + 0.1 * Math.sin(time * 0.9));
    } else {
      this.monolithSpot.color.set("#ffffff");
    }
    if (this.monolithFill) {
      this.monolithFill.intensity = 2.6 + audio.mid * 3.4;
      if (opts.monolithUsePalette) {
        this.monolithFill.color.copy(this.paletteThree[1]).lerp(this.paletteThree[2], Math.min(1, audio.high * 0.55));
      } else {
        this.monolithFill.color.set("#b9d6ff");
      }
    }
  }

  buildMandala(ribbonCount: number = this.mandalaRibbonCount) {
    for (const r of this.mandalaRibbons) {
      this.mandalaGroup.remove(r.line);
      r.geometry.dispose();
      r.material.dispose();
    }
    this.mandalaRibbons = [];
    ribbonCount = Math.max(2, Math.round(ribbonCount));
    this.mandalaRibbonCount = ribbonCount;
    const pointsPerRibbon = 20;
    const samplePoints = 160;
    for (let i = 0; i < ribbonCount; i++) {
      const angle = (i / ribbonCount) * Math.PI * 2;
      const points: THREE.Vector3[] = [];
      for (let p = 0; p < pointsPerRibbon; p++) {
        const t = pointsPerRibbon <= 1 ? 0 : p / (pointsPerRibbon - 1);
        const r = 1.4 + t * 5;
        points.push(new THREE.Vector3(Math.cos(angle) * r, (t - 0.5) * 1.2, Math.sin(angle) * r));
      }
      const curve = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.35);
      const sampled = curve.getPoints(samplePoints - 1);
      const positions = new Array<number>(samplePoints * 3);
      for (let s = 0; s < samplePoints; s++) {
        const pt = sampled[s]!;
        positions[s * 3] = pt.x;
        positions[s * 3 + 1] = pt.y;
        positions[s * 3 + 2] = pt.z;
      }
      const geometry = new LineGeometry();
      geometry.setPositions(positions);
      const material = new LineMaterial({
        color: this.colorAt(i / ribbonCount),
        transparent: true,
        opacity: 0.9,
        linewidth: 6,
        worldUnits: false,
      });
      material.resolution.set(window.innerWidth || 1, window.innerHeight || 1);
      const line = new Line2(geometry, material);
      line.computeLineDistances();
      this.mandalaGroup.add(line);
      this.mandalaRibbons.push({ line, geometry, material, points, curve, positions });
    }
  }

  private updateMandala(
    dt: number,
    time: number,
    audio: AudioBands,
    opts: { mandalaAmplitude: number; mandalaUsePalette: boolean; mandalaLineWidth: number },
  ) {
    const bins = audio.bins;
    const activeBinCount = Math.max(1, Math.floor(bins.length * 0.7));
    const R = this.mandalaRibbons.length;
    if (!R || bins.length === 0) return;
    const amp = Math.max(0.05, opts.mandalaAmplitude);
    this.mandalaGroup.rotation.y += dt * (0.15 + audio.mid * 0.7);
    for (let i = 0; i < R; i++) {
      const r = this.mandalaRibbons[i]!;
      const P = r.points.length;
      for (let p = 0; p < P; p++) {
        const binStart = Math.floor(((i * P + p) / (R * P)) * activeBinCount);
        const v = bins[binStart] ? bins[binStart]! / 255 : 0;
        const t = P <= 1 ? 0 : p / (P - 1);
        const radius = 1.3 + t * 5.3 + v * 1.8 * amp;
        const angle = (i / R) * Math.PI * 2 + Math.sin(time * 0.7 + p * 0.3) * 0.08;
        r.points[p]!.set(
          Math.cos(angle) * radius,
          (t - 0.5) * 1.5 + (v - 0.5) * 1.4 * amp,
          Math.sin(angle) * radius,
        );
      }
      const sampled = r.curve.getPoints((r.positions.length / 3) - 1);
      for (let s = 0; s < sampled.length; s++) {
        const pt = sampled[s]!;
        r.positions[s * 3] = pt.x;
        r.positions[s * 3 + 1] = pt.y;
        r.positions[s * 3 + 2] = pt.z;
      }
      r.geometry.setPositions(r.positions);
      const mat = r.material;
      mat.opacity = 0.55 + audio.mid * 0.55;
      // LineMaterial width is in screen-space px, so scale slider to a visibly thick range.
      mat.linewidth = Math.max(2, opts.mandalaLineWidth * 6);
      if (opts.mandalaUsePalette) {
        mat.color.copy(this.colorAt(((i / R) + time * 0.03) % 1)).lerp(this.paletteThree[2], Math.min(1, audio.high * 0.6));
      } else {
        mat.color.set("#d8e7ff");
      }
    }
    const midSpike = Math.max(0, (audio.mid - 0.55) / 0.45);
    this.postFxBoost.bloom = 1 + midSpike * 1.8;
    this.postFxBoost.glitch = midSpike;
  }

  buildTerrain(cols: number = this.terrainCols) {
    if (this.terrain && this.terrainGeo) {
      this.terrainGroup.remove(this.terrain);
      this.terrainGeo.dispose();
      (this.terrain.material as THREE.Material).dispose();
    }
    const rows = this.terrainRows;
    cols = Math.max(16, Math.round(cols));
    this.terrainCols = cols;
    this.terrainHistory = new Float32Array(rows * cols);
    this.terrainColors = new Float32Array(rows * cols * 3);
    const geo = new THREE.PlaneGeometry(this.terrainWidth, this.terrainDepth, cols - 1, rows - 1);
    geo.rotateX(-Math.PI / 2.25);
    for (let r = 0; r < rows; r++) {
      const rowFade = 0.82 + 0.18 * (1 - r / Math.max(1, rows - 1));
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const freqT = cols <= 1 ? 0 : c / (cols - 1);
        const col = this.colorAt(freqT);
        this.terrainColors[i * 3] = col.r * rowFade;
        this.terrainColors[i * 3 + 1] = col.g * rowFade;
        this.terrainColors[i * 3 + 2] = col.b * rowFade;
      }
    }
    geo.setAttribute("color", new THREE.BufferAttribute(this.terrainColors, 3));
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      wireframe: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
    });
    this.terrainGeo = geo;
    this.terrain = new THREE.Mesh(geo, mat);
    this.terrain.position.set(0, -2, 4);
    this.terrainGroup.add(this.terrain);
  }

  private updateTerrain(
    audio: AudioBands,
    time: number,
    opts: { terrainAmplitude: number; terrainUsePalette: boolean },
  ) {
    const amp = Math.max(0.05, opts.terrainAmplitude);
    if (!this.terrainGeo || !this.terrainHistory || !this.terrain) return;
    const rows = this.terrainRows;
    const cols = this.terrainCols;
    const bins = audio.bins;
    const activeBinCount = Math.max(1, Math.floor(bins.length * 0.55));
    for (let r = rows - 1; r > 0; r--) {
      this.terrainHistory.copyWithin(r * cols, (r - 1) * cols, r * cols);
    }
    for (let c = 0; c < cols; c++) {
      const idx = Math.floor((c / cols) * activeBinCount);
      const v = bins[idx] ? bins[idx]! / 255 : 0;
      this.terrainHistory[c] = Math.pow(v, 1.25) * 3.6 * amp;
    }
    const pos = this.terrainGeo.attributes.position as THREE.BufferAttribute;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        pos.setY(i, this.terrainHistory[i]!);
      }
    }
    pos.needsUpdate = true;
    const colAttr = this.terrainGeo.attributes.color as THREE.BufferAttribute;
    const colArr = this.terrainColors;
    if (colArr) {
      for (let r = 0; r < rows; r++) {
        const rowFade = 0.76 + 0.24 * (1 - r / Math.max(1, rows - 1));
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c;
          const heightNorm = Math.min(1, (this.terrainHistory[i] ?? 0) / (3.6 * amp + 0.001));
          if (opts.terrainUsePalette) {
            const freqT = cols <= 1 ? 0 : c / (cols - 1);
            const col = this.colorAt(freqT).lerp(new THREE.Color(1, 1, 1), heightNorm * 0.22);
            colArr[i * 3] = col.r * rowFade;
            colArr[i * 3 + 1] = col.g * rowFade;
            colArr[i * 3 + 2] = col.b * rowFade;
          } else {
            const col = new THREE.Color("#9ed8ff").lerp(new THREE.Color("#dcf2ff"), heightNorm * 0.45);
            colArr[i * 3] = col.r * rowFade;
            colArr[i * 3 + 1] = col.g * rowFade;
            colArr[i * 3 + 2] = col.b * rowFade;
          }
        }
      }
      colAttr.needsUpdate = true;
    }
    this.terrainGeo.computeVertexNormals();
    this.terrain.position.z = 4 + Math.sin(performance.now() * 0.00035) * 0.15;
    const terrainMat = this.terrain.material as THREE.MeshBasicMaterial;
    terrainMat.color.setRGB(1, 1, 1);
    terrainMat.opacity = 0.72 + 0.28 * (0.5 + 0.5 * Math.sin(time * 0.7));
  }

  /**
   * Main animation loop. Called every frame with audio data and settings.
   * 
   * Responsibilities:
   * - Route to the active visualization's update method
   * - Manage camera motion (orbit, mouse, drift, beat response)
   * - Handle post-FX boost signals (bloom, glitch)
   * - Synchronize all view parameters with store settings
   * 
   * @param dt - Delta time since last frame (seconds)
   * @param time - Elapsed time since start (seconds)
   * @param audio - Current audio analysis frame (bass, mid, high, bins, BPM, etc.)
   * @param opts - All visualization and camera settings
   */
  update(dt: number, time: number, audio: AudioBands, opts: {
    sphereDisp: number;
    orbitSpeed: number;
    peakDecay: number;
    peakHold: number;
    colorBands: boolean;
    blocky: boolean;
    segments: number;
    grid: boolean;
    gridOpacity: number;
    cameraDrift: boolean;
    cameraDriftAmount: number;
    cameraBeat: boolean;
    cameraBeatAmount: number;
    cameraMouse: boolean;
    classicSpin: boolean;
    classicSpinSpeed: number;
    classicFullscreen: boolean;
    peakColor: string;
    peakStyle: "bar" | "thin" | "glow" | "none";
    rippleRingCount: number;
    rippleColumns: number;
    rippleMaxRadius: number;
    rippleSpeed: number;
    rippleAmplitude: number;
    rippleWaveCycles: number;
    rippleThickness: number;
    rippleRotationSpeed: number;
    rippleOpacity: number;
    rippleWireframe: boolean;
    datastreamUsePalette: boolean;
    datastreamAmplitude: number;
    datastreamItemCount: number;
    nebulaUsePalette: boolean;
    nebulaAmplitude: number;
    nebulaDetail: number;
    monolithUsePalette: boolean;
    monolithAmplitude: number;
    monolithGridSize: number;
    mandalaUsePalette: boolean;
    mandalaAmplitude: number;
    mandalaLineCount: number;
    mandalaLineWidth: number;
    terrainUsePalette: boolean;
    terrainAmplitude: number;
    terrainColumns: number;
    comboSphereSize: number;
    comboSphereSpinSpeed: number;
    comboSphereBassPunch: number;
    comboBarRadius: number;
    comboBarHeightScale: number;
    comboParticleSize: number;
    comboLevelMeter: boolean;
    comboFullscreen: boolean;
    rippleFullscreen: boolean;
    datastreamFullscreen: boolean;
    nebulaFullscreen: boolean;
    monolithFullscreen: boolean;
    mandalaFullscreen: boolean;
    terrainFullscreen: boolean;
    bgColor: string;
    view: ViewMode;
  }) {
    // Keep scene visibility + branch view in lockstep with React settings every frame.
    this.setView(opts.view);

    // Update background and fog colour.
    (this.scene.background as THREE.Color).set(opts.bgColor);
    (this.scene.fog as THREE.FogExp2).color.set(opts.bgColor);
    // BPM phase — one full 0→1 cycle per beat
    const bpmConfident = audio.bpm > 0 && audio.bpmConfidence > 0.45;
    const bpmPhase = bpmConfident ? (time * (audio.bpm / 60)) % 1 : 0;

    // shared kick / beat state
    // When BPM is locked: fire on the clock edge (phase wraps 1→0).
    // Fall back to raw audio.beat when BPM isn't confident yet.
    if (opts.cameraBeat) {
      if (bpmConfident) {
        if (bpmPhase < this.lastBpmPhase && this.lastBpmPhase > 0.5) this.kick = 1;
      } else if (audio.beat) {
        this.kick = 1;
      }
    }
    this.lastBpmPhase = bpmPhase;
    this.kick *= Math.exp(-dt * 4.5);
    const beat = opts.cameraBeat ? opts.cameraBeatAmount : 0;

    // mouse smoothing (always run so it works in any view)
    this.mouseYaw += (this.targetYaw - this.mouseYaw) * Math.min(1, dt * 12);
    this.mousePitch += (this.targetPitch - this.mousePitch) * Math.min(1, dt * 12);
    this.mouseZoom += (this.targetZoom - this.mouseZoom) * Math.min(1, dt * 8);

    const driftAmt = Math.max(0, Number(opts.cameraDriftAmount) || 0);
    const drift = opts.cameraDrift && driftAmt > 1e-4 ? driftAmt : 0;
    // Position drift scaled down so the lens stays near the subject; FOV still uses full `drift`.
    const driftPos = drift > 0 ? drift * 0.26 : 0;

    if (opts.view === "classic") {
      if (this.classicGrid) this.classicGrid.visible = opts.grid;
      if (this.classicGridMat) this.classicGridMat.opacity = opts.gridOpacity;
      this.updateClassic(dt, audio, opts.peakDecay, opts.peakHold, opts.colorBands, opts.blocky, opts.segments, opts.peakColor, opts.peakStyle);

      if (opts.classicFullscreen) {
        this.classicGroup.rotation.y += (0 - this.classicGroup.rotation.y) * Math.min(1, dt * 8);
        const aspect = Math.max(0.75, this.camera.aspect || 1);
        const frameWidth = 14.8;
        const frameHeight = 8.4;
        const targetFov = 18;
        const halfFov = THREE.MathUtils.degToRad(targetFov * 0.5);
        const distanceForWidth = frameWidth / (2 * Math.tan(halfFov) * aspect);
        const distanceForHeight = frameHeight / (2 * Math.tan(halfFov));
        const targetZ = Math.max(distanceForWidth, distanceForHeight);
        const follow = Math.min(1, dt * 10);
        this.camera.position.x += (0 - this.camera.position.x) * follow;
        this.camera.position.y += (3.45 - this.camera.position.y) * follow;
        this.camera.position.z += (targetZ - this.camera.position.z) * follow;
        this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 10);
        this.camera.updateProjectionMatrix();
        this.camera.lookAt(0, 3.25, 0);
        return;
      }

      // optional spin
      if (opts.classicSpin) {
        this.classicGroup.rotation.y += dt * opts.classicSpinSpeed;
      } else if (!opts.cameraMouse) {
        this.classicGroup.rotation.y += (0 - this.classicGroup.rotation.y) * Math.min(1, dt * 2);
      }

      let camX = 0, camY = 3, camZ = 11;
      if (opts.cameraMouse) {
        // orbit around classic group via mouse
        const r = this.mouseZoom + 0;
        camX = Math.sin(this.mouseYaw) * Math.cos(this.mousePitch) * r;
        camZ = Math.cos(this.mouseYaw) * Math.cos(this.mousePitch) * r;
        camY = 3 + Math.sin(this.mousePitch) * r * 0.6;
      }

      if (drift > 0) {
        // Dolly + sway (tightened vs raw drift so the camera does not leave the subject).
        const a = driftPos * 6.2;
        camX += Math.sin(time * 0.055) * a + Math.cos(time * 0.092) * a * 0.55;
        camY += Math.sin(time * 0.048) * a * 0.65 + Math.sin(time * 0.17) * a * 0.45;
        camZ += Math.cos(time * 0.062) * a * 1.1 + Math.sin(time * 0.078) * a * 0.65;
        camX += Math.sin(time * 0.31) * driftPos * 1.25;
        camZ += Math.cos(time * 0.27) * driftPos * 1.55;
        this.camera.position.set(camX, camY, camZ);
      } else {
        const follow = Math.min(1, dt * 6);
        this.camera.position.x += (camX - this.camera.position.x) * follow;
        this.camera.position.y += (camY - this.camera.position.y) * follow;
        this.camera.position.z += (camZ - this.camera.position.z) * follow;
      }

      // strong, visible beat bounce applied AFTER positioning
      const bk = this.kick * beat;
      this.camera.position.y += bk * 1.5;
      this.camera.position.z += -bk * 2.0;
      // FOV punch + gentle breathing when drift is on
      const targetFov = 55 + Math.sin(time * 0.04) * 4 * drift - bk * 8;
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 12);
      this.camera.updateProjectionMatrix();
      this.camera.lookAt(0, 2.5, 0);
      return;
    }

    if (opts.view === "ripple") {
      const ringCount = Math.max(1, Math.round(opts.rippleRingCount));
      const cols = Math.max(1, Math.min(50, Math.round(opts.rippleColumns) || 1));
      if (this.rippleCount !== ringCount || this.rippleCols !== cols) {
        this.rippleCount = ringCount;
        this.rippleCols = cols;
        this.buildRipple();
      }
      this.updateRipple(dt, time, audio, opts);

      // 2D side view lock (front-facing, no rotation)
      if (opts.rippleFullscreen) {
        const follow = Math.min(1, dt * 8);
        // Smooth rotation back to zero
        this.rippleGroup.rotation.y += (0 - this.rippleGroup.rotation.y) * Math.min(1, dt * 6);
        this.camera.position.x += (0 - this.camera.position.x) * follow;
        this.camera.position.y += (1.5 - this.camera.position.y) * follow;
        this.camera.position.z += (16 - this.camera.position.z) * follow;
        const targetFov = 52;
        this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 10);
        this.camera.updateProjectionMatrix();
        this.camera.lookAt(0, 1.5, 0);
        return;
      }

      // camera: gentle orbit + audio drive; drift layers on top of mouse orbit too
      const bk = this.kick * beat;
      if (opts.cameraMouse) {
        const r = this.mouseZoom * 0.85;
        let px = Math.sin(this.mouseYaw) * Math.cos(this.mousePitch) * r;
        let pz = Math.cos(this.mouseYaw) * Math.cos(this.mousePitch) * r;
        let py = Math.sin(this.mousePitch) * r * 0.7 + 1.5;
        if (drift > 0) {
          const a = driftPos * 2.9;
          px += Math.sin(time * 0.29) * a + Math.cos(time * 0.16) * a * 0.5;
          py += Math.sin(time * 0.24) * a * 0.65 + Math.sin(time * 0.38) * a * 0.35;
          pz += Math.cos(time * 0.27) * a * 0.9 + Math.sin(time * 0.2) * a * 0.55;
        }
        this.camera.position.set(px, py, pz);
      } else {
        this.orbitAngle += dt * (opts.orbitSpeed * 0.6 + 0.05);
        const rad = 10 + Math.sin(time * 0.3) * 0.85 * driftPos;
        this.camera.position.x = Math.sin(this.orbitAngle) * rad;
        this.camera.position.z = Math.cos(this.orbitAngle) * rad;
        this.camera.position.y = 3 + Math.sin(time * 0.4) * 0.85 * (0.35 + driftPos * 0.65);
      }
      this.camera.position.y += bk * 1.0;
      const targetFov = 55 + Math.sin(time * 0.035) * 5 * drift - bk * 6;
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 12);
      this.camera.updateProjectionMatrix();
      this.camera.lookAt(0, 0, 0);
      return;
    }

    if (opts.view === "datastream") {
      this.postFxBoost.bloom = 1;
      this.postFxBoost.glitch = 0;
      const pointCount = Math.max(500, Math.round(opts.datastreamItemCount));
      if (pointCount !== this.dataStreamCount) this.buildDataStream(pointCount);
      this.updateDataStream(time, audio, {
        datastreamAmplitude: opts.datastreamAmplitude,
        datastreamUsePalette: opts.datastreamUsePalette,
      });
      if (opts.datastreamFullscreen) {
        const follow = Math.min(1, dt * 8);
        this.camera.position.x += (0 - this.camera.position.x) * follow;
        this.camera.position.y += (16 - this.camera.position.y) * follow;
        this.camera.position.z += (0.01 - this.camera.position.z) * follow;
        this.camera.fov += (46 - this.camera.fov) * Math.min(1, dt * 10);
        this.camera.updateProjectionMatrix();
        this.camera.lookAt(0, 0, 0);
        return;
      }
      if (opts.cameraMouse) {
        const r = this.mouseZoom * 0.75;
        this.camera.position.set(
          Math.sin(this.mouseYaw) * Math.cos(this.mousePitch) * r,
          2.2 + Math.sin(this.mousePitch) * r * 0.55,
          Math.cos(this.mouseYaw) * Math.cos(this.mousePitch) * r,
        );
      } else {
        this.orbitAngle += dt * (opts.orbitSpeed * 0.8 + 0.08);
        const rad = 12;
        this.camera.position.set(Math.sin(this.orbitAngle) * rad, 4.5, Math.cos(this.orbitAngle) * rad);
      }
      this.camera.lookAt(0, 0, 0);
      return;
    }

    if (opts.view === "nebula") {
      this.postFxBoost.bloom = 1;
      this.postFxBoost.glitch = 0;
      const detail = Math.max(24, Math.round(opts.nebulaDetail));
      if (detail !== this.nebulaDetail) this.buildNebula(detail);
      this.updateNebula(dt, time, audio, {
        nebulaAmplitude: opts.nebulaAmplitude,
        nebulaUsePalette: opts.nebulaUsePalette,
      });
      if (opts.nebulaFullscreen) {
        const follow = Math.min(1, dt * 8);
        this.camera.position.x += (0 - this.camera.position.x) * follow;
        this.camera.position.y += (0 - this.camera.position.y) * follow;
        this.camera.position.z += (10 - this.camera.position.z) * follow;
        this.camera.fov += (44 - this.camera.fov) * Math.min(1, dt * 10);
        this.camera.updateProjectionMatrix();
        this.camera.lookAt(0, 0, 0);
        return;
      }
      if (opts.cameraMouse) {
        const r = this.mouseZoom * 0.72;
        this.camera.position.set(
          Math.sin(this.mouseYaw) * Math.cos(this.mousePitch) * r,
          Math.sin(this.mousePitch) * r * 0.42,
          Math.cos(this.mouseYaw) * Math.cos(this.mousePitch) * r,
        );
      } else {
        this.orbitAngle += dt * (opts.orbitSpeed * 0.7 + 0.05);
        this.camera.position.set(Math.sin(this.orbitAngle) * 8.5, Math.sin(time * 0.4) * 0.7, Math.cos(this.orbitAngle) * 8.5);
      }
      this.camera.lookAt(0, 0, 0);
      return;
    }

    if (opts.view === "monolith") {
      this.postFxBoost.bloom = 1;
      this.postFxBoost.glitch = 0;
      const gridSize = Math.max(2, Math.round(opts.monolithGridSize));
      if (gridSize !== this.monolithGrid) this.buildMonolith(gridSize);
      this.updateMonolith(dt, audio, time, {
        monolithAmplitude: opts.monolithAmplitude,
        monolithUsePalette: opts.monolithUsePalette,
      });
      if (opts.monolithFullscreen) {
        const follow = Math.min(1, dt * 8);
        this.camera.position.x += (0 - this.camera.position.x) * follow;
        this.camera.position.y += (36 - this.camera.position.y) * follow;
        this.camera.position.z += (0.01 - this.camera.position.z) * follow;
        this.camera.fov += (52 - this.camera.fov) * Math.min(1, dt * 10);
        this.camera.updateProjectionMatrix();
        this.camera.lookAt(0, 0, 0);
        return;
      }
      if (opts.cameraMouse) {
        const r = this.mouseZoom * 1.15;
        this.camera.position.set(
          Math.sin(this.mouseYaw) * Math.cos(this.mousePitch) * r,
          6 + Math.sin(this.mousePitch) * r * 0.5,
          Math.cos(this.mouseYaw) * Math.cos(this.mousePitch) * r,
        );
      } else {
        this.orbitAngle += dt * (opts.orbitSpeed * 0.5 + 0.045);
        this.camera.position.set(Math.sin(this.orbitAngle) * 24, 12, Math.cos(this.orbitAngle) * 24);
      }
      this.camera.lookAt(0, 0, 0);
      return;
    }

    if (opts.view === "mandala") {
      const lineCount = Math.max(2, Math.round(opts.mandalaLineCount));
      if (lineCount !== this.mandalaRibbonCount) this.buildMandala(lineCount);
      this.updateMandala(dt, time, audio, {
        mandalaAmplitude: opts.mandalaAmplitude,
        mandalaUsePalette: opts.mandalaUsePalette,
        mandalaLineWidth: opts.mandalaLineWidth,
      });
      if (opts.mandalaFullscreen) {
        const follow = Math.min(1, dt * 8);
        this.camera.position.x += (0 - this.camera.position.x) * follow;
        this.camera.position.y += (0 - this.camera.position.y) * follow;
        this.camera.position.z += (13 - this.camera.position.z) * follow;
        this.camera.fov += (48 - this.camera.fov) * Math.min(1, dt * 10);
        this.camera.updateProjectionMatrix();
        this.camera.lookAt(0, 0, 0);
        return;
      }
      if (opts.cameraMouse) {
        const r = this.mouseZoom * 0.86;
        this.camera.position.set(
          Math.sin(this.mouseYaw) * Math.cos(this.mousePitch) * r,
          Math.sin(this.mousePitch) * r * 0.5,
          Math.cos(this.mouseYaw) * Math.cos(this.mousePitch) * r,
        );
      } else {
        this.orbitAngle += dt * (opts.orbitSpeed * 0.85 + 0.12);
        this.camera.position.set(Math.sin(this.orbitAngle) * 10.5, Math.sin(time * 0.5) * 1.2, Math.cos(this.orbitAngle) * 10.5);
      }
      this.camera.lookAt(0, 0, 0);
      return;
    }

    if (opts.view === "terrain") {
      this.postFxBoost.bloom = 1;
      this.postFxBoost.glitch = 0;
      const cols = Math.max(16, Math.round(opts.terrainColumns));
      if (cols !== this.terrainCols) this.buildTerrain(cols);
      this.updateTerrain(audio, time, {
        terrainAmplitude: opts.terrainAmplitude,
        terrainUsePalette: opts.terrainUsePalette,
      });
      if (opts.terrainFullscreen) {
        const follow = Math.min(1, dt * 8);
        this.camera.position.x += (0 - this.camera.position.x) * follow;
        this.camera.position.y += (18 - this.camera.position.y) * follow;
        this.camera.position.z += (10 - this.camera.position.z) * follow;
        this.camera.fov += (42 - this.camera.fov) * Math.min(1, dt * 10);
        this.camera.updateProjectionMatrix();
        this.camera.lookAt(0, -1.5, 7);
        return;
      }
      if (opts.cameraMouse) {
        const r = this.mouseZoom * 0.95;
        this.camera.position.set(
          Math.sin(this.mouseYaw) * Math.cos(this.mousePitch) * r,
          7 + Math.sin(this.mousePitch) * r * 0.4,
          Math.cos(this.mouseYaw) * Math.cos(this.mousePitch) * r,
        );
      } else {
        this.orbitAngle += dt * (opts.orbitSpeed * 0.45 + 0.02);
        this.camera.position.set(Math.sin(this.orbitAngle) * 15, 7, Math.cos(this.orbitAngle) * 15);
      }
      this.camera.lookAt(0, -1.5, 7);
      return;
    }

    // bpmPhase already computed above — reused here for visual syncing
    this.postFxBoost.bloom = 1;
    this.postFxBoost.glitch = 0;

    // bars
    if (this.comboUniforms) this.comboUniforms.uBands.value = opts.comboLevelMeter ? 1 : 0;
    const bins = audio.bins;
    if (bins.length > 0) {
      const radius = opts.comboBarRadius;
      const hScale = opts.comboBarHeightScale;
      for (let i = 0; i < this.barCount; i++) {
        const idx = Math.floor((i / this.barCount) * (bins.length * 0.55));
        const v = bins[idx] / 255;
        const angle = (i / this.barCount) * Math.PI * 2;
        // BPM Syncing: Apply subtle rotation to the bar ring based on BPM phase
        const bpmRotation = audio.bpm > 0 && audio.bpmConfidence > 0.3 ? (bpmPhase * Math.PI * 2 * 0.3) : 0;
        const rotatedAngle = angle + bpmRotation;
        const h = 0.2 + Math.pow(v, 1.4) * 6 * hScale;
        this.dummy.position.set(Math.cos(rotatedAngle) * radius, 0, Math.sin(rotatedAngle) * radius);
        this.dummy.scale.set(1, h, 1);
        this.dummy.rotation.y = -rotatedAngle;
        this.dummy.updateMatrix();
        this.bars.setMatrixAt(i, this.dummy.matrix);
      }
      this.bars.instanceMatrix.needsUpdate = true;
      (this.bars.material as THREE.MeshStandardMaterial).emissiveIntensity =
        0.3 + audio.bass * 1.4;
    }

    // sphere
    this.sphereMat.uniforms.uTime.value = time;
    this.sphereMat.uniforms.uBass.value = audio.bass;
    this.sphereMat.uniforms.uMid.value = audio.mid;
    this.sphereMat.uniforms.uDisp.value = opts.sphereDisp;
    
    // BPM Syncing: Apply to sphere rotation
    // Sync sphere spin speed to BPM (faster when BPM is detected and confident)
    const bpmSpinBoost = audio.bpm > 0 && audio.bpmConfidence > 0.3 ? (1 + audio.bpmConfidence * 0.4) : 1;
    
    const s = opts.comboSphereSize * (1 + audio.bass * opts.comboSphereBassPunch);
    this.sphere.scale.setScalar(s);
    this.sphere.rotation.y += dt * opts.comboSphereSpinSpeed * bpmSpinBoost;
    this.sphere.rotation.x += dt * opts.comboSphereSpinSpeed * 0.5 * bpmSpinBoost;
    // Subtle pulsing to the BPM beat
    const bpmPulse = Math.sin(bpmPhase * Math.PI * 2) * 0.08 * (audio.bpmConfidence || 0);
    this.sphere.scale.addScalar(bpmPulse);

    // particles
    const positions = this.particleGeo.attributes.position as THREE.BufferAttribute;
    const seeds = this.particleSeeds;
    // BPM-synced energy pulse: particles are more active on BPM beats
    const bpmEnergyMod = 1 + Math.max(0, Math.sin(bpmPhase * Math.PI * 2)) * (audio.bpmConfidence || 0) * 0.6;
    const energy = (0.6 + audio.high * 1.4 + audio.mid * 0.6) * bpmEnergyMod;
    for (let i = 0; i < this.particleCount; i++) {
      const r0 = seeds[i * 3];
      const theta = seeds[i * 3 + 1] + time * 0.15 * energy * 0.2;
      const phi = seeds[i * 3 + 2];
      const r = r0 + Math.sin(time * 1.5 + i * 0.01) * 0.3 * energy;
      positions.setXYZ(
        i,
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi) + Math.sin(time * 0.7 + i) * 0.1 * energy,
        r * Math.sin(phi) * Math.sin(theta),
      );
    }
    positions.needsUpdate = true;
    this.particleMat.color.copy(this.paletteThree[2]).lerp(this.paletteThree[0], audio.centroid);
    this.particleMat.size = (0.04 + audio.high * 0.1) * opts.comboParticleSize;

    // 2D top-down lock for combo view
    if (opts.comboFullscreen) {
      const follow = Math.min(1, dt * 8);
      this.camera.position.x += (0 - this.camera.position.x) * follow;
      this.camera.position.z += (0 - this.camera.position.z) * follow;
      this.camera.position.y += (20 - this.camera.position.y) * follow;
      const targetFov = 50;
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 10);
      this.camera.updateProjectionMatrix();
      this.camera.lookAt(0, 0, 0);
      return;
    }

    // camera orbit
    this.orbitAngle += dt * (opts.cameraMouse ? 0 : opts.orbitSpeed);
    const driftR = Math.sin(time * 0.07) * 2.85 * driftPos;
    const driftY = Math.sin(time * 0.05) * 2.1 * driftPos;
    const driftAngle = Math.sin(time * 0.03) * 0.62 * driftPos;
    const driftTx = Math.sin(time * 0.08) * 0.72 * driftPos;
    const driftTy = Math.cos(time * 0.06) * 0.55 * driftPos;
    const driftTz = Math.sin(time * 0.05) * 0.48 * driftPos;

    if (opts.cameraMouse) {
      const camR = this.mouseZoom * (drift > 0 ? 0.76 : 1);
      const bx = Math.sin(this.mouseYaw) * Math.cos(this.mousePitch) * camR;
      const bz = Math.cos(this.mouseYaw) * Math.cos(this.mousePitch) * camR;
      const by = Math.sin(this.mousePitch) * camR;
      const tang = driftAngle * camR * 0.65;
      const ox =
        -Math.cos(this.mouseYaw) * tang * 0.22 +
        Math.sin(time * 0.065) * 2.35 * driftPos +
        Math.cos(time * 0.12) * driftPos * 0.55;
      const oz =
        Math.sin(this.mouseYaw) * tang * 0.22 +
        Math.cos(time * 0.055) * 2.05 * driftPos +
        Math.sin(time * 0.1) * driftPos * 0.5;
      const oy =
        driftY * 0.92 +
        Math.sin(this.mouseYaw) * driftR * 0.28 +
        Math.sin(time * 0.088) * driftPos * 0.48;
      this.camera.position.set(bx + ox, by + oy, bz + oz);
      // Fixed look at scene center when drifting so orbit + sway read as real camera motion.
      if (drift > 0) this.cameraTarget.set(0, 0, 0);
      else this.cameraTarget.set(driftTx, driftTy, driftTz);
    } else {
      const camR = 12 + driftR;
      const a = this.orbitAngle + driftAngle;
      this.camera.position.x = Math.sin(a) * camR;
      this.camera.position.z = Math.cos(a) * camR;
      this.camera.position.y = 3 + Math.sin(this.orbitAngle * 0.5) * 1.2 + driftY;
      if (drift > 0) this.cameraTarget.set(0, 0, 0);
      else this.cameraTarget.set(driftTx, driftTy, driftTz);
    }

    // strong beat bounce applied as direct camera offset (visible regardless of drift/orbit)
    const bk = this.kick * beat;
    const dirLen = Math.hypot(this.camera.position.x, this.camera.position.z) || 1;
    // pull camera inward toward target
    this.camera.position.x -= (this.camera.position.x / dirLen) * bk * 2.5;
    this.camera.position.z -= (this.camera.position.z / dirLen) * bk * 2.5;
    this.camera.position.y += bk * 1.2;

    // FOV breathing + sharp punch on beat
    const targetFov = 55 + Math.sin(time * 0.04) * 5 * drift - bk * 9;
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 12);
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.cameraTarget);
  }

  // mouse-controlled camera state
  mouseYaw = 0;
  mousePitch = 0.25;
  mouseZoom = 12;
  targetYaw = 0;
  targetPitch = 0.25;
  targetZoom = 12;

  setMouseDelta(dx: number, dy: number) {
    this.targetYaw -= dx * 0.005;
    this.targetPitch = Math.max(-1.2, Math.min(1.4, this.targetPitch + dy * 0.005));
  }
  setMouseZoomDelta(d: number) {
    this.targetZoom = Math.max(5, Math.min(28, this.targetZoom + d * 0.01));
  }



  buildRipple() {
    for (const col of this.rippleColumnData) {
      this.rippleGroup.remove(col.root);
      for (const mat of col.mats) mat.dispose();
    }
    this.rippleColumnData = [];
    this.rippleGeo?.dispose();

    // Annular tube unit ring (inner=0, outer=1, height=0 → square cross section auto)
    const inner = 0.0, outer = 1.0, half = 0.5;
    const points = [
      new THREE.Vector2(inner, -half),
      new THREE.Vector2(outer, -half),
      new THREE.Vector2(outer, half),
      new THREE.Vector2(inner, half),
      new THREE.Vector2(inner, -half),
    ];
    const geo = new THREE.LatheGeometry(points, 96);
    geo.computeVertexNormals();
    this.rippleGeo = geo;

    const C = this.rippleCols;
    const N = this.rippleCount;
    // Local X spacing between column centers (scaled by rippleGroup.scale.x).
    const gapLocal = 2.45;

    for (let c = 0; c < C; c++) {
      const root = new THREE.Group();
      root.position.x = (c - (C - 1) / 2) * gapLocal;
      const meshes: THREE.Mesh[] = [];
      const mats: THREE.MeshStandardMaterial[] = [];
      for (let i = 0; i < N; i++) {
        const mat = new THREE.MeshStandardMaterial({
          color: 0x000000,
          emissive: 0xffffff,
          emissiveIntensity: 1.4,
          metalness: 0.2,
          roughness: 0.45,
          toneMapped: false,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 1,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.frustumCulled = false;
        root.add(mesh);
        meshes.push(mesh);
        mats.push(mat);
      }
      this.rippleGroup.add(root);
      this.rippleColumnData.push({ root, meshes, mats });
    }
  }

  /** Average normalized energy (0..1) for FFT bins in slice `col` of `colCount` contiguous bands (low → high). */
  private rippleBinSliceEnergy(bins: Uint8Array, col: number, colCount: number): number {
    const n = bins.length;
    if (n === 0 || colCount <= 0) return 0;
    const end = Math.max(2, Math.floor(n * 0.95));
    const w = end / colCount;
    let a = Math.floor(col * w);
    let b = Math.floor((col + 1) * w);
    if (b <= a) b = a + 1;
    let sum = 0;
    for (let i = a; i < b; i++) sum += bins[i]!;
    return sum / (b - a) / 255;
  }

  /** Ring-index sample within one column's frequency slice. */
  private rippleRingSpectrumInSlice(bins: Uint8Array, t: number, col: number, colCount: number): number {
    const n = bins.length;
    if (n === 0) return 0;
    const end = Math.max(2, Math.floor(n * 0.95));
    const w = end / colCount;
    let a = Math.floor(col * w);
    let b = Math.floor((col + 1) * w);
    if (b <= a) b = a + 1;
    const span = b - a;
    if (span <= 1) return bins[a]! / 255;
    const rel = Math.min(span - 1, Math.floor(Math.pow(t, 1.3) * span));
    return bins[a + rel]! / 255;
  }

  private updateRipple(dt: number, _time: number, audio: AudioBands, opts: {
    rippleColumns: number;
    rippleMaxRadius: number;
    rippleSpeed: number;
    rippleAmplitude: number;
    rippleWaveCycles: number;
    rippleThickness: number;
    rippleRotationSpeed: number;
    rippleOpacity: number;
    rippleWireframe: boolean;
    rippleFullscreen: boolean;
  }) {
    const N = this.rippleCount;
    const bins = audio.bins;
    const C = Math.max(1, Math.min(50, Math.round(opts.rippleColumns) || 1));

    for (let c = 0; c < C; c++) {
      const sliceE = this.rippleBinSliceEnergy(bins, c, C);
      this.rippleSliceScratch[c] = sliceE;
      const spd = (0.14 + sliceE * 0.32) * opts.rippleSpeed * (0.88 + c * 0.06);
      this.ripplePhases[c] = (this.ripplePhases[c] + dt * spd) % 1;
    }

    const maxRadius = opts.rippleMaxRadius;
    const step = maxRadius / N;
    const yScale = step * opts.rippleThickness;
    this.rippleGroup.scale.set(step, yScale, step);

    const baseThickness = 0.08;
    const amplitude = (maxRadius * 0.32 * (baseThickness / 0.08)) / yScale * (0.8 + audio.bass * 1.3) * Math.max(0.05, opts.rippleAmplitude);
    const waveCycles = opts.rippleWaveCycles + audio.mid * 1.0;

    const colA = this.paletteThree[0];
    const colB = this.paletteThree[1];
    const colC = this.paletteThree[2];
    const _c = new THREE.Color();

    for (let c = 0; c < C; c++) {
      const sliceV = this.rippleSliceScratch[c]!;
      const col = this.rippleColumnData[c];
      if (!col) continue;
      for (let i = 0; i < N; i++) {
        const mesh = col.meshes[i];
        if (!mesh) continue;
        const t = N === 1 ? 0.5 : i / (N - 1);
        const ringSpectrum = this.rippleRingSpectrumInSlice(bins, t, c, C);
        const wavePhase = t * waveCycles * Math.PI * 2 - this.ripplePhases[c] * Math.PI * 2;
        const yWave = Math.sin(wavePhase) * amplitude * (0.58 + sliceV * 0.85 + ringSpectrum * 0.55);
        mesh.position.y = yWave;

        if (t < 0.5) _c.copy(colA).lerp(colB, t * 2);
        else _c.copy(colB).lerp(colC, (t - 0.5) * 2);
        const phaseAnim = 0.5 + 0.5 * Math.sin(wavePhase);
        const vPeak = Math.max(sliceV, ringSpectrum);
        const brightness = 0.68 + 0.68 * phaseAnim + vPeak * 0.55;
        _c.multiplyScalar(brightness);
        const mat = col.mats[i]!;
        mat.emissive.copy(_c);
        mat.emissiveIntensity = 1.15 + sliceV * 1.25 + ringSpectrum * 0.7;
        mat.opacity = opts.rippleOpacity;
        mat.transparent = opts.rippleOpacity < 1;
        if (mat.wireframe !== opts.rippleWireframe) mat.wireframe = opts.rippleWireframe;
      }
    }

    this.rippleGroup.rotation.y += dt * (opts.rippleFullscreen ? 0 : opts.rippleRotationSpeed + audio.high * 0.4 + (audio.bpm > 0 ? audio.bpmConfidence * 0.8 : 0));
  }

  resize(w: number, h: number) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    for (const ribbon of this.mandalaRibbons) {
      ribbon.material.resolution.set(w, h);
    }
  }

  dispose() {
    this.bars.geometry.dispose();
    (this.bars.material as THREE.Material).dispose();
    this.sphere.geometry.dispose();
    this.sphereMat.dispose();
    this.particleGeo.dispose();
    this.particleMat.dispose();
    this.rippleGeo?.dispose();
    for (const col of this.rippleColumnData) {
      for (const m of col.mats) m.dispose();
    }
    this.rippleColumnData = [];
    if (this.dataStreamPoints) {
      this.dataStreamPoints.geometry.dispose();
      this.dataStreamMat?.dispose();
    }
    if (this.nebula) {
      this.nebula.geometry.dispose();
      this.nebulaMat?.dispose();
    }
    if (this.monolith) {
      this.monolith.geometry.dispose();
      (this.monolith.material as THREE.Material).dispose();
    }
    for (const ribbon of this.mandalaRibbons) {
      ribbon.geometry.dispose();
      ribbon.material.dispose();
    }
    this.mandalaRibbons = [];
    if (this.terrainGeo) this.terrainGeo.dispose();
    if (this.terrain) (this.terrain.material as THREE.Material).dispose();
  }
}
