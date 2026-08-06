/**
 * Aura Video Loop — the engine package as a VJ deck for video.
 *
 * Local files: a Three.js video-texture plane rendered through the engine's
 * real `Composer`, so the curated presets (VHS Dream, CRT Arcade, Broken
 * Transmission…) apply their full post-FX chains, driven per-frame by
 * `AudioBands`. YouTube: the embed is cross-origin, so the same bands drive
 * CSS filters and overlay layers instead, with share-tab audio capture.
 */
import * as THREE from "three";
import { AudioEngine } from "@spectrum-aura/engine/audio";
import { Composer, type PostFxReactiveState } from "@spectrum-aura/engine/composer";
import { OverlayFx, gradingToCssFilter } from "@spectrum-aura/engine/overlay-fx";
import { DEFAULT_SETTINGS, PRESETS, type Settings } from "@spectrum-aura/engine/settings";

const LOOKS = [
  "VHS Dream",
  "Vaporwave Sunset",
  "Mallsoft Haze",
  "Broken Transmission",
  "CRT Arcade",
  "Spectrum Clash",
  "PETSCII Terminal",
  "16mm Projector",
] as const;

const BEAT_THRESHOLD = 1.4;
const BEAT_DECAY = 3.2;
const CAMERA_FOV = 50;
const CAMERA_DIST = 6;

function query<T extends HTMLElement>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`missing element: ${selector}`);
  return el;
}

const root = document.documentElement;
const engine = new AudioEngine();
const video = document.createElement("video");
video.loop = true;
video.playsInline = true;

let look: Settings = { ...DEFAULT_SETTINGS, ...PRESETS[LOOKS[0]] };
let renderer: THREE.WebGLRenderer | null = null;
let composer: Composer | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let plane: THREE.Mesh | null = null;
let mode: "none" | "local" | "youtube" = "none";
let overlayFx: OverlayFx | null = null;
let beatPulse = 0;
let lastTime = performance.now();
let rafStarted = false;

function applyLook(name: (typeof LOOKS)[number]) {
  look = { ...DEFAULT_SETTINGS, ...PRESETS[name], postFxEnabled: true, performance: false };
  renderer?.setClearColor(look.bgColor, 1);
  document.querySelectorAll<HTMLButtonElement>("#preset-row .btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.look === name);
  });
}

function layoutPlane() {
  if (!camera || !plane || video.videoWidth === 0) return;
  const viewH = 2 * CAMERA_DIST * Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2));
  const viewW = viewH * camera.aspect;
  const videoAspect = video.videoWidth / video.videoHeight;
  // Cover-fit: fill the viewport, cropping whichever axis overflows.
  let planeH = viewH;
  let planeW = planeH * videoAspect;
  if (planeW < viewW) {
    planeW = viewW;
    planeH = planeW / videoAspect;
  }
  plane.scale.set(planeW, planeH, 1);
}

function ensureLocalPipeline() {
  if (renderer) return;
  const stage = query("#local-stage");
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(look.bgColor, 1);
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(CAMERA_FOV, width / height, 0.1, 100);
  camera.position.z = CAMERA_DIST;

  const texture = new THREE.VideoTexture(video);
  texture.colorSpace = THREE.SRGBColorSpace;
  plane = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: texture }),
  );
  scene.add(plane);

  composer = new Composer(renderer, scene, camera, width, height);

  window.addEventListener("resize", () => {
    if (!renderer || !camera || !composer) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    composer.resize(w, h);
    layoutPlane();
  });
}

function setMode(next: "local" | "youtube") {
  mode = next;
  query("#local-stage").classList.toggle("hidden", next !== "local");
  query("#youtube-stage").classList.toggle("hidden", next !== "youtube");
  query("#intro").classList.add("hidden");
  query("#mode-label").textContent =
    next === "local" ? "local · composer FX" : "youtube · engine overlay FX";
  if (next === "youtube") {
    video.pause();
    if (!overlayFx) {
      overlayFx = new OverlayFx(
        query<HTMLCanvasElement>("#overlay-fx"),
        window.innerWidth,
        window.innerHeight,
      );
      window.addEventListener("resize", () =>
        overlayFx?.resize(window.innerWidth, window.innerHeight),
      );
    }
  }
}

function startFrameLoop() {
  if (rafStarted) return;
  rafStarted = true;
  lastTime = performance.now();
  requestAnimationFrame(frame);
}

function frame(now: number) {
  const dt = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;
  const bands = engine.read(BEAT_THRESHOLD);
  beatPulse = bands.beat ? 1 : Math.max(0, beatPulse - dt * BEAT_DECAY);

  root.style.setProperty("--bass", bands.bass.toFixed(3));
  root.style.setProperty("--mid", bands.mid.toFixed(3));
  root.style.setProperty("--high", bands.high.toFixed(3));
  root.style.setProperty("--beat", beatPulse.toFixed(3));
  query("#bpm").textContent =
    bands.bpm > 0 && bands.bpmConfidence > 0.5 ? `${Math.round(bands.bpm)} BPM` : "— BPM";
  query("#beat-dot").textContent = beatPulse > 0.4 ? "●" : "○";

  if (mode === "local" && composer && camera) {
    const reactive: PostFxReactiveState = {
      bass: bands.bass,
      mid: bands.mid,
      high: bands.high,
      centroid: bands.centroid,
      beat: bands.beat,
      bpm: bands.bpm,
      bpmConfidence: bands.bpmConfidence,
      pulse: beatPulse,
      performance: false,
      qualityTier: 0,
    };
    camera.position.z = CAMERA_DIST - 0.14 * beatPulse;
    composer.apply(look, reactive);
    composer.render(dt);
  }
  if (mode === "youtube" && overlayFx) {
    // Same look, engine-rendered: texture FX on the overlay canvas, grading
    // as a CSS filter on the cross-origin iframe.
    overlayFx.render(look, beatPulse, now / 1000);
    const iframe = document.querySelector<HTMLIFrameElement>("#youtube-frame-slot iframe");
    if (iframe)
      iframe.style.filter = gradingToCssFilter(look, { bass: bands.bass, beat: beatPulse });
  }
  requestAnimationFrame(frame);
}

function extractYouTubeId(url: string): string | null {
  const match = url.match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/)([\w-]{11})/);
  return match?.[1] ?? null;
}

async function startAudio(kind: "video" | "tab" | "mic") {
  try {
    if (kind === "video") {
      const capturable = video as HTMLVideoElement & { captureStream?: () => MediaStream };
      const stream = capturable.captureStream?.();
      if (!stream) throw new Error("This browser cannot capture the video element's audio.");
      engine.startStream(stream);
    } else if (kind === "tab") {
      await engine.startSystem();
    } else {
      await engine.startMic();
    }
    startFrameLoop();
    ["#audio-video", "#audio-tab", "#audio-mic"].forEach((sel) =>
      query(sel).classList.toggle("active", sel.includes(kind)),
    );
  } catch (error) {
    query("#mode-label").textContent =
      error instanceof Error ? error.message : "audio capture failed";
  }
}

query("#pick-video").addEventListener("click", () => query("#file-input").click());
query<HTMLInputElement>("#file-input").addEventListener("change", (event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  ensureLocalPipeline();
  video.src = URL.createObjectURL(file);
  void video.play().then(() => {
    layoutPlane();
    setMode("local");
    void startAudio("video");
  });
});

query("#load-yt").addEventListener("click", () => {
  const id = extractYouTubeId(query<HTMLInputElement>("#yt-url").value.trim());
  if (!id) {
    query("#mode-label").textContent = "could not read a YouTube video id from that URL";
    return;
  }
  const slot = query("#youtube-frame-slot");
  slot.innerHTML = "";
  const iframe = document.createElement("iframe");
  // Plain youtube.com host: the nocookie domain hits "An error occurred"
  // under Edge/Chrome strict tracking prevention.
  iframe.src = `https://www.youtube.com/embed/${id}?autoplay=1&playsinline=1&loop=1&playlist=${id}`;
  iframe.allow = "autoplay; encrypted-media; picture-in-picture";
  iframe.allowFullscreen = true;
  slot.appendChild(iframe);
  setMode("youtube");
  startFrameLoop();
});

query("#audio-video").addEventListener("click", () => void startAudio("video"));
query("#audio-tab").addEventListener("click", () => void startAudio("tab"));
query("#audio-mic").addEventListener("click", () => void startAudio("mic"));

const presetRow = query("#preset-row");
for (const name of LOOKS) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn";
  btn.dataset.look = name;
  btn.textContent = name;
  btn.addEventListener("click", () => applyLook(name));
  presetRow.appendChild(btn);
}
applyLook(LOOKS[0]);
