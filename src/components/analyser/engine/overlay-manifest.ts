import overlayManifest from "./overlay-manifest.json";
import type { CommonsOverlayTopic } from "./commons-overlay-source";

export type OverlayBias = "mixed" | "technical" | "organic" | "chaotic";
export type OverlayCommonsTopic = CommonsOverlayTopic;

type OverlayManifestEntry = {
  path: string;
  label: string;
  family: string;
  source: string;
  license: string;
  attributionRequired: boolean;
  author?: string;
  sourceUrl?: string;
  creditLine?: string;
  enabled?: boolean;
};

type OverlayManifest = {
  version: number;
  overlays: OverlayManifestEntry[];
};

export type OverlayTextureManifestEntry = OverlayManifestEntry & {
  publicUrl: string;
};

const manifest = overlayManifest as OverlayManifest;

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/*$/, "/");
}

function toPublicUrl(baseUrl: string, path: string) {
  return `${normalizeBaseUrl(baseUrl)}${path.replace(/^\/+/, "")}`;
}

export function getOverlayTextureManifest(
  baseUrl = import.meta.env.BASE_URL || "/",
): OverlayTextureManifestEntry[] {
  const seen = new Set<string>();
  return manifest.overlays
    .filter((entry) => entry.enabled !== false)
    .filter((entry) => {
      const key = entry.path.trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((entry) => ({
      ...entry,
      publicUrl: toPublicUrl(baseUrl, entry.path),
    }));
}

/** Families each bias steers toward ("mixed" accepts everything). Hoisted so
 * the picker's fallback scans don't rebuild sets on every invocation. */
const BIAS_FAMILY_SETS: Record<OverlayBias, ReadonlySet<string> | null> = {
  mixed: null,
  technical: new Set(["grid", "hud", "circuit", "scanlines", "angular", "generated-grid"]),
  organic: new Set(["wave", "radial", "spiral", "flare", "generated-radial"]),
  chaotic: new Set(["halftone", "noise", "burst", "angular", "generated-diagonal"]),
};

export function pickDistinctOverlaySlots(
  currentSlots: readonly [number, number, number],
  families: readonly string[],
  strides: readonly [number, number, number],
  bias: OverlayBias = "mixed",
): [number, number, number] {
  const len = families.length;
  if (len <= 0) return [0, 0, 0];

  const usedIndices = new Set<number>();
  const usedFamilies = new Set<string>();
  const result: number[] = [];

  const scan = (
    start: number,
    accept: (index: number, family: string) => boolean,
  ): number | null => {
    for (let offset = 0; offset < len; offset += 1) {
      const index = (start + offset) % len;
      const family = families[index] ?? "generated";
      if (accept(index, family)) return index;
    }
    return null;
  };

  const biasFamilies = BIAS_FAMILY_SETS[bias];
  const matchesBias = (family: string) => !biasFamilies || biasFamilies.has(family);

  for (let slot = 0; slot < 3; slot += 1) {
    const current = currentSlots[slot] ?? 0;
    const stride = Math.max(1, Math.floor(strides[slot] ?? 1));
    const start = (current + stride) % len;

    const pick =
      scan(
        start,
        (index, family) =>
          !usedIndices.has(index) &&
          index !== current &&
          !usedFamilies.has(family) &&
          matchesBias(family),
      ) ??
      scan(
        start,
        (index, family) =>
          !usedIndices.has(index) && index !== current && !usedFamilies.has(family),
      ) ??
      scan(
        start,
        (index, family) => !usedIndices.has(index) && index !== current && matchesBias(family),
      ) ??
      scan(start, (index, _family) => !usedIndices.has(index) && index !== current) ??
      scan(start, (index) => !usedIndices.has(index)) ??
      current;

    usedIndices.add(pick);
    usedFamilies.add(families[pick] ?? "generated");
    result.push(pick);
  }

  return [result[0] ?? 0, result[1] ?? 0, result[2] ?? 0];
}
