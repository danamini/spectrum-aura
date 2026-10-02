import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { DEFAULT_SETTINGS } from "../settings";
import { AmbientSource } from "../ambient-source";
import { createSceneUpdateOpts, syncSceneUpdateOpts } from "../scene-update-opts";
import { Scene } from "../scene";

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
});
afterEach(() => vi.restoreAllMocks());

describe("Scene teardown", () => {
  it("releases geometry, material and instance buffers for every attached view", () => {
    const scene = new Scene(640, 480);
    const resources = new Map<
      THREE.BufferGeometry | THREE.Material | THREE.InstancedMesh,
      string
    >();
    scene.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      // Three.js owns the single shared Sprite geometry.
      if (mesh.geometry && !(object instanceof THREE.Sprite))
        resources.set(mesh.geometry, `${object.type} geometry ${mesh.geometry.type}`);
      if (mesh.material) {
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          resources.set(material, `${object.type} material ${material.type}`);
        }
      }
      if (object instanceof THREE.InstancedMesh) resources.set(object, "InstancedMesh buffers");
    });
    const disposals = [...resources].map(([resource, label]) => ({
      dispose: vi.spyOn(resource, "dispose"),
      label,
    }));
    expect(resources.size).toBeGreaterThan(100);
    scene.dispose();
    expect(
      disposals.filter(({ dispose }) => dispose.mock.calls.length === 0).map(({ label }) => label),
    ).toEqual([]);
  });
});

it("updates Mandala in existing line buffers with the same spline samples", () => {
  const scene = new Scene(640, 480);
  const opts = createSceneUpdateOpts("mandala");
  syncSceneUpdateOpts(opts, DEFAULT_SETTINGS, "mandala", false, false);
  const source = new AmbientSource(120, 1);
  scene.update(1 / 60, 1, source.read(1000), opts);
  const ribbons = Reflect.get(scene, "mandalaRibbons") as Array<{
    geometry: LineGeometry;
    curve: THREE.CatmullRomCurve3;
  }>;
  const buffers = ribbons.map((r) => r.geometry.getAttribute("instanceStart"));
  const before = buffers.map((attr) =>
    Array.from((attr as THREE.InterleavedBufferAttribute).data.array),
  );
  scene.update(1 / 60, 2, source.read(2000), opts);
  for (const [index, ribbon] of ribbons.entries()) {
    const start = ribbon.geometry.getAttribute("instanceStart") as THREE.InterleavedBufferAttribute;
    expect(start).toBe(buffers[index]);
    expect(Array.from(start.data.array)).not.toEqual(before[index]);
    const expected = new LineGeometry();
    expected.setPositions(ribbon.curve.getPoints(start.count).flatMap((point) => point.toArray()));
    expect(start.data.array).toEqual(
      (expected.getAttribute("instanceStart") as THREE.InterleavedBufferAttribute).data.array,
    );
    expected.dispose();
  }
  scene.dispose();
});

it.each([
  [1, 1],
  [20, 40],
  [50, 8],
])(
  "batches %i Ripple columns of %i rings and preserves transparent transforms/colors",
  (columns, rings) => {
    const scene = new Scene(640, 480);
    const opts = createSceneUpdateOpts("ripple");
    syncSceneUpdateOpts(
      opts,
      { ...DEFAULT_SETTINGS, rippleColumns: columns, rippleRingCount: rings },
      "ripple",
      false,
      false,
    );
    const source = new AmbientSource(120, 1);
    const audio = source.read(1000);
    scene.update(1 / 60, 1, audio, opts);
    const batches = scene.rippleGroup.children.map(
      (column) => column.children[0] as THREE.InstancedMesh,
    );
    expect(batches).toHaveLength(columns);
    for (const batch of batches) {
      expect(batch).toBeInstanceOf(THREE.InstancedMesh);
      expect(batch.count).toBe(rings);
      expect(batch.parent!.children).toHaveLength(1);
    }
    opts.rippleOpacity = 0.6;
    opts.rippleWireframe = true;
    scene.update(0, 1, audio, opts);
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    for (const batch of batches) {
      expect(batch.visible).toBe(false);
      const singles = batch.parent!.children.slice(1) as THREE.Mesh<
        THREE.BufferGeometry,
        THREE.MeshStandardMaterial
      >[];
      expect(singles).toHaveLength(rings);
      singles.forEach((mesh, index) => {
        batch.getMatrixAt(index, matrix);
        expect(matrix.elements[13]).toBeCloseTo(mesh.position.y, 4);
        batch.getColorAt(index, color);
        const expected = mesh.material.emissive
          .clone()
          .multiplyScalar(mesh.material.emissiveIntensity);
        expect(color.r).toBeCloseTo(expected.r, 5);
        expect(color.g).toBeCloseTo(expected.g, 5);
        expect(color.b).toBeCloseTo(expected.b, 5);
        expect(mesh.material.transparent).toBe(true);
        expect(mesh.material.opacity).toBe(0.6);
        expect(mesh.material.wireframe).toBe(true);
      });
    }
    opts.rippleOpacity = 1;
    scene.update(0, 1, audio, opts);
    for (const batch of batches) {
      expect(batch.visible).toBe(true);
      expect((batch.material as THREE.MeshStandardMaterial).wireframe).toBe(true);
      expect(batch.parent!.children.slice(1).every((mesh) => !mesh.visible)).toBe(true);
    }
    const disposed = batches.map((batch) => vi.spyOn(batch, "dispose"));
    opts.rippleColumns = columns === 1 ? 2 : 1;
    scene.update(0, 1, audio, opts);
    for (const dispose of disposed) expect(dispose).toHaveBeenCalledOnce();
    scene.dispose();
  },
);

it("requests Asset-Flow assets once, only when that view becomes active", () => {
  const loader = vi.mocked(GLTFLoader.prototype.load);
  const textures = vi.mocked(THREE.TextureLoader.prototype.load);
  const scene = new Scene(640, 480);
  expect(loader).not.toHaveBeenCalled();
  expect(textures).not.toHaveBeenCalled();
  const opts = createSceneUpdateOpts("combo");
  const source = new AmbientSource(120, 1);
  const audio = source.read(1000);
  syncSceneUpdateOpts(opts, DEFAULT_SETTINGS, "combo", false, false);
  scene.update(1 / 60, 1, audio, opts);
  expect(loader).not.toHaveBeenCalled();
  syncSceneUpdateOpts(opts, DEFAULT_SETTINGS, "assetflow", false, false);
  scene.update(1 / 60, 1, audio, opts);
  const modelRequests = loader.mock.calls.length;
  const textureRequests = textures.mock.calls.length;
  expect(modelRequests).toBeGreaterThan(0);
  expect(textureRequests).toBeGreaterThan(0);
  scene.update(1 / 60, 2, audio, opts);
  syncSceneUpdateOpts(opts, DEFAULT_SETTINGS, "combo", false, false);
  scene.update(1 / 60, 3, audio, opts);
  syncSceneUpdateOpts(opts, DEFAULT_SETTINGS, "assetflow", false, false);
  scene.update(1 / 60, 4, audio, opts);
  expect(loader).toHaveBeenCalledTimes(modelRequests);
  expect(textures).toHaveBeenCalledTimes(textureRequests);
  scene.dispose();
});
