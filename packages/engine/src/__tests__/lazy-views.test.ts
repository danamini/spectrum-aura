import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { AmbientSource } from "../ambient-source";
import { createSceneUpdateOpts, syncSceneUpdateOpts } from "../scene-update-opts";
import { DEFAULT_SETTINGS } from "../settings";
import { LAZY_VIEW_IDLE_DISPOSE_SECONDS, Scene } from "../scene";
import { VISUALS } from "../visuals";

const LAZY_IDS = [
  "outrun",
  "globe",
  "spectrotunnel",
  "fractal",
  "blackhole",
  "neoncity",
  "ocean",
  "nightwood",
  "desert",
  "station",
  "aurora",
  "hifi",
  "lab",
  "tapedeck",
] as const;

beforeEach(() => {
  const context = new Proxy(
    {
      createLinearGradient: () => ({ addColorStop: vi.fn() }),
      createRadialGradient: () => ({ addColorStop: vi.fn() }),
      measureText: () => ({ width: 100 }),
    },
    { get: (target, key) => Reflect.get(target, key) ?? vi.fn() },
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(THREE.TextureLoader.prototype, "load").mockImplementation(() => new THREE.Texture());
  vi.spyOn(GLTFLoader.prototype, "load").mockImplementation(() => {});
  // The Globe must not reach the network from a unit test.
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("offline"))),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function frame(scene: Scene, view: string, dt = 1 / 60, settings = DEFAULT_SETTINGS) {
  const opts = createSceneUpdateOpts(view);
  syncSceneUpdateOpts(opts, { ...settings, view }, view, false, false);
  scene.update(dt, 1, new AmbientSource().read(1000), opts);
}

function collect(root: THREE.Object3D) {
  const resources = new Set<{ dispose: () => void }>();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry && !(object instanceof THREE.Sprite)) resources.add(mesh.geometry);
    for (const material of [mesh.material].flat()) if (material) resources.add(material);
  });
  return [...resources];
}

describe("lazy views", () => {
  it("registers every lazy view with a scene holder", () => {
    const scene = new Scene(640, 480);
    for (const id of LAZY_IDS) {
      const visual = VISUALS.find((v) => v.id === id);
      expect(visual?.sceneGroupKey, id).toBeDefined();
      const holder = (scene as unknown as Record<string, unknown>)[visual!.sceneGroupKey!];
      expect(holder, id).toBeInstanceOf(THREE.Group);
    }
    scene.dispose();
  });

  it("allocates nothing until a view is first shown", () => {
    const scene = new Scene(640, 480);
    expect(scene.getBuiltLazyViews()).toEqual([]);
    for (const id of LAZY_IDS) {
      const holder = (scene as unknown as Record<string, THREE.Group>)[`${id}Group`]!;
      expect(holder.children, id).toHaveLength(0);
    }
    frame(scene, "combo");
    expect(scene.getBuiltLazyViews()).toEqual([]);
    scene.dispose();
  });

  it.each(LAZY_IDS)("builds, renders and shows %s on activation", (id) => {
    const scene = new Scene(640, 480);
    frame(scene, id);
    frame(scene, id);
    const holder = (scene as unknown as Record<string, THREE.Group>)[`${id}Group`]!;
    expect(scene.getBuiltLazyViews()).toEqual([id]);
    expect(holder.visible).toBe(true);
    expect(collect(holder).length).toBeGreaterThan(0);
    expect(Number.isFinite(scene.camera.position.length())).toBe(true);
    scene.dispose();
  });

  it("keeps a view through a short absence and frees it after the idle window", () => {
    const scene = new Scene(640, 480);
    frame(scene, "outrun");
    const holder = scene.outrunGroup;
    const disposals = collect(holder).map((resource) => vi.spyOn(resource, "dispose"));
    expect(disposals.length).toBeGreaterThan(0);

    // Just under the window: still built, so cycling back reuses it.
    const step = 0.05;
    const framesToWindow = Math.ceil(LAZY_VIEW_IDLE_DISPOSE_SECONDS / step);
    for (let i = 0; i < framesToWindow - 2; i++) frame(scene, "combo", step);
    expect(scene.getBuiltLazyViews()).toEqual(["outrun"]);
    expect(disposals.every((spy) => spy.mock.calls.length === 0)).toBe(true);

    // Returning resets the clock.
    frame(scene, "outrun", step);
    for (let i = 0; i < framesToWindow - 2; i++) frame(scene, "combo", step);
    expect(scene.getBuiltLazyViews()).toEqual(["outrun"]);

    for (let i = 0; i < 4; i++) frame(scene, "combo", step);
    expect(scene.getBuiltLazyViews()).toEqual([]);
    expect(holder.children).toHaveLength(0);
    expect(disposals.filter((spy) => spy.mock.calls.length === 0)).toEqual([]);
    scene.dispose();
  });

  it("releases built views and cancels Globe requests on scene teardown", () => {
    const scene = new Scene(640, 480);
    const aborted: boolean[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        init?.signal?.addEventListener("abort", () => aborted.push(true));
        return new Promise(() => {});
      }),
    );
    for (const id of LAZY_IDS) frame(scene, id);
    const disposals = LAZY_IDS.flatMap((id) =>
      collect((scene as unknown as Record<string, THREE.Group>)[`${id}Group`]!),
    ).map((resource) => vi.spyOn(resource, "dispose"));
    scene.dispose();
    expect(scene.getBuiltLazyViews()).toEqual([]);
    expect(disposals.filter((spy) => spy.mock.calls.length === 0)).toEqual([]);
    expect(aborted.length).toBeGreaterThan(0);
  });

  it("makes no network request while Globe live data is off", () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error("offline")));
    vi.stubGlobal("fetch", fetchSpy);
    const scene = new Scene(640, 480);
    frame(scene, "globe", 1 / 60, { ...DEFAULT_SETTINGS, globeLiveData: false });
    expect(fetchSpy).not.toHaveBeenCalled();
    frame(scene, "globe", 1 / 60, { ...DEFAULT_SETTINGS, globeLiveData: true });
    expect(fetchSpy).toHaveBeenCalled();
    scene.dispose();
  });
});
