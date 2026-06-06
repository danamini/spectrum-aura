export const DEFAULT_VISUAL_ID = "combo" as const;

export const BUILTIN_VISUALS = [
  {
    id: "combo",
    label: "Combo",
    settingsLabel: "3D Combo view settings",
    fullscreenKey: "comboFullscreen",
    wireframeKey: "comboWireframe",
    sceneGroupKey: "group",
    order: 10,
  },
  {
    id: "classic",
    label: "Classic",
    settingsLabel: "Classic view settings",
    fullscreenKey: "classicFullscreen",
    wireframeKey: "classicWireframe",
    sceneGroupKey: "classicGroup",
    order: 20,
  },
  {
    id: "ripple",
    label: "Ripple",
    settingsLabel: "Ripple view settings",
    fullscreenKey: "rippleFullscreen",
    wireframeKey: "rippleWireframe",
    sceneGroupKey: "rippleGroup",
    order: 30,
  },
  {
    id: "datastream",
    label: "Data-Stream",
    settingsLabel: "Cyberpunk Data-Stream settings",
    fullscreenKey: "datastreamFullscreen",
    sceneGroupKey: "dataStreamGroup",
    order: 40,
  },
  {
    id: "nebula",
    label: "Nebula",
    settingsLabel: "Ethereal Nebula settings",
    fullscreenKey: "nebulaFullscreen",
    wireframeKey: "nebulaWireframe",
    sceneGroupKey: "nebulaGroup",
    order: 50,
  },
  {
    id: "monolith",
    label: "Monolith",
    settingsLabel: "Brutalist Monolith settings",
    fullscreenKey: "monolithFullscreen",
    wireframeKey: "monolithWireframe",
    sceneGroupKey: "monolithGroup",
    order: 60,
  },
  {
    id: "mandala",
    label: "Mandala",
    settingsLabel: "Symmetric Mandala settings",
    fullscreenKey: "mandalaFullscreen",
    sceneGroupKey: "mandalaGroup",
    order: 70,
  },
  {
    id: "terrain",
    label: "Terrain",
    settingsLabel: "Audio-Reactive Terrain settings",
    fullscreenKey: "terrainFullscreen",
    wireframeKey: "terrainWireframe",
    sceneGroupKey: "terrainGroup",
    order: 80,
  },
  {
    id: "obsidian",
    label: "Obsidian",
    settingsLabel: "Obsidian Shard settings",
    fullscreenKey: "obsidianFullscreen",
    sceneGroupKey: "obsidianGroup",
    order: 90,
  },
  {
    id: "torus",
    label: "Torus",
    settingsLabel: "Hyper-Torus Accelerator settings",
    fullscreenKey: "torusFullscreen",
    sceneGroupKey: "torusGroup",
    order: 100,
  },
  {
    id: "soundwall",
    label: "Sound-Wall",
    settingsLabel: "Brutalist Sound-Wall settings",
    fullscreenKey: "soundwallFullscreen",
    sceneGroupKey: "soundwallGroup",
    order: 110,
  },
  {
    id: "geometrynebula",
    label: "Geo Nebula",
    settingsLabel: "Floating Geometry Nebula settings",
    fullscreenKey: "geometrynebulaFullscreen",
    sceneGroupKey: "geometrynebulaGroup",
    order: 120,
  },
  {
    id: "reztube",
    label: "On-rails Tube",
    settingsLabel: "On-rails Tube settings",
    fullscreenKey: "reztubeFullscreen",
    sceneGroupKey: "reztubeGroup",
    order: 130,
  },
  {
    id: "assetflow",
    label: "Asset-Flow",
    settingsLabel: "Asset-Flow settings",
    fullscreenKey: "assetflowFullscreen",
    sceneGroupKey: "assetflowGroup",
    order: 140,
  },
] as const;

type BuiltinVisual = (typeof BUILTIN_VISUALS)[number];
export type BuiltinViewMode = BuiltinVisual["id"];
export type ViewMode = BuiltinViewMode | (string & {});

export type VisualDefinition = {
  id: ViewMode;
  label: string;
  settingsLabel: string;
  fullscreenKey?: string;
  wireframeKey?: string;
  sceneGroupKey?: string;
  order: number;
};

type RuntimeVisualModule = {
  visual?: Partial<Omit<VisualDefinition, "id" | "order">> &
    Pick<VisualDefinition, "id"> & { order?: number };
  default?: Partial<Omit<VisualDefinition, "id" | "order">> &
    Pick<VisualDefinition, "id"> & { order?: number };
};

function titleCaseRuntimeId(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function normalizeVisualDefinition(
  visual: Partial<Omit<VisualDefinition, "id" | "order">> &
    Pick<VisualDefinition, "id"> & { order?: number },
  fallback?: VisualDefinition,
): VisualDefinition {
  const label = visual.label ?? fallback?.label ?? titleCaseRuntimeId(String(visual.id));
  return {
    id: visual.id,
    label,
    settingsLabel: visual.settingsLabel ?? fallback?.settingsLabel ?? `${label} settings`,
    fullscreenKey: visual.fullscreenKey ?? fallback?.fullscreenKey,
    wireframeKey: visual.wireframeKey ?? fallback?.wireframeKey,
    sceneGroupKey: visual.sceneGroupKey ?? fallback?.sceneGroupKey,
    order: visual.order ?? fallback?.order ?? 1000,
  };
}

const runtimeVisualModules = import.meta.glob("./visuals/*.visual.ts", {
  eager: true,
}) as Record<string, RuntimeVisualModule>;

const mergedVisuals = new Map<string, VisualDefinition>();
for (const builtin of BUILTIN_VISUALS) {
  mergedVisuals.set(builtin.id, normalizeVisualDefinition(builtin));
}
for (const module of Object.values(runtimeVisualModules)) {
  const definition = module.visual ?? module.default;
  if (!definition) continue;
  const existing = mergedVisuals.get(definition.id);
  mergedVisuals.set(definition.id, normalizeVisualDefinition(definition, existing));
}

export const VISUALS: VisualDefinition[] = Array.from(mergedVisuals.values()).sort(
  (left, right) => {
    if (left.order !== right.order) return left.order - right.order;
    return left.label.localeCompare(right.label);
  },
);

export function getVisualDefinition(view: string): VisualDefinition | undefined {
  return VISUALS.find((visual) => visual.id === view);
}
