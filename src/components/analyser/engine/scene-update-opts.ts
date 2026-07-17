import type { Settings, WikichromaActorPack } from "../store";
import type { ViewMode } from "../visuals";

/** Mutable settings bag passed into Scene.update each frame — reused to avoid per-frame allocation. */
export type SceneUpdateOpts = {
  view: ViewMode;
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
  xrMode: boolean;
  xrBackgroundHidden: boolean;
  classicSpin: boolean;
  classicSpinSpeed: number;
  classicWireframe: boolean;
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
  nebulaWireframe: boolean;
  monolithUsePalette: boolean;
  monolithAmplitude: number;
  monolithBrightness: number;
  monolithGridSize: number;
  monolithWireframe: boolean;
  mandalaUsePalette: boolean;
  mandalaAmplitude: number;
  mandalaLineCount: number;
  mandalaLineWidth: number;
  terrainUsePalette: boolean;
  terrainAmplitude: number;
  terrainColumns: number;
  terrainWireframe: boolean;
  comboSphereSize: number;
  comboSphereSpinSpeed: number;
  comboSphereBassPunch: number;
  comboBarRadius: number;
  comboBarHeightScale: number;
  comboParticleSize: number;
  comboLevelMeter: boolean;
  comboWireframe: boolean;
  comboFullscreen: boolean;
  rippleFullscreen: boolean;
  datastreamFullscreen: boolean;
  nebulaFullscreen: boolean;
  monolithFullscreen: boolean;
  mandalaFullscreen: boolean;
  terrainFullscreen: boolean;
  obsidianFullscreen: boolean;
  obsidianUsePalette: boolean;
  obsidianAmplitude: number;
  obsidianShardDetail: number;
  torusFullscreen: boolean;
  torusUsePalette: boolean;
  torusAmplitude: number;
  torusParticleCount: number;
  torusSpeed: number;
  torusCount: number;
  torusSpacing: number;
  torusSize: number;
  torusParticleSize: number;
  torusColorMode: "shared" | "individual";
  torusRotationMode: "flat" | "odd-upright" | "alternating-x" | "alternating-z" | "fan";
  torusOddUpright: boolean;
  soundwallFullscreen: boolean;
  soundwallUsePalette: boolean;
  soundwallAmplitude: number;
  soundwallColumns: number;
  soundwallRows: number;
  geometrynebulaFullscreen: boolean;
  geometrynebulaUsePalette: boolean;
  geometrynebulaAmplitude: number;
  geometrynebulaCount: number;
  geometrynebulaSpread: number;
  geometrynebulaOrbitSpeed: number;
  geometrynebulaSpinSpeed: number;
  reztubeFullscreen: boolean;
  reztubeUsePalette: boolean;
  reztubeAmplitude: number;
  reztubeSpeed: number;
  reztubeTwist: number;
  reztubeRadius: number;
  reztubeSegments: number;
  reztubeLineWidth: number;
  assetflowFullscreen: boolean;
  assetflowUsePalette: boolean;
  assetflowIncludeShapes: boolean;
  assetflowAmplitude: number;
  assetflowModelScale: number;
  assetflowSpriteAmount: number;
  assetflowModelCount: number;
  assetflowSpread: number;
  assetflowSpin: number;
  assetflowMovement: number;
  assetflowBackgroundDrift: number;
  wikichromaFullscreen: boolean;
  wikichromaUsePalette: boolean;
  wikichromaAmplitude: number;
  wikichromaMotionMode: "orbit" | "cogs" | "runner";
  wikichromaMotionSpeed: number;
  wikichromaFlowStrength: number;
  wikichromaBeatsPerLoop: number;
  wikichromaActorPacks: readonly WikichromaActorPack[];
  stagelightsFullscreen: boolean;
  stagelightsUsePalette: boolean;
  stagelightsAmplitude: number;
  stagelightsSweepSpeed: number;
  stagelightsFixtureCount: number;
  stagelightsLasers: boolean;
  textOverlayEnabled: boolean;
  textOverlaySource: "public-domain" | "bofh";
  textOverlayStyle: "bounce" | "scroller" | "stack" | "orbit";
  textOverlayIntensity: number;
  textOverlayPhraseInterval: number;
  textOverlayAllCaps: boolean;
  textOverlayScramble: boolean;
  bgColor: string;
  performance: boolean;
};

export function createSceneUpdateOpts(initialView: ViewMode): SceneUpdateOpts {
  return {
    view: initialView,
    sphereDisp: 0,
    orbitSpeed: 0,
    peakDecay: 0,
    peakHold: 0,
    colorBands: false,
    blocky: false,
    segments: 0,
    grid: false,
    gridOpacity: 0,
    cameraDrift: false,
    cameraDriftAmount: 0,
    cameraBeat: false,
    cameraBeatAmount: 0,
    cameraMouse: false,
    xrMode: false,
    xrBackgroundHidden: false,
    classicSpin: false,
    classicSpinSpeed: 0,
    classicWireframe: false,
    classicFullscreen: false,
    peakColor: "#ffffff",
    peakStyle: "bar",
    rippleRingCount: 0,
    rippleColumns: 1,
    rippleMaxRadius: 0,
    rippleSpeed: 0,
    rippleAmplitude: 0,
    rippleWaveCycles: 0,
    rippleThickness: 0,
    rippleRotationSpeed: 0,
    rippleOpacity: 0,
    rippleWireframe: false,
    datastreamUsePalette: false,
    datastreamAmplitude: 0,
    datastreamItemCount: 0,
    nebulaUsePalette: false,
    nebulaAmplitude: 0,
    nebulaDetail: 0,
    nebulaWireframe: false,
    monolithUsePalette: false,
    monolithAmplitude: 0,
    monolithBrightness: 0,
    monolithGridSize: 0,
    monolithWireframe: false,
    mandalaUsePalette: false,
    mandalaAmplitude: 0,
    mandalaLineCount: 0,
    mandalaLineWidth: 0,
    terrainUsePalette: false,
    terrainAmplitude: 0,
    terrainColumns: 0,
    terrainWireframe: false,
    comboSphereSize: 0,
    comboSphereSpinSpeed: 0,
    comboSphereBassPunch: 0,
    comboBarRadius: 0,
    comboBarHeightScale: 0,
    comboParticleSize: 0,
    comboLevelMeter: false,
    comboWireframe: false,
    comboFullscreen: false,
    rippleFullscreen: false,
    datastreamFullscreen: false,
    nebulaFullscreen: false,
    monolithFullscreen: false,
    mandalaFullscreen: false,
    terrainFullscreen: false,
    obsidianFullscreen: false,
    obsidianUsePalette: false,
    obsidianAmplitude: 0,
    obsidianShardDetail: 0,
    torusFullscreen: false,
    torusUsePalette: false,
    torusAmplitude: 0,
    torusParticleCount: 0,
    torusSpeed: 0,
    torusCount: 0,
    torusSpacing: 0,
    torusSize: 0,
    torusParticleSize: 0,
    torusColorMode: "shared",
    torusRotationMode: "flat",
    torusOddUpright: false,
    soundwallFullscreen: false,
    soundwallUsePalette: false,
    soundwallAmplitude: 0,
    soundwallColumns: 0,
    soundwallRows: 0,
    geometrynebulaFullscreen: false,
    geometrynebulaUsePalette: false,
    geometrynebulaAmplitude: 0,
    geometrynebulaCount: 0,
    geometrynebulaSpread: 0,
    geometrynebulaOrbitSpeed: 0,
    geometrynebulaSpinSpeed: 0,
    reztubeFullscreen: false,
    reztubeUsePalette: false,
    reztubeAmplitude: 0,
    reztubeSpeed: 0,
    reztubeTwist: 0,
    reztubeRadius: 0,
    reztubeSegments: 0,
    reztubeLineWidth: 0,
    assetflowFullscreen: false,
    assetflowUsePalette: false,
    assetflowIncludeShapes: false,
    assetflowAmplitude: 0,
    assetflowModelScale: 0,
    assetflowSpriteAmount: 0,
    assetflowModelCount: 0,
    assetflowSpread: 0,
    assetflowSpin: 0,
    assetflowMovement: 0,
    assetflowBackgroundDrift: 0,
    wikichromaFullscreen: false,
    wikichromaUsePalette: false,
    wikichromaAmplitude: 0,
    wikichromaMotionMode: "orbit",
    wikichromaMotionSpeed: 0,
    wikichromaFlowStrength: 1,
    wikichromaBeatsPerLoop: 2,
    wikichromaActorPacks: [],
    stagelightsFullscreen: false,
    stagelightsUsePalette: false,
    stagelightsAmplitude: 0,
    stagelightsSweepSpeed: 0,
    stagelightsFixtureCount: 3,
    stagelightsLasers: false,
    textOverlayEnabled: false,
    textOverlaySource: "public-domain",
    textOverlayStyle: "bounce",
    textOverlayIntensity: 0,
    textOverlayPhraseInterval: 6,
    textOverlayAllCaps: false,
    textOverlayScramble: false,
    bgColor: "#000000",
    performance: false,
  };
}

export function syncSceneUpdateOpts(
  o: SceneUpdateOpts,
  s: Settings,
  displayedView: ViewMode,
  xrActive: boolean,
  xrBackgroundHidden: boolean,
): void {
  const perfCap = s.performance || xrActive;
  o.view = displayedView;
  o.sphereDisp = s.sphereDisplacement;
  o.orbitSpeed = s.orbitSpeed;
  o.peakDecay = s.classicPeakDecay;
  o.peakHold = s.classicPeakHold;
  o.colorBands = s.classicColorBands;
  o.blocky = s.classicBlocky;
  o.segments = s.classicSegments;
  o.grid = s.classicGrid;
  o.gridOpacity = s.classicGridOpacity;
  o.cameraDrift = s.cameraDrift;
  o.cameraDriftAmount = s.cameraDriftAmount;
  o.cameraBeat = s.cameraBeat;
  o.cameraBeatAmount = s.cameraBeatAmount;
  o.cameraMouse = s.cameraMouse;
  o.xrMode = xrActive;
  o.xrBackgroundHidden = xrBackgroundHidden;
  o.classicSpin = s.classicSpin;
  o.classicSpinSpeed = s.classicSpinSpeed;
  o.classicWireframe = s.classicWireframe;
  o.classicFullscreen = s.classicFullscreen;
  o.peakColor = s.classicPeakColor;
  o.peakStyle = s.classicPeakStyle;
  o.rippleRingCount = perfCap ? Math.min(s.rippleRingCount, 72) : s.rippleRingCount;
  o.rippleColumns = s.rippleColumns;
  o.rippleMaxRadius = s.rippleMaxRadius;
  o.rippleSpeed = s.rippleSpeed;
  o.rippleAmplitude = s.rippleAmplitude;
  o.rippleWaveCycles = s.rippleWaveCycles;
  o.rippleThickness = s.rippleThickness;
  o.rippleRotationSpeed = s.rippleRotationSpeed;
  o.rippleOpacity = s.rippleOpacity;
  o.rippleWireframe = s.rippleWireframe;
  o.datastreamUsePalette = s.datastreamUsePalette;
  o.datastreamAmplitude = s.datastreamAmplitude;
  o.datastreamItemCount = s.datastreamItemCount;
  o.nebulaUsePalette = s.nebulaUsePalette;
  o.nebulaAmplitude = s.nebulaAmplitude;
  o.nebulaDetail = s.nebulaDetail;
  o.nebulaWireframe = s.nebulaWireframe;
  o.monolithUsePalette = s.monolithUsePalette;
  o.monolithAmplitude = s.monolithAmplitude;
  o.monolithBrightness = s.monolithBrightness;
  o.monolithGridSize = s.monolithGridSize;
  o.monolithWireframe = s.monolithWireframe;
  o.mandalaUsePalette = s.mandalaUsePalette;
  o.mandalaAmplitude = s.mandalaAmplitude;
  o.mandalaLineCount = perfCap ? Math.min(s.mandalaLineCount, 24) : s.mandalaLineCount;
  o.mandalaLineWidth = s.mandalaLineWidth;
  o.terrainUsePalette = s.terrainUsePalette;
  o.terrainAmplitude = s.terrainAmplitude;
  o.terrainColumns = s.terrainColumns;
  o.terrainWireframe = s.terrainWireframe;
  o.rippleFullscreen = s.rippleFullscreen;
  o.datastreamFullscreen = s.datastreamFullscreen;
  o.nebulaFullscreen = s.nebulaFullscreen;
  o.monolithFullscreen = s.monolithFullscreen;
  o.mandalaFullscreen = s.mandalaFullscreen;
  o.terrainFullscreen = s.terrainFullscreen;
  o.obsidianFullscreen = s.obsidianFullscreen;
  o.obsidianUsePalette = s.obsidianUsePalette;
  o.obsidianAmplitude = s.obsidianAmplitude;
  o.obsidianShardDetail = s.obsidianShardDetail;
  o.torusFullscreen = s.torusFullscreen;
  o.torusUsePalette = s.torusUsePalette;
  o.torusAmplitude = s.torusAmplitude;
  o.torusParticleCount = s.torusParticleCount;
  o.torusSpeed = s.torusSpeed;
  o.torusCount = s.torusCount;
  o.torusSpacing = s.torusSpacing;
  o.torusSize = s.torusSize;
  o.torusParticleSize = s.torusParticleSize;
  o.torusColorMode = s.torusColorMode;
  o.torusRotationMode = s.torusRotationMode;
  o.torusOddUpright = s.torusOddUpright;
  o.soundwallFullscreen = s.soundwallFullscreen;
  o.soundwallUsePalette = s.soundwallUsePalette;
  o.soundwallAmplitude = s.soundwallAmplitude;
  o.soundwallColumns = s.soundwallColumns;
  o.soundwallRows = s.soundwallRows;
  o.geometrynebulaFullscreen = s.geometrynebulaFullscreen;
  o.geometrynebulaUsePalette = s.geometrynebulaUsePalette;
  o.geometrynebulaAmplitude = s.geometrynebulaAmplitude;
  o.geometrynebulaCount = s.geometrynebulaCount;
  o.geometrynebulaSpread = s.geometrynebulaSpread;
  o.geometrynebulaOrbitSpeed = s.geometrynebulaOrbitSpeed;
  o.geometrynebulaSpinSpeed = s.geometrynebulaSpinSpeed;
  o.reztubeFullscreen = s.reztubeFullscreen;
  o.reztubeUsePalette = s.reztubeUsePalette;
  o.reztubeAmplitude = s.reztubeAmplitude;
  o.reztubeSpeed = s.reztubeSpeed;
  o.reztubeTwist = s.reztubeTwist;
  o.reztubeRadius = s.reztubeRadius;
  o.reztubeSegments = s.reztubeSegments;
  o.reztubeLineWidth = s.reztubeLineWidth;
  o.assetflowFullscreen = s.assetflowFullscreen;
  o.assetflowUsePalette = s.assetflowUsePalette;
  o.assetflowIncludeShapes = s.assetflowIncludeShapes;
  o.assetflowAmplitude = s.assetflowAmplitude;
  o.assetflowModelScale = s.assetflowModelScale;
  o.assetflowSpriteAmount = s.assetflowSpriteAmount;
  o.assetflowModelCount = s.assetflowModelCount;
  o.assetflowSpread = s.assetflowSpread;
  o.assetflowSpin = s.assetflowSpin;
  o.assetflowMovement = s.assetflowMovement;
  o.assetflowBackgroundDrift = s.assetflowBackgroundDrift;
  o.wikichromaFullscreen = s.wikichromaFullscreen;
  o.wikichromaUsePalette = s.wikichromaUsePalette;
  o.wikichromaAmplitude = s.wikichromaAmplitude;
  o.wikichromaMotionMode = s.wikichromaMotionMode;
  o.wikichromaMotionSpeed = s.wikichromaMotionSpeed;
  o.wikichromaFlowStrength = s.wikichromaFlowStrength;
  o.wikichromaBeatsPerLoop = s.wikichromaBeatsPerLoop;
  o.wikichromaActorPacks = s.wikichromaActorPacks;
  o.stagelightsFullscreen = s.stagelightsFullscreen;
  o.stagelightsUsePalette = s.stagelightsUsePalette;
  o.stagelightsAmplitude = s.stagelightsAmplitude;
  o.stagelightsSweepSpeed = s.stagelightsSweepSpeed;
  o.stagelightsFixtureCount = s.stagelightsFixtureCount;
  o.stagelightsLasers = s.stagelightsLasers;
  o.textOverlayEnabled = s.textOverlayEnabled;
  o.textOverlaySource = s.textOverlaySource;
  o.textOverlayStyle = s.textOverlayStyle;
  o.textOverlayIntensity = s.textOverlayIntensity;
  o.textOverlayPhraseInterval = s.textOverlayPhraseInterval;
  o.textOverlayAllCaps = s.textOverlayAllCaps;
  o.textOverlayScramble = s.textOverlayScramble;
  o.comboSphereSize = s.comboSphereSize;
  o.comboSphereSpinSpeed = s.comboSphereSpinSpeed;
  o.comboSphereBassPunch = s.comboSphereBassPunch;
  o.comboBarRadius = s.comboBarRadius;
  o.comboBarHeightScale = s.comboBarHeightScale;
  o.comboParticleSize = s.comboParticleSize;
  o.comboLevelMeter = s.comboLevelMeter;
  o.comboWireframe = s.comboWireframe;
  o.comboFullscreen = s.comboFullscreen;
  o.bgColor = s.bgColor;
  o.performance = s.performance;
}
