#!/usr/bin/env node
/**
 * Captures a thumbnail for every bundled look (default-saves.json) and,
 * optionally, full-size screenshots for the docs, from the running dev
 * server with a music file played in as the microphone.
 *
 *   npm run dev                       # in another terminal
 *   npm run capture:looks -- track.wav            # thumbnails only
 *   npm run capture:looks -- track.wav --docs 13  # plus docs shots of the first 13
 *
 * The WAV should be 48 kHz 16-bit and at least six minutes for a full run of
 * thumbnails. Uses your installed Chrome. Set CAPTURE_BROWSER to another
 * Playwright channel ("msedge", "chromium"), or CAPTURE_EXECUTABLE to the
 * path of any Chromium-based browser binary. Set CAPTURE_URL if the dev
 * server is not on http://localhost:6789/.
 */
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const [wavArg, ...rest] = process.argv.slice(2);
if (!wavArg) {
  console.error("usage: capture-looks.mjs <track.wav> [--docs <count>]");
  process.exit(1);
}
const wav = resolve(wavArg);
const docsCount = rest[0] === "--docs" ? Number(rest[1] ?? 0) : 0;
const url = process.env.CAPTURE_URL ?? "http://localhost:6789/";
const SETTLE_MS = 5200;

async function capture({ width, height, dir, prefix, count, quality }) {
  const browser = await chromium.launch({
    ...(process.env.CAPTURE_EXECUTABLE
      ? { executablePath: process.env.CAPTURE_EXECUTABLE }
      : { channel: process.env.CAPTURE_BROWSER ?? "chrome" }),
    headless: true,
    args: [
      "--enable-gpu",
      "--ignore-gpu-blocklist",
      // Headless Chrome on macOS falls back to software rendering without this.
      ...(process.platform === "darwin" ? ["--use-angle=metal"] : []),
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      `--use-file-for-fake-audio-capture=${wav}%noloop`,
    ],
  });
  const context = await browser.newContext({
    viewport: { width, height },
    permissions: ["microphone"],
  });
  const page = await context.newPage();
  // Browsers apply gain control and noise suppression to microphones by
  // default, which flattens music; ask for the raw signal.
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = () =>
      original({
        audio: { autoGainControl: false, echoCancellation: false, noiseSuppression: false },
      });
  });
  await page.goto(url, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  const store = await page.evaluateHandle(async () => {
    const resources = performance.getEntriesByType("resource").map((r) => r.name);
    const module = resources.find((name) => /analyser\/store\.ts/.test(name));
    return (await import(module)).settingsStore;
  });
  await store.evaluate((s) =>
    s.set({ ambientMode: false, viewCycleMode: false, slotCycleMode: false }),
  );
  await page.getByText("Use microphone", { exact: false }).first().click();
  await page.addStyleTag({
    content: "body * { visibility: hidden !important } canvas { visibility: visible !important }",
  });
  await page.waitForTimeout(9000); // let the tempo lock
  const slots = await store.evaluate((s) => s.getSlots().map((slot) => slot.thumb));
  const total = Math.min(slots.length, count);
  for (let i = 0; i < total; i++) {
    await store.evaluate((s, index) => s.loadSlot(index), i);
    await page.waitForTimeout(SETTLE_MS);
    const slug = slots[i].split("/").pop().replace(".jpg", "");
    await page.screenshot({ path: `${dir}/${prefix}${slug}.jpg`, type: "jpeg", quality });
  }
  await browser.close();
  console.log(`captured ${total} into ${dir}`);
}

await capture({
  width: 480,
  height: 270,
  dir: "public/assets/default-looks",
  prefix: "",
  count: Infinity,
  quality: 72,
});
if (docsCount > 0) {
  await capture({
    width: 1280,
    height: 720,
    dir: "docs/screenshots",
    prefix: "scene-",
    count: docsCount,
    quality: 86,
  });
}
