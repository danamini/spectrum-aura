/**
 * Aura UI Kit example — the engine package driving ordinary UI.
 *
 * The whole integration is: read `AudioBands` once per frame, publish the
 * interesting numbers as CSS custom properties on <html>, and let plain CSS
 * decide what glows, scales, or fills. Palettes come from the same catalog
 * the visualizer uses, so a brand/theme stays coordinated across apps.
 */
import { AudioEngine } from "@spectrum-aura/engine/audio";
import { PALETTES } from "@spectrum-aura/engine/settings";

const EQ_BAR_COUNT = 24;
/** Same default the visualizer uses for `Settings.beatSensitivity`. */
const BEAT_THRESHOLD = 1.4;
/** Beat flash decay, in pulse-units per second. */
const BEAT_DECAY = 3.5;

function query<T extends HTMLElement>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`missing element: ${selector}`);
  return el;
}

const root = document.documentElement;
const engine = new AudioEngine();

// Start on the Vaporwave palette; the button cycles through the catalog.
let paletteIndex = Math.max(
  0,
  PALETTES.findIndex((p) => p.name === "Vaporwave"),
);

function applyPalette() {
  const palette = PALETTES[paletteIndex] ?? PALETTES[0];
  palette.colors.forEach((color, i) => root.style.setProperty(`--aura-${i}`, color));
  query("#palette-name").textContent = palette.name;
}

const eqBars: HTMLDivElement[] = [];
const eq = query("#eq");
for (let i = 0; i < EQ_BAR_COUNT; i += 1) {
  const bar = document.createElement("div");
  eq.appendChild(bar);
  eqBars.push(bar);
}

let beatPulse = 0;
let lastTime = performance.now();

function frame(now: number) {
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  const bands = engine.read(BEAT_THRESHOLD);
  beatPulse = bands.beat ? 1 : Math.max(0, beatPulse - dt * BEAT_DECAY);

  root.style.setProperty("--bass", bands.bass.toFixed(3));
  root.style.setProperty("--mid", bands.mid.toFixed(3));
  root.style.setProperty("--high", bands.high.toFixed(3));
  root.style.setProperty("--beat", beatPulse.toFixed(3));

  // Mini equalizer: sample the lower half of the FFT bins across the bars.
  const bins = bands.bins;
  if (bins.length > 0) {
    for (let i = 0; i < eqBars.length; i += 1) {
      const bin = bins[Math.floor((i / eqBars.length) * bins.length * 0.5)] ?? 0;
      eqBars[i].style.transform = `scaleY(${Math.max(0.06, bin / 255).toFixed(3)})`;
    }
  }

  query("#bpm").textContent =
    bands.bpm > 0 && bands.bpmConfidence > 0.5 ? `${Math.round(bands.bpm)} BPM` : "— BPM";
  query("#beat-dot").textContent = beatPulse > 0.4 ? "●" : "○";

  requestAnimationFrame(frame);
}

async function start(kind: "mic" | "tab") {
  const errorEl = query("#start-error");
  errorEl.classList.add("hidden");
  try {
    if (kind === "mic") await engine.startMic();
    else await engine.startSystem();
    query("#start-overlay").classList.add("hidden");
    lastTime = performance.now();
    requestAnimationFrame(frame);
  } catch (error) {
    errorEl.textContent = error instanceof Error ? error.message : String(error);
    errorEl.classList.remove("hidden");
  }
}

query("#start-mic").addEventListener("click", () => void start("mic"));
query("#start-tab").addEventListener("click", () => void start("tab"));
query("#palette-btn").addEventListener("click", () => {
  paletteIndex = (paletteIndex + 1) % PALETTES.length;
  applyPalette();
});

applyPalette();
