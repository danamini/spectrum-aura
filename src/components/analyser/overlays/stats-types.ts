import type { AssetOverlayDebugState } from "@spectrum-aura/engine/composer";

export type NerdStats = {
  fps: number;
  frameMs: number;
  updates: number;
  uptimeSec: number;
  fpsHistory: number[];
  drawCalls: number;
  drawCallsHistory: number[];
  triangles: number;
  trianglesHistory: number[];
  lines: number;
  points: number;
  geometries: number;
  textures: number;
  programs: number;
  objects: number;
  pixelRatio: number;
  bufferWidth: number;
  bufferHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  heapMb: number;
  audioRunning: boolean;
  sampleRate: number;
  fftSize: number;
  smoothing: number;
  gain: number;
  bass: number;
  bassHistory: number[];
  mid: number;
  midHistory: number[];
  high: number;
  highHistory: number[];
  centroid: number;
  beat: boolean;
  bpm: number;
  bpmConfidence: number;
  audioReadCpuMs: number;
  audioToSceneMs: number;
  sceneToRenderMs: number;
  audioToRenderMs: number;
  signalToRenderMs: number;
  baseLatencyMs: number;
  fftWindowMs: number;
  assetOverlayEnabled: boolean;
  assetOverlayBias: "mixed" | "technical" | "organic" | "chaotic";
  assetOverlayCommonsEnabled: boolean;
  assetOverlayCommonsTopic: "abstract" | "technical" | "organic";
  assetOverlayCurrentFamilies: [string, string, string];
  assetOverlayNextFamilies: [string, string, string];
  assetOverlayCurrentEntries: AssetOverlayDebugState["currentEntries"];
  assetOverlayTransition: number;
  textOverlayEnabled: boolean;
  textOverlaySourceLabel: string;
  textOverlayCurrentText: string;
  textOverlayAuthor: string;
  textOverlayWork: string;
  textOverlayRights: string;
  textOverlayCreditLine: string;
  textOverlaySourceUrl: string;
  wikichromaActive: boolean;
  wikichromaMode: string;
  wikichromaSelectedPacks: string[];
  wikichromaActiveModels: string[];
  wikichromaActorsActive: number;
  wikichromaBeatLocked: boolean;
  wikichromaBeatsPerLoop: number;
  wikichromaLoopCount: number;
};

export const EMPTY_STATS: NerdStats = {
  fps: 0,
  frameMs: 0,
  updates: 0,
  uptimeSec: 0,
  fpsHistory: [],
  drawCalls: 0,
  drawCallsHistory: [],
  triangles: 0,
  trianglesHistory: [],
  lines: 0,
  points: 0,
  geometries: 0,
  textures: 0,
  programs: 0,
  objects: 0,
  pixelRatio: 0,
  bufferWidth: 0,
  bufferHeight: 0,
  canvasWidth: 0,
  canvasHeight: 0,
  heapMb: 0,
  audioRunning: false,
  sampleRate: 0,
  fftSize: 0,
  smoothing: 0,
  gain: 0,
  bass: 0,
  bassHistory: [],
  mid: 0,
  midHistory: [],
  high: 0,
  highHistory: [],
  centroid: 0,
  beat: false,
  bpm: 0,
  bpmConfidence: 0,
  audioReadCpuMs: 0,
  audioToSceneMs: 0,
  sceneToRenderMs: 0,
  audioToRenderMs: 0,
  signalToRenderMs: 0,
  baseLatencyMs: 0,
  fftWindowMs: 0,
  assetOverlayEnabled: false,
  assetOverlayBias: "mixed",
  assetOverlayCommonsEnabled: false,
  assetOverlayCommonsTopic: "abstract",
  assetOverlayCurrentFamilies: ["n/a", "n/a", "n/a"],
  assetOverlayNextFamilies: ["n/a", "n/a", "n/a"],
  assetOverlayCurrentEntries: [
    { label: "n/a", family: "n/a", creditLine: "", sourceUrl: "" },
    { label: "n/a", family: "n/a", creditLine: "", sourceUrl: "" },
    { label: "n/a", family: "n/a", creditLine: "", sourceUrl: "" },
  ],
  assetOverlayTransition: 1,
  textOverlayEnabled: false,
  textOverlaySourceLabel: "",
  textOverlayCurrentText: "",
  textOverlayAuthor: "",
  textOverlayWork: "",
  textOverlayRights: "",
  textOverlayCreditLine: "",
  textOverlaySourceUrl: "",
  wikichromaActive: false,
  wikichromaMode: "orbit",
  wikichromaSelectedPacks: [],
  wikichromaActiveModels: [],
  wikichromaActorsActive: 0,
  wikichromaBeatLocked: false,
  wikichromaBeatsPerLoop: 2,
  wikichromaLoopCount: 0,
};

export type LatencyHudState = {
  audioToRenderMs: number;
  signalToRenderMs: number;
  audioToSceneMs: number;
  sceneToRenderMs: number;
  performanceMode: boolean;
};

export const EMPTY_LATENCY_HUD: LatencyHudState = {
  audioToRenderMs: 0,
  signalToRenderMs: 0,
  audioToSceneMs: 0,
  sceneToRenderMs: 0,
  performanceMode: false,
};
