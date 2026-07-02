import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { sphereVertexShader, sphereFragmentShader } from "./shaders";
import type { AudioBands } from "./audio";
import type { SceneUpdateOpts } from "./scene-update-opts";
import { settingsStore } from "../store";
import { DEFAULT_VISUAL_ID, getVisualDefinition, VISUALS, type ViewMode } from "../visuals";
import { bipolarBand, normalizedBand } from "./loudness";

const WEBXR_REQUEST_EVENT = "spectrum-aura:webxr-request";

/** Asset-flow GLB templates; the per-build shared-model roll indexes into this. */
const ASSETFLOW_MODEL_PATHS = [
  "assets/models/kenney/model-01.glb",
  "assets/models/poly-pizza/model-02.glb",
  "assets/models/quaternius/model-03.glb",
  "assets/models/kenney/model-04.glb",
  "assets/models/poly-pizza/model-05.glb",
  "assets/models/quaternius/model-06.glb",
  "assets/models/kenney/model-07.glb",
  "assets/models/poly-pizza/model-08.glb",
  "assets/models/kenney/model-09.glb",
  "assets/models/poly-pizza/model-10.glb",
  "assets/models/quaternius/model-11.glb",
  "assets/models/kenney/model-12.glb",
];

export type Palette = [string, string, string];

export class Scene {
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  xrSceneRoot = new THREE.Group();
  xrHudGroup = new THREE.Group();
  group = new THREE.Group(); // combo group
  classicGroup = new THREE.Group(); // classic group
  dataStreamGroup = new THREE.Group();
  nebulaGroup = new THREE.Group();
  monolithGroup = new THREE.Group();
  mandalaGroup = new THREE.Group();
  terrainGroup = new THREE.Group();
  obsidianGroup = new THREE.Group();
  torusGroup = new THREE.Group();
  soundwallGroup = new THREE.Group();
  geometrynebulaGroup = new THREE.Group();
  assetflowGroup = new THREE.Group();
  private xrControllerInputs: Array<{
    controller: THREE.Object3D;
    handedness: XRHandedness | "";
    gamepad: Gamepad | null;
    squeezePressed: boolean;
  }> = [];
  private xrSessionActive = false;
  private xrSceneOffset = new THREE.Vector3(0, 0, 0);
  private xrSceneTargetOffset = new THREE.Vector3(0, 0, 0);
  private xrSceneYaw = 0;
  private xrScenePitch = 0;
  private xrExitHoldSeconds = 0;
  private xrExitTriggered = false;
  private xrHudCanvas?: HTMLCanvasElement;
  private xrHudContext?: CanvasRenderingContext2D | null;
  private xrHudTexture?: THREE.CanvasTexture;
  private xrHudPanel?: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private xrHudPage: "controls" | "status" = "controls";
  private xrHudNeedsRedraw = true;
  private xrHudLastDrawAt = 0;
  private xrHudViewLabel = "combo";
  private xrHudBackgroundNote = "Quest Browser passthrough unsupported in immersive-vr";
  private xrHudTempo = 0;
  private xrHudTempoConfidence = 0;
  private xrHudBands = { bass: 0, mid: 0, high: 0 };
  private readonly xrThumbstickBaseAxis = 2;
  private readonly xrControllerDeadzone = 0.14;
  private readonly xrPositionInterpolationSpeed = 7;
  private readonly xrRotationInterpolationSpeed = 8;

  bars!: THREE.InstancedMesh;
  private barCount = 0;
  private dummy = new THREE.Object3D();
  private tmpColor = new THREE.Color();
  private torusAccentScratch = new THREE.Color();
  private rippleColorScratch = new THREE.Color();
  private lastSceneBgColor = "";
  private white = new THREE.Color(1, 1, 1);
  private dsColorA = new THREE.Color("#7fd9ff");
  private dsColorB = new THREE.Color("#d4ffff");
  private terrainColorA = new THREE.Color("#9ed8ff");
  private terrainColorB = new THREE.Color("#dcf2ff");
  private monolithMonoColor = new THREE.Color("#9fc4ff");

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

  // obsidian shard view
  private obsidianShards: Array<{
    mesh: THREE.Mesh;
    mat: THREE.MeshStandardMaterial;
    basePos: THREE.Vector3;
    axis: THREE.Vector3;
    rotSpeed: number;
  }> = [];
  private obsidianFloor?: THREE.Mesh;
  private obsidianCore?: THREE.PointLight;
  private obsidianDetail = 1;

  // torus particle accelerator view
  private torusMesh?: THREE.Mesh;
  private torusMat?: THREE.MeshPhysicalMaterial;
  private torusParticles?: THREE.Points;
  private torusParticleMat?: THREE.PointsMaterial;
  private torusParticleGeo?: THREE.BufferGeometry;
  private torusParticleAngles?: Float32Array;
  private torusParticleMinor?: Float32Array;
  private torusParticleCount = 5000;
  private torusParticleColors?: Float32Array;
  private torusCells: Array<{
    root: THREE.Group;
    mesh: THREE.Mesh;
    particles: THREE.Points;
    meshMat: THREE.MeshPhysicalMaterial;
    particleMat: THREE.PointsMaterial;
  }> = [];
  private torusCount = 1;
  private torusSpacing = 11.4;
  private torusSize = 1;
  private torusOddUpright = false;
  private torusColorMode: "shared" | "individual" = "individual";
  private torusRotationMode: "flat" | "odd-upright" | "alternating-x" | "alternating-z" | "fan" =
    "odd-upright";

  // sound wall view
  private soundwallPillars?: THREE.InstancedMesh;
  private soundwallMat?: THREE.MeshStandardMaterial;
  private soundwallHistory?: Float32Array;
  private soundwallCols = 20;
  private soundwallRows = 12;
  private soundwallStrobeLight?: THREE.PointLight;

  // floating geometry nebula view
  private geoNebulaMeshes: Array<{
    mesh: THREE.Mesh;
    freqBin: number;
    basePos: THREE.Vector3;
    rotAxis: THREE.Vector3;
    rotSpeed: number;
    baseScale: number;
    mat: THREE.MeshStandardMaterial;
  }> = [];
  private geoNebulaFloor?: THREE.Mesh;
  private geoNebulaCoreLight?: THREE.PointLight;
  private geoNebulaCount = 60;
  private geoNebulaSpread = 1.6;

  // assetflow view (3D models + 2D animated sprites)
  private assetflowActors: Array<{
    root: THREE.Group;
    basePos: THREE.Vector3;
    angle: number;
    pathMode: "orbit" | "figure8" | "lissajous" | "spiral";
    pathPhase: number;
    pathSpeed: number;
    spinAxis: THREE.Vector3;
    baseScale: number;
    bin: number;
    placeholder: THREE.Mesh;
    model?: THREE.Object3D;
  }> = [];
  private assetflowSprites: Array<{
    sprite: THREE.Sprite;
    phase: number;
    radius: number;
    speed: number;
    bin: number;
    baseY: number;
  }> = [];
  private assetflowTextures: THREE.Texture[] = [];
  private assetflowBaseDisk?: THREE.Mesh;
  private assetflowLight?: THREE.PointLight;
  private assetflowAssetsRequested = false;
  private assetflowBuildToken = 0;
  /** Which model template all actors share this build — re-rolled per build. */
  private assetflowModelChoice = 0;
  private assetflowModelScale = 1;
  private assetflowModelTemplates: Array<THREE.Object3D | undefined> = [];

  // rez tube view
  reztubeGroup = new THREE.Group();
  private reztubeLine?: LineSegments2;
  private reztubeMat?: LineMaterial;
  private reztubeGeo?: LineSegmentsGeometry;
  private reztubePos?: Float32Array;
  private reztubeCol?: Float32Array;
  private reztubeCoreLight?: THREE.PointLight;
  private reztubeScroll = 0;
  private reztubePrevSegs = 0;
  private reztubeFlash = 0;
  private reztubeRingX?: Float32Array;
  private reztubeRingY?: Float32Array;
  private reztubeRingZ?: Float32Array;
  private readonly TUBE_RINGS = 60;
  private readonly RING_SPACING = 2.5;

  postFxBoost = { bloom: 1, glitch: 0 };

  view: ViewMode = "combo";

  private palette: Palette = ["#ff2d95", "#7a5cff", "#00e5ff"];
  private paletteThree: [THREE.Color, THREE.Color, THREE.Color];

  cameraTarget = new THREE.Vector3();
  private orbitAngle = 0;
  private kick = 0;
  private lastKickTime = -999;
  private lastBpmPhase = 0;

  constructor(width: number, height: number) {
    this.scene.background = new THREE.Color("#05060a");
    this.scene.fog = new THREE.FogExp2(0x05060a, 0.025);

    this.camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 200);
    this.camera.position.set(0, 3, 12);

    this.xrSceneRoot.add(this.group);
    this.xrSceneRoot.add(this.classicGroup);
    this.xrSceneRoot.add(this.rippleGroup);
    this.xrSceneRoot.add(this.dataStreamGroup);
    this.xrSceneRoot.add(this.nebulaGroup);
    this.xrSceneRoot.add(this.monolithGroup);
    this.xrSceneRoot.add(this.mandalaGroup);
    this.xrSceneRoot.add(this.terrainGroup);
    this.xrSceneRoot.add(this.obsidianGroup);
    this.xrSceneRoot.add(this.torusGroup);
    this.xrSceneRoot.add(this.soundwallGroup);
    this.xrSceneRoot.add(this.geometrynebulaGroup);
    this.xrSceneRoot.add(this.reztubeGroup);
    this.xrSceneRoot.add(this.assetflowGroup);
    this.scene.add(this.xrSceneRoot);
    this.buildXrHud();
    this.scene.add(this.xrHudGroup);
    this.classicGroup.visible = false;
    this.rippleGroup.visible = false;
    this.dataStreamGroup.visible = false;
    this.nebulaGroup.visible = false;
    this.monolithGroup.visible = false;
    this.mandalaGroup.visible = false;
    this.terrainGroup.visible = false;
    this.obsidianGroup.visible = false;
    this.torusGroup.visible = false;
    this.soundwallGroup.visible = false;
    this.geometrynebulaGroup.visible = false;
    this.reztubeGroup.visible = false;
    this.assetflowGroup.visible = false;

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
    this.buildObsidian();
    this.buildTorus();
    this.buildSoundwall();
    this.buildGeoNebula();
    this.buildReztube();
    this.buildAssetflow();

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
    const nextView = this.getSceneObjectForView(view) ? view : DEFAULT_VISUAL_ID;
    if (this.view === nextView) return;
    this.view = nextView;
    for (const visual of VISUALS) {
      const object = this.getSceneObjectForView(visual.id);
      if (object) object.visible = visual.id === nextView;
    }
  }

  private getSceneObjectForView(view: string) {
    const visual = getVisualDefinition(view);
    if (!visual?.sceneGroupKey) return null;
    const object = (this as unknown as Record<string, unknown>)[visual.sceneGroupKey];
    return object instanceof THREE.Object3D ? object : null;
  }

  setPalette(p: Palette) {
    if (p[0] === this.palette[0] && p[1] === this.palette[1] && p[2] === this.palette[2]) return;
    this.palette = p;
    this.paletteThree[0].set(p[0]);
    this.paletteThree[1].set(p[1]);
    this.paletteThree[2].set(p[2]);
    this.sphereMat.uniforms.uColorA.value.copy(this.paletteThree[0]);
    this.sphereMat.uniforms.uColorB.value.copy(this.paletteThree[1]);
    this.sphereMat.uniforms.uColorC.value.copy(this.paletteThree[2]);
    this.refreshTorusColors();
    // refresh combo bar colors
    if (this.bars?.instanceColor) {
      const arr = this.bars.instanceColor.array as Float32Array;
      for (let i = 0; i < this.barCount; i++) {
        const c = this.colorAt(i / this.barCount);
        arr[i * 3] = c.r;
        arr[i * 3 + 1] = c.g;
        arr[i * 3 + 2] = c.b;
      }
      this.bars.instanceColor.needsUpdate = true;
    }
    // refresh classic bar colors
    if (this.classicBars?.instanceColor) {
      const arr = this.classicBars.instanceColor.array as Float32Array;
      for (let i = 0; i < this.classicCount; i++) {
        const c = this.colorAt(i / this.classicCount);
        arr[i * 3] = c.r;
        arr[i * 3 + 1] = c.g;
        arr[i * 3 + 2] = c.b;
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

  private refreshTorusColors() {
    if (this.torusCells.length === 0) return;
    const count = this.torusCells.length;
    for (let i = 0; i < count; i++) {
      const cell = this.torusCells[i]!;
      if (this.torusColorMode === "individual") {
        const t = count <= 1 ? 0 : i / (count - 1);
        const body = this.colorAtInto(t, this.tmpColor);
        const accent = this.colorAtInto(Math.min(1, t + 0.18), this.torusAccentScratch);
        cell.meshMat.color.copy(body).multiplyScalar(0.9);
        cell.meshMat.emissive.copy(body).lerp(this.paletteThree[2], 0.2);
        cell.particleMat.color.copy(accent);
      } else {
        cell.meshMat.color.copy(this.paletteThree[1]);
        cell.meshMat.emissive.copy(this.paletteThree[2]);
        cell.particleMat.color.copy(this.paletteThree[0]);
      }
      cell.meshMat.needsUpdate = true;
      cell.particleMat.needsUpdate = true;
    }
  }

  private disposeTorusCells() {
    for (const cell of this.torusCells) {
      this.torusGroup.remove(cell.root);
      cell.meshMat.dispose();
      cell.particleMat.dispose();
    }
    this.torusCells = [];
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
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
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
      shader.fragmentShader =
        fragHead +
        shader.fragmentShader
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
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
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
      peakColors[i * 3] = 1;
      peakColors[i * 3 + 1] = 1;
      peakColors[i * 3 + 2] = 1;
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
      shader.fragmentShader =
        fragHead +
        shader.fragmentShader
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
    const col = this.tmpColor.set(peakColor);
    peakMat.color.copy(col);
    peakMat.emissive.copy(col);
    if (peakStyle === "glow") {
      peakMat.emissiveIntensity = 3.5;
      peakMat.opacity = 1;
      peakMat.transparent = false;
    } else if (peakStyle === "thin") {
      peakMat.emissiveIntensity = 1.0;
      peakMat.opacity = 0.85;
      peakMat.transparent = true;
    } else {
      peakMat.emissiveIntensity = 1.4;
      peakMat.opacity = 1;
      peakMat.transparent = false;
    }
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
      const target = normalizedBand(v);
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

  private colorAtInto(t: number, out: THREE.Color): THREE.Color {
    const [a, b, c] = this.paletteThree;
    if (t < 0.5) return out.copy(a).lerp(b, t * 2);
    return out.copy(b).lerp(c, (t - 0.5) * 2);
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
        "varying vec3 vPointColor;\nattribute vec3 color;",
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
    if (
      !this.dataStreamPoints ||
      !this.dataStreamPositions ||
      !this.dataStreamBasePos ||
      !this.dataStreamMat
    )
      return;
    const bins = audio.bins;
    const activeBinCount = Math.max(1, Math.floor(bins.length * 0.7));
    const arr = this.dataStreamPositions;
    const base = this.dataStreamBasePos;
    const colArr = this.dataStreamColors;
    const n = this.dataStreamCount;
    const bass = Math.max(0, Math.min(1, audio.bass));
    const high = Math.max(0, Math.min(1, audio.high));
    const amp = Math.max(0.05, opts.datastreamAmplitude);
    const size = (2.4 + bass * 12) * Math.max(0.1, amp);
    this.dataStreamMat.uniforms.uSize.value = size;
    for (let i = 0; i < n; i++) {
      const freqT = n <= 1 ? 0 : i / (n - 1);
      const idx = Math.floor(freqT * activeBinCount);
      const v = bins[idx] ? bins[idx]! / 255 : 0;
      const shimmer = Math.sin(time * 3.2 + i * 0.013) * 0.25;
      arr[i * 3] = base[i * 3] + Math.sin(time * 0.8 + i * 0.021) * 0.06 * high;
      arr[i * 3 + 1] = (normalizedBand(v) * 3.8 + shimmer) * (0.35 + high * 1.4) * amp;
      arr[i * 3 + 2] = base[i * 3 + 2] + bipolarBand(v) * 1.4 * high * amp;
      if (colArr) {
        if (opts.datastreamUsePalette) {
          const c = this.colorAtInto(freqT, this.tmpColor).lerp(
            this.white,
            0.02 + v * 0.08 + bass * 0.03,
          );
          colArr[i * 3] = c.r;
          colArr[i * 3 + 1] = c.g;
          colArr[i * 3 + 2] = c.b;
        } else {
          const c = this.tmpColor.copy(this.dsColorA).lerp(this.dsColorB, v);
          colArr[i * 3] = c.r;
          colArr[i * 3 + 1] = c.g;
          colArr[i * 3 + 2] = c.b;
        }
      }
    }
    (this.dataStreamPoints.geometry.attributes.position as THREE.BufferAttribute).needsUpdate =
      true;
    if (colArr)
      (this.dataStreamPoints.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
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
          vec3 n = normalize(vNormalW);
          float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 2.4);
          float pulse = 0.5 + 0.5 * sin(uTime * (0.8 + uAvgFrequency * 2.0) + vWorldPos.y * 0.7);
          float lat = clamp(n.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 base = mix(uColorA, uColorB, smoothstep(0.0, 0.5, lat));
          base = mix(base, uColorC, smoothstep(0.5, 1.0, lat));
          vec3 inner = mix(base, mix(uColorA, uColorB, pulse), 0.35);
          vec3 aura = mix(base, uColorC, fresnel);
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
    opts: { nebulaAmplitude: number; nebulaUsePalette: boolean; nebulaWireframe: boolean },
  ) {
    if (!this.nebula || !this.nebulaMat) return;
    const amp = Math.max(0.05, opts.nebulaAmplitude);
    const avgFrequency = normalizedBand((audio.bass + audio.mid + audio.high) / 3);
    this.nebula.rotation.y += dt * (0.08 + avgFrequency * 0.4) * (0.4 + amp * 0.6);
    this.nebula.rotation.x += dt * 0.04 * (0.4 + amp * 0.6);
    this.nebulaMat.uniforms.uTime.value = time;
    this.nebulaMat.uniforms.uAvgFrequency.value = avgFrequency * amp;
    if (opts.nebulaUsePalette) {
      this.nebulaMat.uniforms.uColorA.value.copy(this.paletteThree[0]);
      this.nebulaMat.uniforms.uColorB.value.copy(this.paletteThree[1]);
      this.nebulaMat.uniforms.uColorC.value.copy(this.paletteThree[2]);
    } else {
      this.nebulaMat.uniforms.uColorA.value.set("#ffffff");
      this.nebulaMat.uniforms.uColorB.value.set("#8aa4ff");
      this.nebulaMat.uniforms.uColorC.value.set("#4fd1ff");
    }
    this.nebulaMat.wireframe = opts.nebulaWireframe;
  }

  buildMonolith(gridSize: number = this.monolithGrid) {
    if (this.monolith) {
      this.monolithGroup.remove(this.monolith);
      this.monolith.geometry.dispose();
      (this.monolith.material as THREE.Material).dispose();
    }
    if (this.monolithSpot) this.monolithGroup.remove(this.monolithSpot);
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
      emissiveIntensity: 0.18,
      metalness: 0.45,
      roughness: 0.4,
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
    this.monolithSpot = new THREE.SpotLight(
      this.paletteThree[0].clone(),
      2.8,
      50,
      Math.PI / 7,
      0.35,
      1.2,
    );
    this.monolithSpot.position.set(0, 15, 0);
    this.monolithSpot.target.position.set(0, 0, 0);
    this.monolithGroup.add(this.monolithSpot, this.monolithSpot.target);
  }

  private updateMonolith(
    dt: number,
    audio: AudioBands,
    _time: number,
    opts: {
      monolithAmplitude: number;
      monolithBrightness: number;
      monolithUsePalette: boolean;
      monolithWireframe: boolean;
    },
  ) {
    const amp = Math.max(0.05, opts.monolithAmplitude);
    const brightness = Math.max(0.2, Math.min(3, opts.monolithBrightness));
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
        const target = 0.2 + normalizedBand(bin / 255) * 15 * amp;
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
            const paletteT = Math.min(1, Math.max(0, freqT * 0.8 + signal * 0.35));
            const c = this.colorAtInto(paletteT, this.tmpColor).lerp(
              this.white,
              Math.min(1, 0.16 + signal * 0.38 + (brightness - 1) * 0.24),
            );
            colors[i * 3] = c.r;
            colors[i * 3 + 1] = c.g;
            colors[i * 3 + 2] = c.b;
          } else {
            colors[i * 3] = 0.78;
            colors[i * 3 + 1] = 0.86;
            colors[i * 3 + 2] = 1.0;
          }
        }

        this.dummy.position.set((x - (size - 1) / 2) * spacing, 0, (z - (size - 1) / 2) * spacing);
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
    this.monolithSpot.target.position.x +=
      (tx - this.monolithSpot.target.position.x) * Math.min(1, dt * 5);
    this.monolithSpot.target.position.z +=
      (tz - this.monolithSpot.target.position.z) * Math.min(1, dt * 5);

    const mat = this.monolith.material as THREE.MeshStandardMaterial;
    mat.color.setRGB(1, 1, 1);
    mat.wireframe = opts.monolithWireframe;
    if (opts.monolithUsePalette) {
      mat.emissive.copy(this.paletteThree[1]).lerp(this.paletteThree[2], 0.45 + audio.high * 0.4);
      mat.metalness = 0.22;
      mat.roughness = 0.32;
    } else {
      mat.emissive.copy(this.monolithMonoColor);
      mat.metalness = 0.45;
      mat.roughness = 0.4;
    }
    mat.emissiveIntensity =
      (opts.monolithUsePalette ? 1.3 + audio.high * 1.1 : 0.5 + audio.high * 1.2) * brightness;
    this.monolithSpot.intensity =
      (opts.monolithUsePalette ? 5.4 + audio.bass * 7.2 : 3.2 + audio.bass * 5.6) * brightness;
    if (opts.monolithUsePalette) {
      this.monolithSpot.color
        .copy(this.colorAtInto(peakFreqT, this.tmpColor))
        .lerp(this.white, 0.32);
    } else {
      this.monolithSpot.color.set("#ffffff");
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
        const radius = 1.3 + t * 5.3 + normalizedBand(v) * 1.8 * amp;
        const angle = (i / R) * Math.PI * 2 + Math.sin(time * 0.7 + p * 0.3) * 0.08;
        r.points[p]!.set(
          Math.cos(angle) * radius,
          (t - 0.5) * 1.5 + bipolarBand(v) * 1.4 * amp,
          Math.sin(angle) * radius,
        );
      }
      const sampled = r.curve.getPoints(r.positions.length / 3 - 1);
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
        mat.color
          .copy(this.colorAtInto((i / R + time * 0.03) % 1, this.tmpColor))
          .lerp(this.white, Math.min(0.06, audio.high * 0.06));
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
    opts: { terrainAmplitude: number; terrainUsePalette: boolean; terrainWireframe: boolean },
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
      this.terrainHistory[c] = normalizedBand(v) * 3.6 * amp;
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
            const col = this.colorAtInto(freqT, this.tmpColor).lerp(this.white, heightNorm * 0.22);
            colArr[i * 3] = col.r * rowFade;
            colArr[i * 3 + 1] = col.g * rowFade;
            colArr[i * 3 + 2] = col.b * rowFade;
          } else {
            const col = this.tmpColor
              .copy(this.terrainColorA)
              .lerp(this.terrainColorB, heightNorm * 0.45);
            colArr[i * 3] = col.r * rowFade;
            colArr[i * 3 + 1] = col.g * rowFade;
            colArr[i * 3 + 2] = col.b * rowFade;
          }
        }
      }
      colAttr.needsUpdate = true;
    }
    // Terrain uses MeshBasicMaterial, so normal recomputation is unnecessary per frame.
    this.terrain.position.z = 4 + Math.sin(performance.now() * 0.00035) * 0.15;
    const terrainMat = this.terrain.material as THREE.MeshBasicMaterial;
    terrainMat.color.setRGB(1, 1, 1);
    terrainMat.opacity = 0.72 + 0.28 * (0.5 + 0.5 * Math.sin(time * 0.7));
    terrainMat.wireframe = opts.terrainWireframe;
  }

  // ─── Obsidian Shard ────────────────────────────────────────────────────────

  buildObsidian(detail: number = this.obsidianDetail) {
    // dispose previous
    for (const s of this.obsidianShards) {
      this.obsidianGroup.remove(s.mesh);
      s.mesh.geometry.dispose();
      s.mat.dispose();
    }
    this.obsidianShards = [];
    if (this.obsidianFloor) {
      this.obsidianGroup.remove(this.obsidianFloor);
      this.obsidianFloor.geometry.dispose();
      (this.obsidianFloor.material as THREE.Material).dispose();
    }
    if (this.obsidianCore) {
      this.obsidianGroup.remove(this.obsidianCore);
    }
    this.obsidianDetail = Math.max(0, Math.min(3, detail));

    // Build individual shard faces from an icosahedron
    const icoGeo = new THREE.IcosahedronGeometry(1.8, this.obsidianDetail);
    const posAttr = icoGeo.getAttribute("position") as THREE.BufferAttribute;
    const triCount = posAttr.count / 3;
    for (let t = 0; t < triCount; t++) {
      const va = new THREE.Vector3().fromBufferAttribute(posAttr, t * 3);
      const vb = new THREE.Vector3().fromBufferAttribute(posAttr, t * 3 + 1);
      const vc = new THREE.Vector3().fromBufferAttribute(posAttr, t * 3 + 2);
      const center = new THREE.Vector3().add(va).add(vb).add(vc).divideScalar(3);
      // Create a small shard face geometry from these 3 verts
      const geo = new THREE.BufferGeometry();
      const verts = new Float32Array(9);
      verts[0] = va.x;
      verts[1] = va.y;
      verts[2] = va.z;
      verts[3] = vb.x;
      verts[4] = vb.y;
      verts[5] = vb.z;
      verts[6] = vc.x;
      verts[7] = vc.y;
      verts[8] = vc.z;
      geo.setAttribute("position", new THREE.BufferAttribute(verts, 3));
      geo.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({
        color: 0x050510,
        metalness: 1.0,
        roughness: 0.0,
        emissive: this.paletteThree[0].clone(),
        emissiveIntensity: 0.4,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      this.obsidianGroup.add(mesh);
      const axis = center
        .clone()
        .normalize()
        .cross(new THREE.Vector3(0, 1, 0.3))
        .normalize();
      if (axis.lengthSq() < 0.0001) axis.set(0, 1, 0);
      this.obsidianShards.push({
        mesh,
        mat,
        basePos: center.clone(),
        axis,
        rotSpeed: 0.3 + Math.random() * 1.8,
      });
    }
    icoGeo.dispose();

    // Mirrored floor plane
    const floorGeo = new THREE.PlaneGeometry(30, 30);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x000000,
      metalness: 1.0,
      roughness: 0.05,
      envMapIntensity: 1.0,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -3.2;
    this.obsidianFloor = floor;
    this.obsidianGroup.add(floor);

    // Core point light (triggers bloom "lens flare")
    const core = new THREE.PointLight(0xffffff, 0, 20);
    core.position.set(0, 0, 0);
    this.obsidianCore = core;
    this.obsidianGroup.add(core);
  }

  private updateObsidian(
    dt: number,
    _time: number,
    audio: AudioBands,
    opts: { obsidianAmplitude: number; obsidianUsePalette: boolean },
  ) {
    if (this.obsidianShards.length === 0) return;
    const amp = Math.max(0.05, opts.obsidianAmplitude);
    const bass = Math.max(0, Math.min(1, audio.bass));
    const high = Math.max(0, Math.min(1, audio.high));
    const mid = Math.max(0, Math.min(1, audio.mid));
    const bassShaped = normalizedBand(bass);
    const bins = audio.bins;
    const n = this.obsidianShards.length;

    // Explosion distance driven by sub-bass
    const explodeDist = bassShaped * 3.0 * amp;

    // Core brightness — peaks on transient (beat)
    const peakFlare = audio.beat ? 1 : 0;
    if (this.obsidianCore) {
      const targetIntensity = (1.5 + bassShaped * 8 + peakFlare * 12) * amp;
      this.obsidianCore.intensity +=
        (targetIntensity - this.obsidianCore.intensity) * Math.min(1, dt * 10);
      this.obsidianCore.color.copy(
        opts.obsidianUsePalette ? this.paletteThree[1] : this.tmpColor.set(0xffffff),
      );
    }

    for (let i = 0; i < n; i++) {
      const s = this.obsidianShards[i]!;
      // frequency bin for this shard
      const freqT = n <= 1 ? 0 : i / (n - 1);
      const binIdx = Math.floor(freqT * Math.max(1, Math.floor(bins.length * 0.75)));
      const binVal = normalizedBand((bins[binIdx] ?? 0) / 255);

      // Explode outward
      const dir = s.basePos.clone().normalize();
      const targetPos = s.basePos.clone().add(dir.multiplyScalar(explodeDist + binVal * 1.2 * amp));
      s.mesh.position.lerp(targetPos, Math.min(1, dt * 8));

      // Rotation speed locked to high-end
      const spinSpeed = s.rotSpeed * (0.4 + high * 2.5 + binVal * 1.5);
      s.mesh.rotateOnWorldAxis(s.axis, dt * spinSpeed);

      // Material — deep obsidian with palette-tinted emissive edge glow
      if (opts.obsidianUsePalette) {
        const c = this.colorAtInto(freqT, this.tmpColor);
        s.mat.emissive.copy(c).lerp(this.white, 0.1 + bassShaped * 0.15);
        s.mat.emissiveIntensity = (0.3 + binVal * 1.6 + bassShaped * 0.8) * amp;
      } else {
        s.mat.emissive.set(0x3a3aaa);
        s.mat.emissiveIntensity = 0.2 + binVal * 0.8;
      }
    }

    // Subtle floor pulse
    if (this.obsidianFloor) {
      const floorMat = this.obsidianFloor.material as THREE.MeshStandardMaterial;
      floorMat.roughness = Math.max(0.02, 0.15 - bass * 0.13);
      if (opts.obsidianUsePalette) {
        floorMat.emissive.copy(this.paletteThree[0]).multiplyScalar(bassShaped * 0.3 * amp);
      }
    }

    // Boost bloom on peaks
    this.postFxBoost.bloom = 1 + bass * 1.2 + mid * 0.4;
    this.postFxBoost.glitch = 0;
  }

  // ─── Hyper-Torus Particle Accelerator ───────────────────────────────────────

  buildTorus(particleCount: number = this.torusParticleCount) {
    this.disposeTorusCells();

    // Dispose previous
    if (this.torusMesh) {
      this.torusMesh.geometry.dispose();
      this.torusMat?.dispose();
      this.torusMesh = undefined;
      this.torusMat = undefined;
    }
    if (this.torusParticles) {
      this.torusParticleGeo?.dispose();
      this.torusParticleMat?.dispose();
      this.torusParticles = undefined;
      this.torusParticleGeo = undefined;
      this.torusParticleMat = undefined;
    }
    this.torusParticleCount = Math.max(200, particleCount);

    // Glass torus shell
    const torusGeo = new THREE.TorusGeometry(4.5, 1.2, 48, 128);
    const torusMat = new THREE.MeshPhysicalMaterial({
      color: 0xaaddff,
      transparent: true,
      opacity: 0.18,
      metalness: 0.0,
      roughness: 0.0,
      transmission: 0.92,
      thickness: 1.2,
      side: THREE.DoubleSide,
    });
    this.torusMat = torusMat;
    this.torusMesh = new THREE.Mesh(torusGeo, torusMat);
    this.torusMesh.rotation.x = Math.PI / 2;
    this.torusMesh.visible = false;

    // Particles orbiting inside the torus tube
    const count = this.torusParticleCount;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const angles = new Float32Array(count); // major angle (around ring)
    const minors = new Float32Array(count); // minor angle (inside tube)
    for (let i = 0; i < count; i++) {
      angles[i] = Math.random() * Math.PI * 2;
      minors[i] = Math.random() * Math.PI * 2;
      const r = 0.5 + Math.random() * 0.5; // radius within tube (0-1 normalized)
      const major = angles[i]!;
      const minor = minors[i]!;
      const R = 4.5,
        tube = 1.1 * r;
      positions[i * 3] = (R + tube * Math.cos(minor)) * Math.cos(major);
      positions[i * 3 + 1] = tube * Math.sin(minor);
      positions[i * 3 + 2] = (R + tube * Math.cos(minor)) * Math.sin(major);
      const freqT = i / count;
      const c = this.colorAt(freqT);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    this.torusParticleAngles = angles;
    this.torusParticleMinor = minors;
    this.torusParticleColors = colors;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.06,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.torusParticleGeo = geo;
    this.torusParticleMat = mat;
    this.torusParticles = new THREE.Points(geo, mat);
    this.syncTorusLayout(
      this.torusCount,
      this.torusOddUpright,
      this.torusSpacing,
      this.torusSize,
      this.torusRotationMode,
      this.torusColorMode,
    );
  }

  private syncTorusLayout(
    rawCount: number,
    oddUpright: boolean,
    spacing: number,
    size: number,
    rotationMode: "flat" | "odd-upright" | "alternating-x" | "alternating-z" | "fan",
    colorMode: "shared" | "individual",
  ) {
    const count = Math.max(1, Math.min(5, Math.round(rawCount)));
    this.torusCount = count;
    this.torusOddUpright = oddUpright;
    this.torusSpacing = Math.max(6, Math.min(24, spacing));
    this.torusSize = Math.max(0.5, Math.min(1.8, size));
    this.torusRotationMode = rotationMode;
    this.torusColorMode = colorMode;
    if (!this.torusMesh || !this.torusParticles) return;

    this.disposeTorusCells();

    while (this.torusCells.length < count) {
      const root = new THREE.Group();
      const meshMat = this.torusMat!.clone();
      const particleMat = this.torusParticleMat!.clone();
      const mesh = new THREE.Mesh(this.torusMesh.geometry, meshMat);
      const particles = new THREE.Points(this.torusParticleGeo!, particleMat);
      mesh.rotation.x = this.torusMesh.rotation.x;
      mesh.visible = false;
      root.add(mesh);
      root.add(particles);
      this.torusGroup.add(root);
      this.torusCells.push({ root, mesh, particles, meshMat, particleMat });
    }

    const center = (count - 1) / 2;
    for (let i = 0; i < this.torusCells.length; i++) {
      const cell = this.torusCells[i]!;
      cell.root.position.set((i - center) * this.torusSpacing, 0, 0);
      cell.root.scale.setScalar(this.torusSize);
      const odd = i % 2 === 1;
      switch (rotationMode) {
        case "flat":
          cell.root.rotation.set(0, 0, 0);
          break;
        case "odd-upright":
          cell.root.rotation.set(0, 0, odd ? Math.PI / 2 : 0);
          break;
        case "alternating-x":
          cell.root.rotation.set(odd ? Math.PI / 2 : 0, 0, 0);
          break;
        case "alternating-z":
          cell.root.rotation.set(0, 0, odd ? Math.PI / 2 : -Math.PI / 2);
          break;
        case "fan":
          cell.root.rotation.set(odd ? Math.PI / 3 : 0, i * 0.18, odd ? Math.PI / 4 : 0);
          break;
      }
    }

    this.refreshTorusColors();
  }

  private updateTorus(
    dt: number,
    _time: number,
    audio: AudioBands,
    opts: {
      torusAmplitude: number;
      torusUsePalette: boolean;
      torusParticleCount: number;
      torusSpeed: number;
      torusCount: number;
      torusSpacing: number;
      torusSize: number;
      torusParticleSize: number;
      torusColorMode: "shared" | "individual";
      torusRotationMode: "flat" | "odd-upright" | "alternating-x" | "alternating-z" | "fan";
      torusOddUpright: boolean;
      torusFullscreen: boolean;
    },
  ) {
    if (
      !this.torusMesh ||
      !this.torusParticles ||
      !this.torusParticleAngles ||
      !this.torusParticleMinor
    )
      return;
    const amp = Math.max(0.05, opts.torusAmplitude);
    const bass = Math.max(0, Math.min(1, audio.bass));
    const mid = Math.max(0, Math.min(1, audio.mid));
    const high = Math.max(0, Math.min(1, audio.high));
    const bins = audio.bins;

    // Rebuild if particle count changed
    if (opts.torusParticleCount !== this.torusParticleCount) {
      this.buildTorus(opts.torusParticleCount);
      return;
    }
    const rotationMode = opts.torusFullscreen ? "flat" : opts.torusRotationMode;
    if (
      opts.torusCount !== this.torusCount ||
      opts.torusOddUpright !== this.torusOddUpright ||
      opts.torusSpacing !== this.torusSpacing ||
      opts.torusSize !== this.torusSize ||
      opts.torusColorMode !== this.torusColorMode ||
      rotationMode !== this.torusRotationMode
    ) {
      this.syncTorusLayout(
        opts.torusCount,
        opts.torusOddUpright,
        opts.torusSpacing,
        opts.torusSize,
        rotationMode,
        opts.torusColorMode,
      );
    }

    // BPM-locked speed: higher BPM = faster orbit
    const bpmFactor = audio.bpm > 0 && audio.bpmConfidence > 0.35 ? audio.bpm / 128 : 1;
    const orbitSpeed = (0.25 + bass * 0.4) * bpmFactor * opts.torusSpeed * amp;

    // Tube radius pulse with frequency spectrum
    const tubeScale = 1 + (bass * 0.35 + mid * 0.25) * amp;

    // Torus mesh pulsing
    this.torusMesh.scale.setScalar(tubeScale);
    this.torusMesh.rotation.z += dt * 0.08 * (1 + high * 0.5);

    // Update glass material
    if (this.torusMat) {
      this.torusMat.opacity = 0.12 + bass * 0.1;
      if (opts.torusUsePalette) {
        (this.torusMat as THREE.MeshPhysicalMaterial).color
          .copy(this.paletteThree[1])
          .lerp(this.paletteThree[2], mid);
      }
    }

    const count = this.torusParticleCount;
    const pos = this.torusParticleGeo!.attributes.position as THREE.BufferAttribute;
    const colArr = this.torusParticleColors;
    const angles = this.torusParticleAngles;
    const minors = this.torusParticleMinor;
    const R = 4.5;

    for (let i = 0; i < count; i++) {
      // Orbit speed varies per particle based on their frequency bin
      const freqT = count <= 1 ? 0 : i / (count - 1);
      const binIdx = Math.floor(freqT * Math.max(1, Math.floor(bins.length * 0.8)));
      const binVal = (bins[binIdx] ?? 0) / 255;

      angles[i] += dt * (orbitSpeed + binVal * 0.8 * amp);
      minors[i] += dt * 0.05; // slow inner rotation
      const major = angles[i]!;
      const minor = minors[i]!;
      const tubePulse = (1.0 + binVal * 0.6 * amp) * tubeScale;
      const tube = 1.1 * tubePulse * (0.4 + 0.6 * (0.5 + 0.5 * Math.sin(minor)));
      pos.setXYZ(
        i,
        (R + tube * Math.cos(minor)) * Math.cos(major),
        tube * Math.sin(minor),
        (R + tube * Math.cos(minor)) * Math.sin(major),
      );

      if (colArr) {
        if (opts.torusUsePalette) {
          const c = this.colorAtInto(freqT, this.tmpColor).lerp(
            this.white,
            0.05 + binVal * 0.15 + bass * 0.04,
          );
          colArr[i * 3] = c.r;
          colArr[i * 3 + 1] = c.g;
          colArr[i * 3 + 2] = c.b;
        }
      }
    }
    pos.needsUpdate = true;
    if (colArr)
      (this.torusParticleGeo!.attributes.color as THREE.BufferAttribute).needsUpdate = true;

    if (this.torusParticleMat) {
      const particleSize =
        Math.max(0.005, opts.torusParticleSize) * (0.8 + bass * 0.5) * Math.max(0.5, amp);
      this.torusParticleMat.size = particleSize;
      const torusOpacity = this.torusMat?.opacity;
      for (const cell of this.torusCells) {
        cell.particleMat.size = particleSize;
        if (torusOpacity !== undefined) cell.meshMat.opacity = torusOpacity;
      }
    }

    this.postFxBoost.bloom = 1 + bass * 0.8 + mid * 0.3;
    this.postFxBoost.glitch = 0;
  }

  // ─── Brutalist Sound-Wall ───────────────────────────────────────────────────

  buildSoundwall(cols: number = this.soundwallCols, rows: number = this.soundwallRows) {
    // Dispose previous
    if (this.soundwallPillars) {
      this.soundwallGroup.remove(this.soundwallPillars);
      this.soundwallPillars.geometry.dispose();
      this.soundwallMat?.dispose();
    }
    if (this.soundwallStrobeLight) {
      this.soundwallGroup.remove(this.soundwallStrobeLight);
    }
    this.soundwallCols = Math.max(4, Math.round(cols));
    this.soundwallRows = Math.max(2, Math.round(rows));
    const C = this.soundwallCols;
    const R = this.soundwallRows;
    this.soundwallHistory = new Float32Array(C * R);

    // Two corridors of pillars (left side + right side) for each column × row
    // Each pillar = one instance; 2 sides × C columns × R rows
    const count = 2 * C * R;
    const geo = new THREE.BoxGeometry(0.55, 1, 0.55);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 1.0,
      roughness: 0.03,
      emissive: this.paletteThree[0].clone(),
      emissiveIntensity: 0.1,
      envMapIntensity: 1.0,
      vertexColors: false,
    });
    this.soundwallMat = mat;
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // Initialise all instances at identity
    const d = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      d.position.set(0, 0, 0);
      d.scale.set(1, 0.2, 1);
      d.updateMatrix();
      mesh.setMatrixAt(i, d.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    this.soundwallPillars = mesh;
    this.soundwallGroup.add(mesh);

    // Strobe point light for bass transients
    const strobe = new THREE.PointLight(0xffffff, 0, 35);
    strobe.position.set(0, 6, 0);
    this.soundwallStrobeLight = strobe;
    this.soundwallGroup.add(strobe);
  }

  private updateSoundwall(
    dt: number,
    audio: AudioBands,
    _time: number,
    opts: {
      soundwallAmplitude: number;
      soundwallUsePalette: boolean;
      soundwallColumns: number;
      soundwallRows: number;
    },
  ) {
    const C = Math.max(4, Math.round(opts.soundwallColumns));
    const R = Math.max(2, Math.round(opts.soundwallRows));
    if (C !== this.soundwallCols || R !== this.soundwallRows) {
      this.buildSoundwall(C, R);
    }
    if (!this.soundwallPillars || !this.soundwallHistory || !this.soundwallMat) return;
    const amp = Math.max(0.05, opts.soundwallAmplitude);
    const bass = Math.max(0, Math.min(1, audio.bass));
    const mid = Math.max(0, Math.min(1, audio.mid));
    const bins = audio.bins;
    const activeBins = Math.max(1, Math.floor(bins.length * 0.7));

    // Shift history one row forward (like a waterfall scrolling toward camera)
    this.soundwallHistory.copyWithin(C, 0, C * (R - 1));
    // Read current spectrum into row 0
    for (let c = 0; c < C; c++) {
      const idx = Math.floor((c / C) * activeBins);
      const v = (bins[idx] ?? 0) / 255;
      this.soundwallHistory[c] = normalizedBand(v) * 12 * amp;
    }

    // Strobe light: flash on bass transients
    if (this.soundwallStrobeLight) {
      const targetIntensity = audio.beat ? (3 + bass * 18) * amp : 0;
      this.soundwallStrobeLight.intensity +=
        (targetIntensity - this.soundwallStrobeLight.intensity) * Math.min(1, dt * 20);
      if (opts.soundwallUsePalette) {
        this.soundwallStrobeLight.color.copy(this.paletteThree[0]).lerp(this.paletteThree[1], bass);
      } else {
        this.soundwallStrobeLight.color.setRGB(1, 1, 1);
      }
    }

    const d = this.dummy;
    const xGap = 1.1; // spacing between columns
    const zSpacing = 1.5; // depth spacing between rows
    const sideOffset = 2.8; // corridor half-width

    for (let side = 0; side < 2; side++) {
      const sideSign = side === 0 ? -1 : 1;
      for (let r = 0; r < R; r++) {
        for (let c = 0; c < C; c++) {
          const instanceIdx = side * C * R + r * C + c;
          const h = Math.max(0.08, this.soundwallHistory[r * C + c]!);
          const x = (c - (C - 1) / 2) * xGap + sideSign * sideOffset;
          const z = -(r * zSpacing) + 4; // rows scroll toward camera
          d.position.set(x, 0, z);
          d.scale.set(1, h, 1);
          d.rotation.set(0, 0, 0);
          d.updateMatrix();
          this.soundwallPillars.setMatrixAt(instanceIdx, d.matrix);
        }
      }
    }
    this.soundwallPillars.instanceMatrix.needsUpdate = true;

    // Material: chrome tint + mid-spike emissive flare
    this.soundwallMat.color.setRGB(1, 1, 1);
    if (opts.soundwallUsePalette) {
      this.soundwallMat.emissive.copy(this.paletteThree[1]).lerp(this.paletteThree[2], mid);
      this.soundwallMat.emissiveIntensity = (0.08 + mid * 0.7 + bass * 0.3) * amp;
    } else {
      this.soundwallMat.emissive.setRGB(0.5, 0.6, 0.8);
      this.soundwallMat.emissiveIntensity = 0.1 + mid * 0.5;
    }

    // FOV distortion on mid-spikes is applied by the caller (update opts)
    this.postFxBoost.bloom = 1 + mid * 0.8 + bass * 0.4;
    this.postFxBoost.glitch = Math.max(0, mid - 0.6) * 1.5;
  }

  // ─── Floating Geometry Nebula ───────────────────────────────────────────────

  buildGeoNebula(count: number = this.geoNebulaCount, spread: number = this.geoNebulaSpread) {
    // Dispose previous
    for (const s of this.geoNebulaMeshes) {
      this.geometrynebulaGroup.remove(s.mesh);
      s.mesh.geometry.dispose();
      s.mat.dispose();
    }
    this.geoNebulaMeshes = [];
    if (this.geoNebulaFloor) {
      this.geometrynebulaGroup.remove(this.geoNebulaFloor);
      this.geoNebulaFloor.geometry.dispose();
      (this.geoNebulaFloor.material as THREE.Material).dispose();
    }
    if (this.geoNebulaCoreLight) {
      this.geometrynebulaGroup.remove(this.geoNebulaCoreLight);
    }
    this.geoNebulaCount = Math.max(6, Math.round(count));
    this.geoNebulaSpread = Math.max(0.8, Math.min(3, spread));
    const N = this.geoNebulaCount;

    // Create a mix of geometry types
    const geoFactories: Array<() => THREE.BufferGeometry> = [
      () => new THREE.BoxGeometry(0.55, 0.55, 0.55),
      () => new THREE.OctahedronGeometry(0.38),
      () => new THREE.SphereGeometry(0.32, 12, 8),
      () => new THREE.TetrahedronGeometry(0.42),
      () => new THREE.IcosahedronGeometry(0.34, 0),
    ];

    // Arrange shapes in a sphere cluster
    const phi = Math.PI * (3 - Math.sqrt(5)); // golden angle
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const rad = Math.sqrt(1 - y * y);
      const theta = phi * i;
      const baseRadius = (3.2 + Math.sin(i * 2.3) * 0.6) * this.geoNebulaSpread;
      const bx = Math.cos(theta) * rad * baseRadius;
      const by = y * baseRadius;
      const bz = Math.sin(theta) * rad * baseRadius;

      const factory = geoFactories[i % geoFactories.length]!;
      const geo = factory();
      const freqT = N <= 1 ? 0 : i / (N - 1);
      const baseColor = this.colorAt(freqT);
      const mat = new THREE.MeshStandardMaterial({
        color: baseColor,
        metalness: 0.85,
        roughness: 0.1,
        emissive: baseColor.clone(),
        emissiveIntensity: 0.6,
        transparent: true,
        opacity: 0.85,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(bx, by, bz);
      this.geometrynebulaGroup.add(mesh);
      const axis = new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5,
      ).normalize();
      this.geoNebulaMeshes.push({
        mesh,
        freqBin: i,
        basePos: new THREE.Vector3(bx, by, bz),
        rotAxis: axis,
        rotSpeed: 0.4 + Math.random() * 1.2,
        baseScale: 0.8 + Math.random() * 0.8,
        mat,
      });
    }

    // Wet pavement floor
    const floorGeo = new THREE.PlaneGeometry(32, 32);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x080810,
      metalness: 0.9,
      roughness: 0.08,
      envMapIntensity: 1.0,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -4;
    this.geoNebulaFloor = floor;
    this.geometrynebulaGroup.add(floor);

    // High-intensity center light
    const coreLight = new THREE.PointLight(0xffffff, 2.5, 40);
    coreLight.position.set(0, 0, 0);
    this.geoNebulaCoreLight = coreLight;
    this.geometrynebulaGroup.add(coreLight);
  }

  private updateGeoNebula(
    dt: number,
    time: number,
    audio: AudioBands,
    opts: {
      geometrynebulaAmplitude: number;
      geometrynebulaUsePalette: boolean;
      geometrynebulaCount: number;
      geometrynebulaSpread: number;
      geometrynebulaOrbitSpeed: number;
      geometrynebulaSpinSpeed: number;
    },
  ) {
    const targetCount = Math.max(6, Math.round(opts.geometrynebulaCount));
    const targetSpread = Math.max(0.8, Math.min(3, opts.geometrynebulaSpread));
    if (targetCount !== this.geoNebulaCount || targetSpread !== this.geoNebulaSpread) {
      this.buildGeoNebula(targetCount, targetSpread);
      return;
    }
    if (this.geoNebulaMeshes.length === 0) return;
    const amp = Math.max(0.05, opts.geometrynebulaAmplitude);
    const bass = Math.max(0, Math.min(1, audio.bass));
    const mid = Math.max(0, Math.min(1, audio.mid));
    const high = Math.max(0, Math.min(1, audio.high));
    const bins = audio.bins;
    const N = this.geoNebulaMeshes.length;
    const activeBins = Math.max(1, Math.floor(bins.length * 0.8));
    const orbitSpeed = Math.max(0.1, opts.geometrynebulaOrbitSpeed);
    const spinSpeed = Math.max(0.1, opts.geometrynebulaSpinSpeed);

    // Whole cluster slow rotation
    this.geometrynebulaGroup.rotation.y += dt * (0.08 + mid * 0.25) * orbitSpeed;
    this.geometrynebulaGroup.rotation.x += dt * 0.03 * (0.3 + bass * 0.7) * orbitSpeed;

    // Core light
    if (this.geoNebulaCoreLight) {
      const targetIntensity = (2.4 + bass * 14 + mid * 6) * amp * orbitSpeed;
      this.geoNebulaCoreLight.intensity +=
        (targetIntensity - this.geoNebulaCoreLight.intensity) * Math.min(1, dt * 6);
      if (opts.geometrynebulaUsePalette) {
        this.geoNebulaCoreLight.color.copy(this.paletteThree[1]).lerp(this.paletteThree[0], bass);
      }
    }

    for (let i = 0; i < N; i++) {
      const s = this.geoNebulaMeshes[i]!;
      const freqT = N <= 1 ? 0 : i / (N - 1);
      const binIdx = Math.floor(freqT * activeBins);
      const binVal = normalizedBand((bins[binIdx] ?? 0) / 255);

      // Scale pulse to assigned frequency
      const targetScale = s.baseScale * (1 + binVal * 2.1 * amp + bass * 0.35);
      const curScale = s.mesh.scale.x;
      s.mesh.scale.setScalar(
        curScale + (targetScale - curScale) * Math.min(1, dt * (9 + orbitSpeed * 4)),
      );

      // Position — orbit gently around base position
      const orbitAmt = (0.45 + high * 1.1) * amp * orbitSpeed;
      const wobble = 0.18 + binVal * 0.4;
      const px =
        s.basePos.x + Math.sin(time * (0.7 + orbitSpeed * 0.25) + i * 0.5) * orbitAmt * wobble;
      const py =
        s.basePos.y +
        Math.cos(time * (0.55 + orbitSpeed * 0.18) + i * 0.4) * orbitAmt * 0.7 * wobble;
      const pz =
        s.basePos.z + Math.cos(time * (0.6 + orbitSpeed * 0.22) + i * 0.6) * orbitAmt * wobble;
      s.mesh.position.set(px, py, pz);

      // Rotation per shape
      s.mesh.rotateOnWorldAxis(s.rotAxis, dt * s.rotSpeed * spinSpeed * (0.5 + binVal * 2.4));

      // Holographic color update
      if (opts.geometrynebulaUsePalette) {
        const c = this.colorAtInto(freqT, this.tmpColor);
        s.mat.color.copy(c).lerp(this.white, binVal * 0.25);
        s.mat.emissive.copy(c).lerp(this.white, 0.1 + binVal * 0.3 + bass * 0.15);
        s.mat.emissiveIntensity = (0.5 + binVal * 2.2 + bass * 0.6) * amp;
        s.mat.opacity = 0.7 + binVal * 0.3;
      } else {
        s.mat.color.setRGB(0.8, 0.9, 1.0);
        s.mat.emissive.setRGB(0.2, 0.4, 0.8);
        s.mat.emissiveIntensity = 0.4 + binVal * 1.2;
        s.mat.opacity = 0.75 + binVal * 0.25;
      }
    }

    // Wet floor responds to bass
    if (this.geoNebulaFloor) {
      const floorMat = this.geoNebulaFloor.material as THREE.MeshStandardMaterial;
      floorMat.roughness = Math.max(0.04, 0.12 - bass * 0.1);
      if (opts.geometrynebulaUsePalette) {
        floorMat.emissive.copy(this.paletteThree[2]).multiplyScalar(bass * 0.25 * amp);
        floorMat.emissiveIntensity = 1;
      }
    }

    this.postFxBoost.bloom = 1 + bass * 1.15 + mid * 0.65 + high * 0.25;
    this.postFxBoost.glitch = 0;
  }

  // ─── Rez Tube ─────────────────────────────────────────────────────────────

  buildReztube(segs: number = 4) {
    if (this.reztubeLine) {
      this.reztubeGroup.remove(this.reztubeLine);
      this.reztubeGeo?.dispose();
      this.reztubeMat?.dispose();
    }
    if (this.reztubeCoreLight) {
      this.reztubeGroup.remove(this.reztubeCoreLight);
    }
    const RINGS = this.TUBE_RINGS;
    const SEGS = Math.max(3, Math.min(12, Math.round(segs)));
    this.reztubePrevSegs = SEGS;

    // Ring outlines (RINGS * SEGS segments) + side connectors (RINGS * SEGS segments)
    const segCount = RINGS * SEGS * 2;
    const posArray = new Float32Array(segCount * 6); // [sx,sy,sz, ex,ey,ez] per segment
    const colArray = new Float32Array(segCount * 6); // [sr,sg,sb, er,eg,eb] per segment
    this.reztubePos = posArray;
    this.reztubeCol = colArray;

    const geo = new LineSegmentsGeometry();
    geo.setPositions(posArray);
    geo.setColors(colArray);
    this.reztubeGeo = geo;

    this.reztubeMat = new LineMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 1.0,
      linewidth: 1,
      worldUnits: false,
    });
    this.reztubeMat.resolution.set(window.innerWidth || 1, window.innerHeight || 1);
    this.reztubeLine = new LineSegments2(geo, this.reztubeMat);
    this.reztubeLine.frustumCulled = false;
    this.reztubeGroup.add(this.reztubeLine);

    // Pre-allocate per-ring vertex scratch buffers
    this.reztubeRingX = new Float32Array(RINGS * SEGS);
    this.reztubeRingY = new Float32Array(RINGS * SEGS);
    this.reztubeRingZ = new Float32Array(RINGS);

    const light = new THREE.PointLight(0x00ffee, 2, 22);
    light.position.set(0, 0, -3);
    this.reztubeCoreLight = light;
    this.reztubeGroup.add(light);

    this.reztubeScroll = 0;
    this.reztubeFlash = 0;
  }

  private updateReztube(
    dt: number,
    time: number,
    audio: AudioBands,
    opts: {
      reztubeAmplitude: number;
      reztubeUsePalette: boolean;
      reztubeSpeed: number;
      reztubeTwist: number;
      reztubeRadius: number;
      reztubeSegments: number;
      reztubeLineWidth: number;
    },
  ) {
    const segs = Math.max(3, Math.min(12, Math.round(opts.reztubeSegments)));
    if (segs !== this.reztubePrevSegs) this.buildReztube(segs);
    if (
      !this.reztubeLine ||
      !this.reztubeMat ||
      !this.reztubeGeo ||
      !this.reztubePos ||
      !this.reztubeCol ||
      !this.reztubeRingX ||
      !this.reztubeRingY ||
      !this.reztubeRingZ
    )
      return;

    const RINGS = this.TUBE_RINGS;
    const SEGS = this.reztubePrevSegs;
    const SPACING = this.RING_SPACING;
    const TOTAL_DEPTH = RINGS * SPACING;
    const amp = Math.max(0.1, opts.reztubeAmplitude);

    this.reztubeMat.linewidth = Math.max(0.5, opts.reztubeLineWidth);

    // Beat flash — decays each frame
    if (audio.beat) this.reztubeFlash = 1.0;
    this.reztubeFlash *= Math.exp(-dt * 7.0);

    // Advance scroll in world-units; bass pumps the speed
    const bassBoost = 1.0 + audio.bass * 1.4;
    this.reztubeScroll =
      (this.reztubeScroll + dt * opts.reztubeSpeed * 8 * bassBoost) % TOTAL_DEPTH;

    const pos = this.reztubePos;
    const col = this.reztubeCol;

    const bins = audio.bins;
    const sideVertStart = RINGS * SEGS * 2;
    const ringX = this.reztubeRingX;
    const ringY = this.reztubeRingY;
    const ringZ = this.reztubeRingZ;

    // ── Pass 1: compute all ring positions + write ring outline segments ───
    for (let r = 0; r < RINGS; r++) {
      // Each ring cycles from far (z = -TOTAL_DEPTH) to near (z ≈ 0) as scroll increases.
      const z = ((r * SPACING + this.reztubeScroll) % TOTAL_DEPTH) - TOTAL_DEPTH;
      ringZ[r] = z;

      // proximity 0 = far, 1 = near camera
      const proximity = (z + TOTAL_DEPTH) / TOTAL_DEPTH;

      // Frequency bin: map ring index → spectrum (so ring 0 = bass, ring N-1 = mid-high)
      const spectralT = r / RINGS;
      const binIdx = Math.min(bins.length - 1, Math.floor(spectralT * bins.length * 0.65));
      const binVal = normalizedBand(Math.max(0, Math.min(1, (bins[binIdx] ?? 0) / 255)));

      // Radius pulses with the bin's energy + bass at close range
      const radiusMod = 1.0 + binVal * 0.7 * amp + audio.bass * 0.35 * amp * Math.pow(proximity, 2);
      const ringRadius = opts.reztubeRadius * radiusMod;

      // Per-ring twist accumulates with distance (helix effect from Rez)
      const twistAngle = opts.reztubeTwist * (proximity * Math.PI * 2.5 + time * 0.45);

      // Color: position in spectrum + audio brightness
      let cr: number, cg: number, cb: number;
      if (opts.reztubeUsePalette) {
        this.colorAtInto(spectralT, this.tmpColor);
        const bright = Math.min(
          2.0,
          (0.35 + binVal * 0.6 + this.reztubeFlash * 0.4) * (0.4 + proximity * 1.2),
        );
        cr = this.tmpColor.r * bright;
        cg = this.tmpColor.g * bright;
        cb = this.tmpColor.b * bright;
      } else {
        // Neon grid: hue sweeps from cyan (far) → magenta (near) + time drift
        const hue = (spectralT * 0.65 + time * 0.04) % 1.0;
        const lum = Math.min(
          0.92,
          0.35 + binVal * 0.35 + this.reztubeFlash * 0.25 + proximity * 0.22,
        );
        this.tmpColor.setHSL(hue, 1.0, lum);
        cr = this.tmpColor.r;
        cg = this.tmpColor.g;
        cb = this.tmpColor.b;
      }

      for (let s = 0; s < SEGS; s++) {
        const angle = (s / SEGS) * Math.PI * 2 + twistAngle;
        const vx = Math.cos(angle) * ringRadius;
        const vy = Math.sin(angle) * ringRadius;
        ringX[r * SEGS + s] = vx;
        ringY[r * SEGS + s] = vy;

        const sNext = (s + 1) % SEGS;
        const angleNext = (sNext / SEGS) * Math.PI * 2 + twistAngle;
        const vnx = Math.cos(angleNext) * ringRadius;
        const vny = Math.sin(angleNext) * ringRadius;

        // Two vertices: from corner s to corner s+1 (ring outline)
        const vi = (r * SEGS + s) * 2;
        const pi = vi * 3;
        pos[pi] = vx;
        pos[pi + 1] = vy;
        pos[pi + 2] = z;
        pos[pi + 3] = vnx;
        pos[pi + 4] = vny;
        pos[pi + 5] = z;
        col[pi] = cr;
        col[pi + 1] = cg;
        col[pi + 2] = cb;
        col[pi + 3] = cr;
        col[pi + 4] = cg;
        col[pi + 5] = cb;
      }
    }

    // ── Pass 2: write side connector segments (ring r → ring r+1 per vertex) ─
    for (let r = 0; r < RINGS; r++) {
      const rNext = (r + 1) % RINGS;
      const zA = ringZ[r];
      const zB = ringZ[rNext];

      // Skip the connector if there is a wrap jump (avoids diagonal lines across the tube)
      const skip = Math.abs(zA - zB) > SPACING * 2.2;

      const spectralT = r / RINGS;
      let cr: number, cg: number, cb: number;
      if (opts.reztubeUsePalette) {
        this.colorAtInto(spectralT, this.tmpColor);
        const binIdx = Math.min(bins.length - 1, Math.floor(spectralT * bins.length * 0.65));
        const binVal = (bins[binIdx] ?? 0) / 255;
        const bright = (0.15 + binVal * 0.3) * 0.65;
        cr = this.tmpColor.r * bright;
        cg = this.tmpColor.g * bright;
        cb = this.tmpColor.b * bright;
      } else {
        const hue = (spectralT * 0.65 + time * 0.04) % 1.0;
        this.tmpColor.setHSL(hue, 1.0, 0.22);
        cr = this.tmpColor.r;
        cg = this.tmpColor.g;
        cb = this.tmpColor.b;
      }

      for (let s = 0; s < SEGS; s++) {
        const vi = sideVertStart + (r * SEGS + s) * 2;
        const pi = vi * 3;
        if (skip) {
          // Degenerate (zero-length) line — invisible
          pos[pi] = pos[pi + 1] = pos[pi + 2] = 0;
          pos[pi + 3] = pos[pi + 4] = pos[pi + 5] = 0;
        } else {
          pos[pi] = ringX[r * SEGS + s];
          pos[pi + 1] = ringY[r * SEGS + s];
          pos[pi + 2] = zA;
          pos[pi + 3] = ringX[rNext * SEGS + s];
          pos[pi + 4] = ringY[rNext * SEGS + s];
          pos[pi + 5] = zB;
        }
        col[pi] = cr;
        col[pi + 1] = cg;
        col[pi + 2] = cb;
        col[pi + 3] = cr;
        col[pi + 4] = cg;
        col[pi + 5] = cb;
      }
    }

    // Mark the LineSegmentsGeometry buffers as needing GPU upload
    const instStart = this.reztubeGeo.attributes.instanceStart as THREE.InterleavedBufferAttribute;
    instStart.data.needsUpdate = true;
    const instCol = this.reztubeGeo.attributes
      .instanceColorStart as THREE.InterleavedBufferAttribute;
    instCol.data.needsUpdate = true;

    if (this.reztubeCoreLight) {
      this.reztubeCoreLight.intensity = (1.2 + audio.bass * 3.5 + this.reztubeFlash * 4) * amp;
      if (opts.reztubeUsePalette) {
        this.reztubeCoreLight.color
          .copy(this.paletteThree[0])
          .lerp(this.paletteThree[1], audio.mid);
      } else {
        this.reztubeCoreLight.color.setRGB(0.0, 1.0, 0.87);
      }
    }

    this.postFxBoost.bloom = 1.4 + audio.bass * 1.4 + this.reztubeFlash * 1.2;
    this.postFxBoost.glitch = 0;
  }

  update(dt: number, time: number, audio: AudioBands, opts: SceneUpdateOpts) {
    // Keep scene visibility + branch view in lockstep with React settings every frame.
    this.setView(opts.view);

    // Update background and fog colour.
    const xrMode = Boolean(opts.xrMode);
    const xrBackgroundHidden = xrMode && Boolean(opts.xrBackgroundHidden);
    if (xrBackgroundHidden) {
      this.scene.background = null;
      this.lastSceneBgColor = "";
    } else if (opts.bgColor !== this.lastSceneBgColor) {
      this.lastSceneBgColor = opts.bgColor;
      if (!(this.scene.background instanceof THREE.Color)) {
        this.scene.background = new THREE.Color(opts.bgColor);
      } else {
        (this.scene.background as THREE.Color).set(opts.bgColor);
      }
    }
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.set(opts.bgColor);
    }
    // BPM phase — authoritative song clock beat phase when synced, else 0
    const bpmConfident = audio.bpm > 0 && audio.bpmConfidence > 0.45;
    const bpmPhase = bpmConfident ? audio.beatPhase : 0;
    this.xrHudViewLabel = opts.view;
    this.xrHudTempo = Math.round(audio.bpm);
    this.xrHudTempoConfidence = audio.bpmConfidence;
    this.xrHudBands.bass = audio.bass;
    this.xrHudBands.mid = audio.mid;
    this.xrHudBands.high = audio.high;
    this.xrHudBackgroundNote = xrBackgroundHidden
      ? "Transparent clear requested; Quest passthrough unsupported"
      : "Quest Browser passthrough unsupported in immersive-vr";
    const hudRedrawInterval = opts.performance ? 320 : 160;
    if (
      this.xrSessionActive &&
      (this.xrHudNeedsRedraw || performance.now() - this.xrHudLastDrawAt > hudRedrawInterval)
    ) {
      this.redrawXrHud();
    }

    // shared kick / beat state
    // When BPM is locked: fire on the clock edge (phase wraps 1→0).
    // Fall back to raw audio.beat when BPM isn't confident yet.
    if (opts.cameraBeat) {
      const bpmKickAllowed =
        bpmConfident && audio.bpmConfidence > 0.62 && audio.bpm >= 70 && audio.bpm <= 170;
      const minKickGap = bpmKickAllowed
        ? Math.max(0.2, Math.min(0.55, (60 / audio.bpm) * 0.7))
        : 0.28;
      const kickReady = time - this.lastKickTime >= minKickGap;

      if (bpmKickAllowed) {
        if (kickReady && bpmPhase < this.lastBpmPhase && this.lastBpmPhase > 0.5) {
          this.kick = 1;
          this.lastKickTime = time;
        }
      } else {
        const fallbackBeatGate = audio.bass > 0.42 + audio.mid * 0.12;
        if (kickReady && audio.beat && fallbackBeatGate) {
          this.kick = 1;
          this.lastKickTime = time;
        }
      }
    }
    this.lastBpmPhase = bpmPhase;
    this.kick *= Math.exp(-dt * 6.2);
    const beat = opts.cameraBeat ? opts.cameraBeatAmount : 0;

    // mouse smoothing (always run so it works in any view)
    this.mouseYaw += (this.targetYaw - this.mouseYaw) * Math.min(1, dt * 12);
    this.mousePitch += (this.targetPitch - this.mousePitch) * Math.min(1, dt * 12);
    this.mouseZoom += (this.targetZoom - this.mouseZoom) * Math.min(1, dt * 8);
    this.setXrMode(xrMode);
    this.updateXrSceneTransform(dt);

    const driftAmt = Math.max(0, Number(opts.cameraDriftAmount) || 0);
    const drift = opts.cameraDrift && driftAmt > 1e-4 ? driftAmt : 0;
    // Position drift scaled down so the lens stays near the subject; FOV still uses full `drift`.
    const driftPos = drift > 0 ? drift * 0.26 : 0;
    const applyCameraDrift = (scale = 1) => {
      if (drift <= 0) return;
      const a = driftPos * scale * 1.35;
      this.camera.position.x +=
        Math.sin(time * 0.27) * a +
        Math.cos(time * 0.16) * a * 0.7 +
        Math.sin(time * 0.43) * a * 0.35;
      this.camera.position.y += Math.sin(time * 0.24) * a * 0.85 + Math.sin(time * 0.38) * a * 0.45;
      this.camera.position.z +=
        Math.cos(time * 0.22) * a * 1.05 +
        Math.sin(time * 0.2) * a * 0.65 +
        Math.cos(time * 0.31) * a * 0.3;
    };

    if (opts.view === "classic") {
      if (this.classicGrid) this.classicGrid.visible = opts.grid;
      if (this.classicGridMat) this.classicGridMat.opacity = opts.gridOpacity;
      this.classicBarMat.wireframe = opts.classicWireframe;
      (this.classicPeaks.material as THREE.MeshStandardMaterial).wireframe = opts.classicWireframe;
      this.updateClassic(
        dt,
        audio,
        opts.peakDecay,
        opts.peakHold,
        opts.colorBands,
        opts.blocky,
        opts.segments,
        opts.peakColor,
        opts.peakStyle,
      );

      if (xrMode) return;

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

      let camX = 0,
        camY = 3,
        camZ = 11;
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

      if (xrMode) return;

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

      if (xrMode) return;
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
        this.camera.position.set(
          Math.sin(this.orbitAngle) * rad,
          4.5,
          Math.cos(this.orbitAngle) * rad,
        );
      }
      applyCameraDrift(2.5);
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
        nebulaWireframe: opts.nebulaWireframe,
      });

      if (xrMode) return;
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
        this.camera.position.set(
          Math.sin(this.orbitAngle) * 8.5,
          Math.sin(time * 0.4) * 0.7,
          Math.cos(this.orbitAngle) * 8.5,
        );
      }
      applyCameraDrift(2.2);
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
        monolithBrightness: opts.monolithBrightness,
        monolithUsePalette: opts.monolithUsePalette,
        monolithWireframe: opts.monolithWireframe,
      });

      if (xrMode) return;
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
        this.camera.position.set(
          Math.sin(this.orbitAngle) * 24,
          12,
          Math.cos(this.orbitAngle) * 24,
        );
      }
      applyCameraDrift(3.2);
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

      if (xrMode) return;
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
        this.camera.position.set(
          Math.sin(this.orbitAngle) * 10.5,
          Math.sin(time * 0.5) * 1.2,
          Math.cos(this.orbitAngle) * 10.5,
        );
      }
      applyCameraDrift(2.4);
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
        terrainWireframe: opts.terrainWireframe,
      });

      if (xrMode) return;
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
      applyCameraDrift(2.8);
      this.camera.lookAt(0, -1.5, 7);
      return;
    }

    if (opts.view === "obsidian") {
      // Rebuild if detail changed
      if (opts.obsidianShardDetail !== this.obsidianDetail)
        this.buildObsidian(opts.obsidianShardDetail);
      this.updateObsidian(dt, time, audio, {
        obsidianAmplitude: opts.obsidianAmplitude,
        obsidianUsePalette: opts.obsidianUsePalette,
      });

      if (xrMode) return;
      if (opts.obsidianFullscreen) {
        const follow = Math.min(1, dt * 8);
        this.camera.position.x += (0 - this.camera.position.x) * follow;
        this.camera.position.y += (0 - this.camera.position.y) * follow;
        this.camera.position.z += (10 - this.camera.position.z) * follow;
        this.camera.fov += (50 - this.camera.fov) * Math.min(1, dt * 10);
        this.camera.updateProjectionMatrix();
        this.camera.lookAt(0, 0, 0);
        return;
      }
      if (opts.cameraMouse) {
        const r = this.mouseZoom * 0.8;
        this.camera.position.set(
          Math.sin(this.mouseYaw) * Math.cos(this.mousePitch) * r,
          Math.sin(this.mousePitch) * r * 0.5,
          Math.cos(this.mouseYaw) * Math.cos(this.mousePitch) * r,
        );
      } else {
        this.orbitAngle += dt * (opts.orbitSpeed * 0.6 + 0.05);
        const rad = 9 + audio.bass * 1.5;
        this.camera.position.set(
          Math.sin(this.orbitAngle) * rad,
          2 + Math.sin(time * 0.4) * 1.2,
          Math.cos(this.orbitAngle) * rad,
        );
      }
      const bk = this.kick * (opts.cameraBeat ? opts.cameraBeatAmount : 0);
      applyCameraDrift(4.2);
      this.camera.position.y += bk * 1.2;
      this.camera.fov += (55 - this.kick * 8 - this.camera.fov) * Math.min(1, dt * 10);
      this.camera.updateProjectionMatrix();
      this.camera.lookAt(0, 0, 0);
      return;
    }

    if (opts.view === "torus") {
      this.updateTorus(dt, time, audio, {
        torusAmplitude: opts.torusAmplitude,
        torusUsePalette: opts.torusUsePalette,
        torusParticleCount: opts.torusParticleCount,
        torusSpeed: opts.torusSpeed,
        torusCount: opts.torusCount,
        torusSpacing: opts.torusSpacing,
        torusSize: opts.torusSize,
        torusParticleSize: opts.torusParticleSize,
        torusColorMode: opts.torusColorMode,
        torusRotationMode: opts.torusRotationMode,
        torusOddUpright: opts.torusOddUpright,
        torusFullscreen: opts.torusFullscreen,
      });

      if (xrMode) return;
      if (opts.torusFullscreen) {
        const follow = Math.min(1, dt * 8);
        this.camera.position.x += (0 - this.camera.position.x) * follow;
        this.camera.position.y += (20 - this.camera.position.y) * follow;
        this.camera.position.z += (0.01 - this.camera.position.z) * follow;
        this.camera.fov += (52 - this.camera.fov) * Math.min(1, dt * 10);
        this.camera.updateProjectionMatrix();
        this.camera.lookAt(0, 0, 0);
        return;
      }
      if (opts.cameraMouse) {
        const r = this.mouseZoom * 0.9;
        this.camera.position.set(
          Math.sin(this.mouseYaw) * Math.cos(this.mousePitch) * r,
          Math.sin(this.mousePitch) * r * 0.6,
          Math.cos(this.mouseYaw) * Math.cos(this.mousePitch) * r,
        );
      } else {
        this.orbitAngle += dt * (opts.orbitSpeed * 0.4 + 0.04);
        this.camera.position.set(
          Math.sin(this.orbitAngle) * 12,
          Math.sin(time * 0.3) * 2.5 + 0.5,
          Math.cos(this.orbitAngle) * 12,
        );
      }
      const bk = this.kick * (opts.cameraBeat ? opts.cameraBeatAmount : 0);
      applyCameraDrift(4.5);
      this.camera.position.y += bk * 1.0;
      this.camera.fov += (55 - bk * 6 - this.camera.fov) * Math.min(1, dt * 10);
      this.camera.updateProjectionMatrix();
      this.camera.lookAt(0, 0, 0);
      return;
    }

    if (opts.view === "soundwall") {
      this.updateSoundwall(dt, audio, time, {
        soundwallAmplitude: opts.soundwallAmplitude,
        soundwallUsePalette: opts.soundwallUsePalette,
        soundwallColumns: opts.soundwallColumns,
        soundwallRows: opts.soundwallRows,
      });

      if (xrMode) return;
      if (opts.soundwallFullscreen) {
        const follow = Math.min(1, dt * 8);
        this.camera.position.x += (0 - this.camera.position.x) * follow;
        this.camera.position.y += (4 - this.camera.position.y) * follow;
        this.camera.position.z += (8 - this.camera.position.z) * follow;
        this.camera.fov += (60 - this.camera.fov) * Math.min(1, dt * 10);
        this.camera.updateProjectionMatrix();
        this.camera.lookAt(0, 2, -4);
        return;
      }
      const bk = this.kick * (opts.cameraBeat ? opts.cameraBeatAmount : 0);
      // FOV distortion on mid spikes (anamorphic feel)
      const mid = audio.mid;
      const fovDistort = Math.max(0, mid - 0.5) * 18;
      if (opts.cameraMouse) {
        const r = this.mouseZoom * 0.9;
        this.camera.position.set(
          Math.sin(this.mouseYaw) * Math.cos(this.mousePitch) * r,
          4 + Math.sin(this.mousePitch) * r * 0.4,
          Math.cos(this.mouseYaw) * Math.cos(this.mousePitch) * r,
        );
      } else {
        this.camera.position.x += (0 - this.camera.position.x) * Math.min(1, dt * 3);
        this.camera.position.y += (4.5 - this.camera.position.y) * Math.min(1, dt * 3);
        this.camera.position.z += (9 - this.camera.position.z) * Math.min(1, dt * 3);
      }
      applyCameraDrift(4.8);
      this.camera.position.y += bk * 1.5;
      this.camera.fov += (60 + fovDistort - bk * 8 - this.camera.fov) * Math.min(1, dt * 12);
      this.camera.updateProjectionMatrix();
      this.camera.lookAt(0, 2, -4);
      return;
    }

    if (opts.view === "geometrynebula") {
      this.updateGeoNebula(dt, time, audio, {
        geometrynebulaAmplitude: opts.geometrynebulaAmplitude,
        geometrynebulaUsePalette: opts.geometrynebulaUsePalette,
        geometrynebulaCount: opts.geometrynebulaCount,
        geometrynebulaSpread: opts.geometrynebulaSpread,
        geometrynebulaOrbitSpeed: opts.geometrynebulaOrbitSpeed,
        geometrynebulaSpinSpeed: opts.geometrynebulaSpinSpeed,
      });

      if (xrMode) return;
      if (opts.geometrynebulaFullscreen) {
        const follow = Math.min(1, dt * 8);
        this.camera.position.x += (0 - this.camera.position.x) * follow;
        this.camera.position.y += (0 - this.camera.position.y) * follow;
        this.camera.position.z += (14 - this.camera.position.z) * follow;
        this.camera.fov += (46 - this.camera.fov) * Math.min(1, dt * 10);
        this.camera.updateProjectionMatrix();
        this.camera.lookAt(0, 0, 0);
        return;
      }
      if (opts.cameraMouse) {
        const r = this.mouseZoom * 0.88;
        this.camera.position.set(
          Math.sin(this.mouseYaw) * Math.cos(this.mousePitch) * r,
          Math.sin(this.mousePitch) * r * 0.5,
          Math.cos(this.mouseYaw) * Math.cos(this.mousePitch) * r,
        );
      } else {
        this.orbitAngle += dt * (opts.orbitSpeed * 0.65 + 0.05);
        this.camera.position.set(
          Math.sin(this.orbitAngle) * 11,
          Math.sin(time * 0.35) * 1.8 + 1,
          Math.cos(this.orbitAngle) * 11,
        );
      }
      const bk = this.kick * (opts.cameraBeat ? opts.cameraBeatAmount : 0);
      applyCameraDrift(2.7);
      this.camera.position.y += bk * 1.2;
      this.camera.fov += (52 - bk * 7 - this.camera.fov) * Math.min(1, dt * 10);
      this.camera.updateProjectionMatrix();
      this.camera.lookAt(0, 0, 0);
      return;
    }

    if (opts.view === "reztube") {
      this.updateReztube(dt, time, audio, {
        reztubeAmplitude: opts.reztubeAmplitude,
        reztubeUsePalette: opts.reztubeUsePalette,
        reztubeSpeed: opts.reztubeSpeed,
        reztubeTwist: opts.reztubeTwist,
        reztubeRadius: opts.reztubeRadius,
        reztubeSegments: opts.reztubeSegments,
        reztubeLineWidth: opts.reztubeLineWidth,
      });

      if (xrMode) return;

      // Fullscreen: camera centred dead-on in the tube mouth
      if (opts.reztubeFullscreen) {
        const follow = Math.min(1, dt * 8);
        this.camera.position.x += (0 - this.camera.position.x) * follow;
        this.camera.position.y += (0 - this.camera.position.y) * follow;
        this.camera.position.z += (0 - this.camera.position.z) * follow;
        this.camera.fov += (82 - this.camera.fov) * Math.min(1, dt * 10);
        this.camera.updateProjectionMatrix();
        this.camera.lookAt(0, 0, -100);
        return;
      }

      // Default: centre in tube with audio-reactive FOV punch and optional drift sway
      const bk = this.kick * beat;
      const follow = Math.min(1, dt * 5);
      this.camera.position.x += (0 - this.camera.position.x) * follow;
      this.camera.position.y += (0 - this.camera.position.y) * follow;
      this.camera.position.z += (0 - this.camera.position.z) * follow;
      // Subtle drift: sway the camera slightly off-axis without leaving the tube
      if (drift > 0) {
        const a = driftPos * 0.6;
        this.camera.position.x += Math.sin(time * 0.18) * a + Math.cos(time * 0.29) * a * 0.5;
        this.camera.position.y += Math.sin(time * 0.22) * a * 0.7;
      }
      this.camera.position.y += bk * 0.35;
      this.camera.fov += (78 + bk * 14 - this.camera.fov) * Math.min(1, dt * 12);
      this.camera.updateProjectionMatrix();
      // Always look straight down the tunnel
      this.camera.lookAt(
        this.camera.position.x,
        this.camera.position.y,
        this.camera.position.z - 100,
      );
      return;
    }

    if (opts.view === "assetflow") {
      this.postFxBoost.bloom = 1.18;
      this.postFxBoost.glitch = 0.08;
      this.updateAssetflow(dt, time, audio, {
        assetflowAmplitude: opts.assetflowAmplitude,
        assetflowUsePalette: opts.assetflowUsePalette,
        assetflowIncludeShapes: opts.assetflowIncludeShapes,
        assetflowModelScale: opts.assetflowModelScale,
        assetflowSpriteAmount: opts.assetflowSpriteAmount,
        assetflowModelCount: opts.assetflowModelCount,
        assetflowSpread: opts.assetflowSpread,
        assetflowSpin: opts.assetflowSpin,
        assetflowMovement: opts.assetflowMovement,
        assetflowBackgroundDrift: opts.assetflowBackgroundDrift,
      });

      if (xrMode) return;
      if (opts.assetflowFullscreen) {
        const follow = Math.min(1, dt * 8);
        this.camera.position.x += (0 - this.camera.position.x) * follow;
        this.camera.position.y += (11.5 - this.camera.position.y) * follow;
        this.camera.position.z += (0.01 - this.camera.position.z) * follow;
        this.camera.fov += (56 - this.camera.fov) * Math.min(1, dt * 10);
        this.camera.updateProjectionMatrix();
        this.camera.lookAt(0, 0, 0);
        return;
      }

      if (opts.cameraMouse) {
        const r = this.mouseZoom * 0.92;
        this.camera.position.set(
          Math.sin(this.mouseYaw) * Math.cos(this.mousePitch) * r,
          2.8 + Math.sin(this.mousePitch) * r * 0.58,
          Math.cos(this.mouseYaw) * Math.cos(this.mousePitch) * r,
        );
      } else {
        this.orbitAngle += dt * (opts.orbitSpeed * 0.62 + 0.05);
        this.camera.position.set(
          Math.sin(this.orbitAngle) * 12.5,
          4.2 + Math.sin(time * 0.32) * 1.45,
          Math.cos(this.orbitAngle) * 12.5,
        );
      }

      const bk = this.kick * beat;
      applyCameraDrift(3.8);
      this.camera.position.y += bk * 1.2;
      this.camera.fov += (53 - bk * 8 - this.camera.fov) * Math.min(1, dt * 11);
      this.camera.updateProjectionMatrix();
      this.camera.lookAt(0, 0.6, 0);
      return;
    }

    this.postFxBoost.bloom = 1;
    this.postFxBoost.glitch = 0;

    // bars
    this.comboBarMat.wireframe = opts.comboWireframe;
    this.sphereMat.wireframe = opts.comboWireframe;
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
        const bpmRotation =
          audio.bpm > 0 && audio.bpmConfidence > 0.3 ? bpmPhase * Math.PI * 2 * 0.3 : 0;
        const rotatedAngle = angle + bpmRotation;
        const h = 0.2 + normalizedBand(v) * 6 * hScale;
        this.dummy.position.set(
          Math.cos(rotatedAngle) * radius,
          0,
          Math.sin(rotatedAngle) * radius,
        );
        this.dummy.scale.set(1, h, 1);
        this.dummy.rotation.y = -rotatedAngle;
        this.dummy.updateMatrix();
        this.bars.setMatrixAt(i, this.dummy.matrix);
      }
      this.bars.instanceMatrix.needsUpdate = true;
      (this.bars.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.3 + audio.bass * 1.4;
    }

    // sphere
    this.sphereMat.uniforms.uTime.value = time;
    this.sphereMat.uniforms.uBass.value = audio.bass;
    this.sphereMat.uniforms.uMid.value = audio.mid;
    this.sphereMat.uniforms.uDisp.value = opts.sphereDisp;

    // BPM Syncing: Apply to sphere rotation
    // Sync sphere spin speed to BPM (faster when BPM is detected and confident)
    const bpmSpinBoost =
      audio.bpm > 0 && audio.bpmConfidence > 0.3 ? 1 + audio.bpmConfidence * 0.4 : 1;

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
    const bpmEnergyMod =
      1 + Math.max(0, Math.sin(bpmPhase * Math.PI * 2)) * (audio.bpmConfidence || 0) * 0.6;
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

    if (xrMode) return;

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

  private setXrMode(active: boolean) {
    if (this.xrSessionActive === active) return;
    this.xrSessionActive = active;
    if (active) {
      this.xrSceneTargetOffset.set(0, 0, -8);
      this.xrSceneOffset.copy(this.xrSceneTargetOffset);
      this.xrSceneYaw = 0;
      this.xrScenePitch = 0;
      this.xrSceneRoot.position.copy(this.xrSceneOffset);
      this.xrSceneRoot.rotation.set(0, 0, 0);
      this.xrHudNeedsRedraw = true;
      this.xrHudGroup.visible = true;
      this.xrExitHoldSeconds = 0;
      this.xrExitTriggered = false;
      return;
    }
    this.xrSceneTargetOffset.set(0, 0, 0);
    this.xrSceneOffset.set(0, 0, 0);
    this.xrSceneYaw = 0;
    this.xrScenePitch = 0;
    this.xrSceneRoot.position.set(0, 0, 0);
    this.xrSceneRoot.rotation.set(0, 0, 0);
    this.xrHudGroup.visible = false;
    this.xrExitHoldSeconds = 0;
    this.xrExitTriggered = false;
  }

  private readControllerStickAxes(gamepad: Gamepad | null, preferredBaseAxis: number) {
    if (!gamepad) return { x: 0, y: 0 };
    const axes = gamepad.axes ?? [];
    const applyDeadzone = (value: number | undefined) => {
      const v = Number(value ?? 0);
      return Math.abs(v) > this.xrControllerDeadzone ? v : 0;
    };
    const preferredX = applyDeadzone(axes[preferredBaseAxis]);
    const preferredY = applyDeadzone(axes[preferredBaseAxis + 1]);
    const fallbackX = applyDeadzone(axes[0]);
    const fallbackY = applyDeadzone(axes[1]);
    const hasPreferredInput = preferredX !== 0 || preferredY !== 0;
    return {
      x: hasPreferredInput ? preferredX : fallbackX,
      y: hasPreferredInput ? preferredY : fallbackY,
    };
  }

  private resolveControllerInput(handedness: XRHandedness) {
    const explicit = this.xrControllerInputs.find((input) => input.handedness === handedness);
    if (explicit) return explicit;
    if (this.xrControllerInputs.length === 1) return this.xrControllerInputs[0] ?? null;
    // Quest Browser may omit handedness temporarily; on affected builds index 0 tends to be right.
    if (handedness === "left") return this.xrControllerInputs[1] ?? null;
    return this.xrControllerInputs[0] ?? null;
  }

  private buildXrHud() {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 512;
    const context = canvas.getContext("2d");
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const geometry = new THREE.PlaneGeometry(1.08, 0.54);
    const panel = new THREE.Mesh(geometry, material);
    panel.renderOrder = 1000;

    this.xrHudCanvas = canvas;
    this.xrHudContext = context;
    this.xrHudTexture = texture;
    this.xrHudPanel = panel;
    this.xrHudGroup.add(panel);
    this.xrHudGroup.visible = false;
    this.redrawXrHud();
  }

  private updateXrHudTransform() {
    const cameraPosition = new THREE.Vector3();
    const cameraQuaternion = new THREE.Quaternion();
    const forward = new THREE.Vector3(0, 0, -1);
    const right = new THREE.Vector3(1, 0, 0);
    const up = new THREE.Vector3(0, 1, 0);

    this.camera.getWorldPosition(cameraPosition);
    this.camera.getWorldQuaternion(cameraQuaternion);

    forward.applyQuaternion(cameraQuaternion);
    right.applyQuaternion(cameraQuaternion);
    up.applyQuaternion(cameraQuaternion);

    this.xrHudGroup.position
      .copy(cameraPosition)
      .add(forward.multiplyScalar(1.15))
      .add(right.multiplyScalar(-0.36))
      .add(up.multiplyScalar(0.2));
    this.xrHudGroup.quaternion.copy(cameraQuaternion);
  }

  private toggleXrHudPage() {
    this.xrHudPage = this.xrHudPage === "controls" ? "status" : "controls";
    this.xrHudNeedsRedraw = true;
  }

  private cycleXrView() {
    const views = VISUALS.map((visual) => visual.id).filter((view): view is ViewMode =>
      Boolean(this.getSceneObjectForView(view)),
    );
    const current = settingsStore.get().view;
    const index = views.indexOf(current);
    const next = views[(index + 1) % views.length] ?? DEFAULT_VISUAL_ID;
    settingsStore.set({ view: next });
  }

  private redrawXrHud() {
    if (!this.xrHudCanvas || !this.xrHudContext || !this.xrHudTexture) return;
    const ctx = this.xrHudContext;
    const { width, height } = this.xrHudCanvas;
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = "rgba(5, 8, 14, 0.84)";
    ctx.strokeStyle = "rgba(143, 196, 255, 0.3)";
    ctx.lineWidth = 4;
    const radius = 28;
    ctx.beginPath();
    ctx.moveTo(radius, 16);
    ctx.lineTo(width - radius, 16);
    ctx.quadraticCurveTo(width - 16, 16, width - 16, radius);
    ctx.lineTo(width - 16, height - radius);
    ctx.quadraticCurveTo(width - 16, height - 16, width - radius, height - 16);
    ctx.lineTo(radius, height - 16);
    ctx.quadraticCurveTo(16, height - 16, 16, height - radius);
    ctx.lineTo(16, radius);
    ctx.quadraticCurveTo(16, 16, radius, 16);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "rgba(143, 208, 255, 0.92)";
    ctx.font = '700 34px Menlo, Monaco, "Courier New", monospace';
    ctx.fillText("XR HUD", 46, 68);

    ctx.fillStyle = "rgba(255,255,255,0.86)";
    ctx.font = '600 24px Menlo, Monaco, "Courier New", monospace';
    const lines =
      this.xrHudPage === "controls"
        ? [
            "Left trigger: switch HUD page",
            "Right trigger: next visual",
            "Hold both grips: exit VR",
            "Quest Browser hides DOM menus in immersive-vr",
            "Use this HUD instead of desktop shortcuts",
          ]
        : [
            `View: ${this.xrHudViewLabel}`,
            `BPM: ${this.xrHudTempo || "--"} (${Math.round(this.xrHudTempoConfidence * 100)}%)`,
            `Bass / Mid / High: ${this.xrHudBands.bass.toFixed(2)} / ${this.xrHudBands.mid.toFixed(2)} / ${this.xrHudBands.high.toFixed(2)}`,
            this.xrHudBackgroundNote,
            "HTML settings/stats panels are desktop-only for now",
          ];

    lines.forEach((line, index) => {
      ctx.fillText(line, 46, 132 + index * 54);
    });

    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = '500 20px Menlo, Monaco, "Courier New", monospace';
    ctx.fillText(this.xrHudPage === "controls" ? "Page 1 / 2" : "Page 2 / 2", 46, height - 44);

    this.xrHudTexture.needsUpdate = true;
    this.xrHudNeedsRedraw = false;
    this.xrHudLastDrawAt = performance.now();
  }

  private updateXrSceneTransform(dt: number) {
    if (!this.xrSessionActive) {
      this.xrSceneRoot.position.set(0, 0, 0);
      this.xrSceneRoot.rotation.set(0, 0, 0);
      this.xrHudGroup.visible = false;
      this.xrExitHoldSeconds = 0;
      this.xrExitTriggered = false;
      return;
    }

    this.xrHudGroup.visible = true;
    this.updateXrHudTransform();

    const left = this.resolveControllerInput("left");
    const right = this.resolveControllerInput("right");
    const leftStick = this.readControllerStickAxes(
      left?.gamepad ?? null,
      this.xrThumbstickBaseAxis,
    );
    const rightStick = this.readControllerStickAxes(
      right?.gamepad ?? null,
      this.xrThumbstickBaseAxis,
    );

    this.xrSceneYaw += rightStick.x * dt * 1.7;
    this.xrScenePitch = THREE.MathUtils.clamp(
      this.xrScenePitch + rightStick.y * dt * 0.95,
      -0.55,
      0.55,
    );

    this.xrSceneTargetOffset.x = THREE.MathUtils.clamp(
      this.xrSceneTargetOffset.x - leftStick.x * dt * 2.4,
      -12,
      12,
    );
    this.xrSceneTargetOffset.z = THREE.MathUtils.clamp(
      this.xrSceneTargetOffset.z - leftStick.y * dt * 5.6,
      -26,
      -2.8,
    );

    this.xrSceneOffset.lerp(
      this.xrSceneTargetOffset,
      Math.min(1, dt * this.xrPositionInterpolationSpeed),
    );
    this.xrSceneRoot.position.copy(this.xrSceneOffset);
    this.xrSceneRoot.rotation.x +=
      (this.xrScenePitch - this.xrSceneRoot.rotation.x) *
      Math.min(1, dt * this.xrRotationInterpolationSpeed);
    this.xrSceneRoot.rotation.y +=
      (this.xrSceneYaw - this.xrSceneRoot.rotation.y) *
      Math.min(1, dt * this.xrRotationInterpolationSpeed);

    const squeezeCount = this.xrControllerInputs.filter((input) => input.squeezePressed).length;
    if (squeezeCount >= 2) {
      this.xrExitHoldSeconds += dt;
      if (this.xrExitHoldSeconds >= 0.9 && !this.xrExitTriggered) {
        this.xrExitTriggered = true;
        window.dispatchEvent(new Event(WEBXR_REQUEST_EVENT));
      }
    } else {
      this.xrExitHoldSeconds = 0;
      this.xrExitTriggered = false;
    }
  }

  attachWebXrControllers(renderer: THREE.WebGLRenderer) {
    this.detachWebXrControllers();

    const createControllerVisual = (color: number) => {
      const group = new THREE.Group();
      const lineGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -1),
      ]);
      const lineMaterial = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.85,
      });
      const line = new THREE.Line(lineGeometry, lineMaterial);
      line.scale.z = 7;
      group.add(line);

      const tip = new THREE.Mesh(
        new THREE.SphereGeometry(0.03, 12, 12),
        new THREE.MeshBasicMaterial({ color }),
      );
      tip.position.z = -1;
      group.add(tip);
      return group;
    };

    this.xrControllerInputs = [0, 1].map((index) => {
      const controller = renderer.xr.getController(index);
      controller.name = `webxr-controller-${index + 1}`;
      controller.add(createControllerVisual(index === 0 ? 0x7fd9ff : 0xffd166));
      const input = {
        controller: controller as THREE.Object3D,
        handedness: "" as XRHandedness | "",
        gamepad: null as Gamepad | null,
        squeezePressed: false,
      };
      controller.addEventListener("connected", (event) => {
        const source = (event as unknown as { data?: XRInputSource }).data;
        input.handedness = source?.handedness ?? "";
        input.gamepad = source?.gamepad ?? null;
      });
      controller.addEventListener("selectstart", () => {
        const hand = input.handedness || (index === 0 ? "right" : "left");
        if (hand === "right") {
          this.cycleXrView();
        } else {
          this.toggleXrHudPage();
        }
      });
      controller.addEventListener("squeezestart", () => {
        input.squeezePressed = true;
      });
      controller.addEventListener("squeezeend", () => {
        input.squeezePressed = false;
      });
      controller.addEventListener("disconnected", () => {
        input.handedness = "";
        input.gamepad = null;
        input.squeezePressed = false;
      });
      this.scene.add(controller);
      return input;
    });
  }

  detachWebXrControllers() {
    for (const input of this.xrControllerInputs) {
      const controller = input.controller;
      this.scene.remove(controller);
      controller.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const material = mesh.material;
        if (Array.isArray(material)) {
          for (const mat of material) mat.dispose();
        } else if (material) {
          material.dispose();
        }
      });
    }
    this.xrControllerInputs = [];
    this.xrExitHoldSeconds = 0;
    this.xrExitTriggered = false;
  }

  buildRipple() {
    for (const col of this.rippleColumnData) {
      this.rippleGroup.remove(col.root);
      for (const mat of col.mats) mat.dispose();
    }
    this.rippleColumnData = [];
    this.rippleGeo?.dispose();

    // Annular tube unit ring (inner=0, outer=1, height=0 → square cross section auto)
    const inner = 0.0,
      outer = 1.0,
      half = 0.5;
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
    const a = Math.floor(col * w);
    let b = Math.floor((col + 1) * w);
    if (b <= a) b = a + 1;
    let sum = 0;
    for (let i = a; i < b; i++) sum += bins[i]!;
    return sum / (b - a) / 255;
  }

  /** Ring-index sample within one column's frequency slice. */
  private rippleRingSpectrumInSlice(
    bins: Uint8Array,
    t: number,
    col: number,
    colCount: number,
  ): number {
    const n = bins.length;
    if (n === 0) return 0;
    const end = Math.max(2, Math.floor(n * 0.95));
    const w = end / colCount;
    const a = Math.floor(col * w);
    let b = Math.floor((col + 1) * w);
    if (b <= a) b = a + 1;
    const span = b - a;
    if (span <= 1) return bins[a]! / 255;
    const rel = Math.min(span - 1, Math.floor(Math.pow(t, 1.3) * span));
    return bins[a + rel]! / 255;
  }

  private updateRipple(
    dt: number,
    _time: number,
    audio: AudioBands,
    opts: {
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
    },
  ) {
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
    const amplitude =
      ((maxRadius * 0.32 * (baseThickness / 0.08)) / yScale) *
      (0.8 + normalizedBand(audio.bass) * 1.3) *
      Math.max(0.05, opts.rippleAmplitude);
    const waveCycles = opts.rippleWaveCycles + audio.mid * 1.0;

    const colA = this.paletteThree[0];
    const colB = this.paletteThree[1];
    const colC = this.paletteThree[2];
    const _c = this.rippleColorScratch;

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
        const yWave =
          Math.sin(wavePhase) *
          amplitude *
          (0.58 + normalizedBand(sliceV) * 0.85 + normalizedBand(ringSpectrum) * 0.55);
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

    this.rippleGroup.rotation.y +=
      dt *
      (opts.rippleFullscreen
        ? 0
        : opts.rippleRotationSpeed +
          audio.high * 0.4 +
          (audio.bpm > 0 ? audio.bpmConfidence * 0.8 : 0));
  }

  private buildAssetflow() {
    this.assetflowBuildToken += 1;
    this.assetflowAssetsRequested = false;
    this.assetflowModelChoice = Math.floor(Math.random() * ASSETFLOW_MODEL_PATHS.length);
    for (const actor of this.assetflowActors) {
      actor.placeholder.geometry.dispose();
      const placeholderMat = actor.placeholder.material;
      if (Array.isArray(placeholderMat)) placeholderMat.forEach((m) => m.dispose());
      else placeholderMat.dispose();
      actor.root.clear();
    }
    for (const layer of this.assetflowSprites) {
      layer.sprite.material.dispose();
      this.assetflowGroup.remove(layer.sprite);
    }
    for (const texture of this.assetflowTextures) texture.dispose();
    this.assetflowTextures = [];
    this.assetflowModelTemplates = [];
    this.assetflowActors = [];
    this.assetflowSprites = [];

    if (this.assetflowBaseDisk) {
      this.assetflowGroup.remove(this.assetflowBaseDisk);
      this.assetflowBaseDisk.geometry.dispose();
      (this.assetflowBaseDisk.material as THREE.Material).dispose();
    }
    this.assetflowBaseDisk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 8.8, 0.22, 64, 1, false),
      new THREE.MeshStandardMaterial({
        color: 0x0f1b2c,
        metalness: 0.3,
        roughness: 0.55,
        emissive: 0x0b2234,
        emissiveIntensity: 0.55,
      }),
    );
    this.assetflowBaseDisk.position.y = -1.45;
    this.assetflowGroup.add(this.assetflowBaseDisk);

    if (this.assetflowLight) {
      this.assetflowGroup.remove(this.assetflowLight);
    }
    this.assetflowLight = new THREE.PointLight(0x7fd9ff, 3.2, 45, 1.2);
    this.assetflowLight.position.set(0, 4.5, 2);
    this.assetflowGroup.add(this.assetflowLight);

    const actorCount = 24;
    const pathModes = ["orbit", "figure8", "lissajous", "spiral"] as const;
    for (let i = 0; i < actorCount; i++) {
      const angle = (i / actorCount) * Math.PI * 2;
      const radius = 4.7;
      const root = new THREE.Group();
      const basePos = new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      root.position.copy(basePos);

      const placeholderGeometry = this.createAssetflowFallbackGeometry(i);
      const placeholder = new THREE.Mesh(
        placeholderGeometry,
        new THREE.MeshStandardMaterial({
          color: 0x94b9ff,
          emissive: 0x1a3b66,
          emissiveIntensity: 0.6,
          metalness: 0.4,
          roughness: 0.32,
        }),
      );
      root.add(placeholder);
      this.assetflowGroup.add(root);
      this.assetflowActors.push({
        root,
        basePos,
        angle,
        pathMode: pathModes[i % pathModes.length] ?? "orbit",
        pathPhase: Math.random() * Math.PI * 2,
        pathSpeed: 0.55 + (i % 7) * 0.12,
        spinAxis: new THREE.Vector3(Math.sin(angle * 1.7), 1, Math.cos(angle * 1.4)).normalize(),
        baseScale: 0.95 + (i % 3) * 0.16,
        bin: Math.floor((i / actorCount) * 80),
        placeholder,
      });
    }

    this.requestAssetflowAssets(this.assetflowBuildToken);
  }

  private createAssetflowFallbackGeometry(index: number) {
    const variant = index % 12;
    if (variant === 0) return new THREE.IcosahedronGeometry(0.52, 1);
    if (variant === 1) return new THREE.TorusKnotGeometry(0.34, 0.11, 96, 14, 2, 3);
    if (variant === 2) return new THREE.OctahedronGeometry(0.56, 1);
    if (variant === 3) return new THREE.DodecahedronGeometry(0.5, 0);
    if (variant === 4) return new THREE.ConeGeometry(0.44, 0.95, 7);
    if (variant === 5) return new THREE.TetrahedronGeometry(0.62, 0);
    if (variant === 6) return new THREE.CylinderGeometry(0.34, 0.56, 0.92, 8, 1);
    if (variant === 7) return new THREE.SphereGeometry(0.52, 18, 14);
    if (variant === 8) return new THREE.TorusGeometry(0.44, 0.16, 14, 24);
    if (variant === 9) return new THREE.CylinderGeometry(0.08, 0.56, 1.08, 5, 1);
    if (variant === 10) return new THREE.ConeGeometry(0.5, 0.96, 3);
    return new THREE.TorusKnotGeometry(0.28, 0.09, 90, 12, 3, 5);
  }

  private normalizeAssetModel(model: THREE.Object3D, targetSize: number) {
    const bounds = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    bounds.getSize(size);
    bounds.getCenter(center);
    const maxDim = Math.max(size.x, size.y, size.z, 0.0001);
    const scale = targetSize / maxDim;
    model.scale.setScalar(scale);
    model.position.sub(center.multiplyScalar(scale));
    model.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map((mat) => mat.clone());
      } else {
        mesh.material = mesh.material.clone();
      }
    });
  }

  private requestAssetflowAssets(buildToken: number) {
    if (this.assetflowAssetsRequested) return;
    this.assetflowAssetsRequested = true;

    const baseUrl = (import.meta.env.BASE_URL || "/").replace(/\/*$/, "/");
    const toPublicUrl = (path: string) => `${baseUrl}${path.replace(/^\/+/, "")}`;
    this.assetflowModelTemplates = new Array(ASSETFLOW_MODEL_PATHS.length);
    const gltfLoader = new GLTFLoader();
    ASSETFLOW_MODEL_PATHS.forEach((path, idx) => {
      gltfLoader.load(
        toPublicUrl(path),
        (gltf) => {
          if (buildToken !== this.assetflowBuildToken) return;
          const model = gltf.scene;
          this.normalizeAssetModel(model, 1.6);
          this.assetflowModelTemplates[idx] = model;
          this.applyAssetflowModelsToActors();
        },
        undefined,
        () => {
          // Keep fallback meshes when optional third-party GLB files are missing.
        },
      );
    });

    const spriteImagePaths = [
      "assets/animations/svg/layer-wave.svg",
      "assets/animations/svg/layer-flare.svg",
      "assets/animations/svg/layer-rings.svg",
      "assets/animations/svg/layer-scanlines.svg",
      "assets/animations/svg/layer-diagonal.svg",
      "assets/animations/svg/layer-circuit.svg",
      "assets/animations/svg/layer-spiral.svg",
      "assets/animations/svg/layer-starburst.svg",
      "assets/animations/svg/layer-chevrons.svg",
      "assets/animations/svg/layer-grid-hex.svg",
      "assets/animations/svg/layer-halftone.svg",
      "assets/animations/svg/layer-noise-dots.svg",
      "assets/textures/overlay-grid.svg",
      "assets/textures/overlay-circles.svg",
      "assets/textures/overlay-diag-grid.svg",
      "assets/textures/overlay-hud.svg",
    ];
    const textureLoader = new THREE.TextureLoader();
    spriteImagePaths.forEach((path, idx) => {
      textureLoader.load(
        toPublicUrl(path),
        (texture) => {
          if (buildToken !== this.assetflowBuildToken) {
            texture.dispose();
            return;
          }
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.minFilter = THREE.LinearFilter;
          texture.magFilter = THREE.LinearFilter;
          texture.generateMipmaps = false;
          texture.needsUpdate = true;
          this.assetflowTextures.push(texture);

          const sprite = new THREE.Sprite(
            new THREE.SpriteMaterial({
              map: texture,
              transparent: true,
              depthWrite: false,
              depthTest: false,
              opacity: 0.35,
              blending: THREE.AdditiveBlending,
            }),
          );
          sprite.renderOrder = -10;
          const layer = idx % 8;
          const band = Math.floor(idx / 8);
          const baseY = -1.35 + layer * 0.26 + band * 0.1;
          sprite.position.set(0, baseY, 0);
          this.assetflowGroup.add(sprite);
          this.assetflowSprites.push({
            sprite,
            phase: idx * Math.PI * 0.27,
            radius: 3.2 + layer * 0.95 + band * 0.7,
            speed: 0.12 + layer * 0.028 + band * 0.05,
            bin: Math.min(96, 6 + idx * 6),
            baseY,
          });
        },
        undefined,
        () => {
          // Keep procedural sprite layers when optional image files are unavailable.
        },
      );
    });

    [0, 1, 2, 3].forEach((idx) => {
      const texture = this.createAssetflowSpriteTexture(idx);
      this.assetflowTextures.push(texture);
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: texture,
          transparent: true,
          depthWrite: false,
          depthTest: false,
          opacity: 0.42,
          blending: THREE.AdditiveBlending,
        }),
      );
      sprite.renderOrder = -10;
      const baseY = -1.1 + idx * 0.36;
      sprite.position.set(0, baseY, 0);
      this.assetflowGroup.add(sprite);
      this.assetflowSprites.push({
        sprite,
        phase: idx * Math.PI * 0.6,
        radius: 4.2 + idx * 2.1,
        speed: 0.14 + idx * 0.08,
        bin: idx === 0 ? 14 : idx === 1 ? 34 : idx === 2 ? 56 : 76,
        baseY,
      });
    });
  }

  private cloneAssetflowModel(template: THREE.Object3D) {
    const model = template.clone(true);
    model.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map((mat) => mat.clone());
      } else {
        mesh.material = mesh.material.clone();
      }
    });
    return model;
  }

  private applyAssetflowModelsToActors() {
    const templates = this.assetflowModelTemplates.filter((model): model is THREE.Object3D =>
      Boolean(model),
    );
    if (templates.length === 0) return;

    // Every actor gets the *same* model — a dozen instances of one shape
    // spinning reads as a cohesive formation, where one-of-each looked like a
    // random pile of unrelated objects. Which shape is randomized per build
    // (falling back to the first loaded template until the chosen one
    // arrives), so revisiting the view still offers variety.
    const template = this.assetflowModelTemplates[this.assetflowModelChoice] ?? templates[0]!;
    for (let i = 0; i < this.assetflowActors.length; i++) {
      const actor = this.assetflowActors[i]!;
      if (actor.model) {
        actor.root.remove(actor.model);
      }
      const model = this.cloneAssetflowModel(template);
      actor.model = model;
      actor.root.add(model);
    }
  }

  private createAssetflowSpriteTexture(index: number) {
    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, size, size);
      ctx.translate(size / 2, size / 2);

      if (index === 0) {
        ctx.strokeStyle = "rgba(0, 215, 255, 0.6)";
        ctx.lineWidth = 8;
        for (let y = -96; y <= 96; y += 48) {
          ctx.beginPath();
          for (let x = -240; x <= 240; x += 6) {
            const yy = y + Math.sin((x / 240) * Math.PI * 4) * 22;
            if (x === -240) ctx.moveTo(x, yy);
            else ctx.lineTo(x, yy);
          }
          ctx.stroke();
        }
      } else if (index === 1) {
        const grad = ctx.createRadialGradient(0, 0, 24, 0, 0, 220);
        grad.addColorStop(0, "rgba(184, 245, 255, 0.9)");
        grad.addColorStop(0.4, "rgba(77, 167, 255, 0.45)");
        grad.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, 220, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = "rgba(146, 237, 255, 0.45)";
        ctx.lineWidth = 6;
        [0, Math.PI * 0.25, Math.PI * 0.5, Math.PI * 0.75].forEach((a) => {
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * 220, Math.sin(a) * 220);
          ctx.lineTo(-Math.cos(a) * 220, -Math.sin(a) * 220);
          ctx.stroke();
        });
      } else if (index === 2) {
        const grad = ctx.createLinearGradient(-240, 0, 240, 0);
        grad.addColorStop(0, "rgba(50, 160, 255, 0)");
        grad.addColorStop(0.35, "rgba(96, 230, 255, 0.48)");
        grad.addColorStop(0.65, "rgba(195, 248, 255, 0.5)");
        grad.addColorStop(1, "rgba(50, 160, 255, 0)");
        ctx.strokeStyle = grad;
        ctx.lineWidth = 12;
        for (let y = -180; y <= 180; y += 36) {
          ctx.beginPath();
          ctx.moveTo(-240, y);
          ctx.bezierCurveTo(-120, y - 20, 120, y + 20, 240, y);
          ctx.stroke();
        }
      } else {
        const grad = ctx.createRadialGradient(0, 0, 40, 0, 0, 240);
        grad.addColorStop(0, "rgba(0, 0, 0, 0)");
        grad.addColorStop(0.35, "rgba(132, 206, 255, 0.22)");
        grad.addColorStop(0.7, "rgba(72, 188, 255, 0.34)");
        grad.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, 240, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = "rgba(170, 235, 255, 0.28)";
        ctx.lineWidth = 4;
        for (let i = 0; i < 7; i++) {
          const r = 60 + i * 24;
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
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

  private updateAssetflow(
    dt: number,
    time: number,
    audio: AudioBands,
    opts: {
      assetflowAmplitude: number;
      assetflowUsePalette: boolean;
      assetflowIncludeShapes: boolean;
      assetflowModelScale: number;
      assetflowSpriteAmount: number;
      assetflowModelCount: number;
      assetflowSpread: number;
      assetflowSpin: number;
      assetflowMovement: number;
      assetflowBackgroundDrift: number;
    },
  ) {
    const bins = audio.bins;
    const includeShapes = Boolean(opts.assetflowIncludeShapes);
    const modelCountInput = Number.isFinite(opts.assetflowModelCount)
      ? opts.assetflowModelCount
      : this.assetflowActors.length;
    const spreadInput = Number.isFinite(opts.assetflowSpread) ? opts.assetflowSpread : 4.7;
    const spinInput = Number.isFinite(opts.assetflowSpin) ? opts.assetflowSpin : 1;
    const movementInput = Number.isFinite(opts.assetflowMovement) ? opts.assetflowMovement : 0.7;
    const driftInput = Number.isFinite(opts.assetflowBackgroundDrift)
      ? opts.assetflowBackgroundDrift
      : 1;
    const ampInput = Number.isFinite(opts.assetflowAmplitude) ? opts.assetflowAmplitude : 1;
    const modelScaleInput = Number.isFinite(opts.assetflowModelScale)
      ? opts.assetflowModelScale
      : 1;
    const spriteAmountInput = Number.isFinite(opts.assetflowSpriteAmount)
      ? opts.assetflowSpriteAmount
      : 1;
    const amp = Math.max(0.05, ampInput);
    const modelScale = Math.max(0.2, modelScaleInput);
    const spriteAmount = Math.max(0.1, spriteAmountInput);
    const visibleCount = Math.max(
      1,
      Math.min(this.assetflowActors.length, Math.round(modelCountInput)),
    );
    const spread = Math.max(2, spreadInput);
    const spinControl = Math.max(0, spinInput);
    const movement = Math.max(0.05, movementInput);
    const movementFactor = 0.55 + movement * 0.5;
    const bgDrift = Math.max(0, driftInput);
    const beatPulse = audio.beat ? 1 : this.kick;
    const audioEnergy = THREE.MathUtils.clamp(
      audio.bass * 0.46 + audio.mid * 0.34 + audio.high * 0.2,
      0,
      1,
    );
    const activity = THREE.MathUtils.lerp(
      0.16,
      1,
      THREE.MathUtils.smoothstep(audioEnergy + beatPulse * 0.35, 0.1, 0.75),
    );
    const globalPathSpeed = (0.42 + audio.mid * 0.82 + audio.bpmConfidence * 0.56) * movementFactor;
    this.assetflowModelScale += (modelScale - this.assetflowModelScale) * Math.min(1, dt * 8);
    if (!Number.isFinite(this.assetflowModelScale)) {
      this.assetflowModelScale = 1;
    }

    for (let i = 0; i < this.assetflowActors.length; i++) {
      const actor = this.assetflowActors[i]!;
      actor.root.visible = i < visibleCount;
      if (!actor.root.visible) {
        actor.placeholder.visible = false;
        if (actor.model) actor.model.visible = false;
        continue;
      }
      const hasModel = Boolean(actor.model);
      actor.placeholder.visible = includeShapes || !hasModel;
      if (actor.model) actor.model.visible = true;
      const bin = normalizedBand(
        bins.length > 0 ? bins[Math.min(actor.bin, bins.length - 1)]! / 255 : 0,
      );
      const phase = time * actor.pathSpeed * globalPathSpeed * activity + actor.pathPhase;
      const radialBeat = 1 + beatPulse * 0.06 + audio.bass * 0.04;
      const pathRadius = spread * radialBeat;

      const baseX = Math.cos(actor.angle) * pathRadius;
      const baseZ = Math.sin(actor.angle) * pathRadius;
      const drift = (0.03 + movement * 0.14) * activity;
      const driftRate =
        actor.pathMode === "spiral" ? 0.32 : actor.pathMode === "lissajous" ? 0.28 : 0.24;
      const px = baseX + Math.sin(phase * driftRate + actor.pathPhase) * drift;
      const pz = baseZ + Math.cos(phase * (driftRate + 0.05) + actor.pathPhase) * drift;

      const horizontalFollow = Math.min(1, dt * (1.9 + movement * 1.15 + activity * 0.8));
      actor.root.position.x += (px - actor.root.position.x) * horizontalFollow;
      actor.root.position.z += (pz - actor.root.position.z) * horizontalFollow;

      const verticalOsc =
        (0.08 + movement * 0.18) * activity +
        Math.sin(phase * (1.05 + movement * 0.28) + actor.angle * 0.8) * (0.09 + 0.33 * activity);
      const lift =
        (verticalOsc +
          bin * (1.25 + movement * 0.42) * (0.52 + activity * 0.48) +
          audio.bass * (0.42 + movement * 0.34) * (0.5 + activity * 0.5) +
          beatPulse * (0.46 + movement * 0.34)) *
        amp;
      const targetY = actor.basePos.y + lift;
      actor.root.position.y +=
        (targetY - actor.root.position.y) * Math.min(1, dt * (3.2 + activity * 2.6));

      const spin =
        (0.15 +
          spinControl * (0.52 + movement * 0.34) +
          bin * (0.95 + movement * 0.65) +
          audio.mid * (0.6 + movement * 0.45) +
          audio.bpmConfidence * (0.45 + movement * 0.35)) *
        (0.25 + activity * 0.75) *
        dt;
      actor.root.rotateOnAxis(actor.spinAxis, spin);

      const pulse =
        0.72 +
        amp * (0.25 + movement * 0.11) +
        bin * (0.5 + movement * 0.22) +
        audio.high * (0.34 + movement * 0.11) +
        beatPulse * (0.22 + movement * 0.16) * (0.4 + activity * 0.6);
      const actorScale = actor.baseScale * this.assetflowModelScale * pulse;
      actor.root.scale.setScalar(Number.isFinite(actorScale) ? actorScale : actor.baseScale);

      const tint = opts.assetflowUsePalette
        ? this.colorAt(i / Math.max(1, this.assetflowActors.length - 1))
        : this.white;
      const tintHigh = this.colorAt((i + 0.35) / Math.max(1, this.assetflowActors.length));
      actor.root.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh || !mesh.material) return;
        const apply = (material: THREE.Material) => {
          const standard = material as THREE.MeshStandardMaterial;
          const hasTexture = Boolean(standard.map);
          if (standard.color) {
            if (hasTexture) standard.color.setRGB(1, 1, 1);
            else standard.color.copy(tint).lerp(this.white, 0.2);
          }
          if (standard.emissive) {
            if (hasTexture) standard.emissive.copy(tintHigh).multiplyScalar(0.25 + bin * 0.2);
            else standard.emissive.copy(tintHigh);
          }
          if (standard.emissiveIntensity !== undefined) {
            standard.emissiveIntensity = hasTexture
              ? 0.15 + bin * 0.4 + audio.bass * 0.25
              : 0.45 + bin * 1.2 + audio.bass * 0.45;
          }
        };
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(apply);
        } else {
          apply(mesh.material);
        }
      });
    }

    for (const layer of this.assetflowSprites) {
      const bin = bins.length > 0 ? bins[Math.min(layer.bin, bins.length - 1)]! / 255 : 0;
      const driftSpeed = layer.speed * (0.6 + bgDrift * 0.5 + audio.mid * 0.5);
      const orbit = layer.phase + time * driftSpeed;
      const radial =
        layer.radius +
        Math.sin(time * (0.45 + bgDrift * 0.25) + layer.phase) * (0.22 + bgDrift * 0.3);
      layer.sprite.position.set(
        Math.cos(orbit) * radial,
        layer.baseY +
          Math.sin(orbit * (0.35 + bgDrift * 0.22)) * (0.16 + bgDrift * 0.24) +
          bin * 0.7,
        Math.sin(orbit) * radial,
      );
      const scale = (6.2 + layer.radius * 0.6 + bin * 3 + audio.bass * 1.8) * spriteAmount;
      layer.sprite.scale.setScalar(Number.isFinite(scale) ? scale : 3.4);
      const mat = layer.sprite.material as THREE.SpriteMaterial;
      mat.opacity = THREE.MathUtils.clamp(
        0.08 + (0.14 + bin * 0.35 + audio.high * 0.2 + bgDrift * 0.08) * spriteAmount,
        0,
        1,
      );
      const spriteTint = opts.assetflowUsePalette ? this.colorAt(bin) : this.paletteThree[0];
      mat.color.copy(spriteTint).multiplyScalar(0.95 + audio.mid * 0.25);
      if (mat.map) {
        mat.map.offset.x = (time * 0.018 * (1 + audio.centroid)) % 1;
      }
    }

    if (this.assetflowBaseDisk) {
      const mat = this.assetflowBaseDisk.material as THREE.MeshStandardMaterial;
      mat.emissive.copy(this.paletteThree[2]).multiplyScalar(0.3 + audio.bass * 0.7);
      this.assetflowBaseDisk.rotation.y += dt * (0.05 + audio.high * 0.08);
    }
    if (this.assetflowLight) {
      this.assetflowLight.intensity = 2.1 + audio.bass * 2.4;
      this.assetflowLight.color.copy(this.paletteThree[1]).lerp(this.paletteThree[2], audio.high);
      this.assetflowLight.position.x = Math.sin(time * 0.55) * 2.2;
      this.assetflowLight.position.z = Math.cos(time * 0.45) * 2.4;
    }
  }

  resize(w: number, h: number) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    for (const ribbon of this.mandalaRibbons) {
      ribbon.material.resolution.set(w, h);
    }
    if (this.reztubeMat) {
      this.reztubeMat.resolution.set(w, h);
    }
  }

  dispose() {
    this.detachWebXrControllers();
    if (this.xrHudPanel) {
      this.xrHudPanel.geometry.dispose();
      this.xrHudPanel.material.dispose();
    }
    this.xrHudTexture?.dispose();
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
    // obsidian
    for (const s of this.obsidianShards) {
      s.mesh.geometry.dispose();
      s.mat.dispose();
    }
    this.obsidianShards = [];
    if (this.obsidianFloor) {
      this.obsidianFloor.geometry.dispose();
      (this.obsidianFloor.material as THREE.Material).dispose();
    }
    // torus
    if (this.torusMesh) {
      this.torusMesh.geometry.dispose();
      this.torusMat?.dispose();
    }
    if (this.torusParticles) {
      this.torusParticleGeo?.dispose();
      this.torusParticleMat?.dispose();
    }
    // sound wall
    if (this.soundwallPillars) {
      this.soundwallPillars.geometry.dispose();
      this.soundwallMat?.dispose();
    }
    // geometry nebula
    for (const s of this.geoNebulaMeshes) {
      s.mesh.geometry.dispose();
      s.mat.dispose();
    }
    this.geoNebulaMeshes = [];
    if (this.geoNebulaFloor) {
      this.geoNebulaFloor.geometry.dispose();
      (this.geoNebulaFloor.material as THREE.Material).dispose();
    }
    if (this.assetflowBaseDisk) {
      this.assetflowBaseDisk.geometry.dispose();
      (this.assetflowBaseDisk.material as THREE.Material).dispose();
    }
    for (const actor of this.assetflowActors) {
      actor.root.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        if (mesh.geometry) mesh.geometry.dispose();
        const material = mesh.material;
        if (Array.isArray(material)) {
          material.forEach((mat) => mat.dispose());
        } else if (material) {
          material.dispose();
        }
      });
    }
    for (const layer of this.assetflowSprites) {
      layer.sprite.material.dispose();
    }
    for (const texture of this.assetflowTextures) texture.dispose();
  }
}
