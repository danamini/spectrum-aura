/**
 * Map data behind the Globe view: Natural Earth 1:110m country outlines,
 * packaged as TopoJSON by world-atlas. Public domain, served with permissive
 * CORS, so the browser reads it directly — no backend.
 */
export const COUNTRIES_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json";
/** Upper bound on distinct countries; sizes the per-country level texture. */
export const MAX_COUNTRIES = 256;

export type CountryOutlines = {
  /** Flat [lon, lat] pairs, two points per line segment. */
  segments: Float32Array;
  /** Country index for each point in `segments` (one entry per point). */
  owners: Float32Array;
  countryCount: number;
};

type TopoJson = {
  arcs?: unknown;
  transform?: { scale?: unknown; translate?: unknown };
  objects?: Record<string, { geometries?: unknown } | undefined>;
};

function pair(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  // Strict numbers only: Number(null) is 0, which would turn a missing
  // value into a plausible coordinate or delta.
  const [a, b] = value as unknown[];
  return typeof a === "number" && typeof b === "number" && Number.isFinite(a) && Number.isFinite(b)
    ? [a, b]
    : null;
}

/**
 * Decodes each TopoJSON arc into its [lon, lat] points. Arcs are
 * delta-encoded integers under a quantising transform; an arc with a
 * malformed point is dropped rather than drawn with a gap or a stray line.
 */
export function decodeTopoArcs(topology: unknown): Float32Array[] {
  const topo = topology as TopoJson | null;
  if (!topo || !Array.isArray(topo.arcs)) return [];
  const scale = pair(topo.transform?.scale) ?? [1, 1];
  const translate = pair(topo.transform?.translate) ?? [0, 0];
  return topo.arcs.map((arc) => {
    if (!Array.isArray(arc)) return new Float32Array(0);
    const points = new Float32Array(arc.length * 2);
    let x = 0;
    let y = 0;
    for (let i = 0; i < arc.length; i++) {
      const step = pair(arc[i]);
      if (!step) return new Float32Array(0);
      x += step[0];
      y += step[1];
      points[i * 2] = x * scale[0] + translate[0];
      points[i * 2 + 1] = y * scale[1] + translate[1];
    }
    return points;
  });
}

/** Collects every arc index a Polygon/MultiPolygon `arcs` tree references. */
function collectArcIndices(node: unknown, out: number[]): void {
  if (typeof node === "number") {
    // A negative index means "arc ~i, reversed"; direction is irrelevant for outlines.
    if (Number.isInteger(node)) out.push(node < 0 ? ~node : node);
    return;
  }
  if (Array.isArray(node)) for (const child of node) collectArcIndices(child, out);
}

/**
 * Builds per-country outline segments. A border shared by two countries is
 * emitted once for each, so neighbours can move independently.
 */
export function decodeCountryOutlines(
  topology: unknown,
  maxCountries = MAX_COUNTRIES,
): CountryOutlines {
  const empty = { segments: new Float32Array(0), owners: new Float32Array(0), countryCount: 0 };
  const geometries = (topology as TopoJson | null)?.objects?.countries?.geometries;
  if (!Array.isArray(geometries)) return empty;
  const arcs = decodeTopoArcs(topology);
  const segments: number[] = [];
  const owners: number[] = [];
  let countryCount = 0;
  for (const geometry of geometries) {
    if (countryCount >= maxCountries) break;
    const indices: number[] = [];
    collectArcIndices((geometry as { arcs?: unknown } | null)?.arcs, indices);
    let drew = false;
    for (const index of indices) {
      const points = arcs[index];
      if (!points) continue;
      for (let i = 0; i + 3 < points.length; i += 2) {
        segments.push(points[i]!, points[i + 1]!, points[i + 2]!, points[i + 3]!);
        owners.push(countryCount, countryCount);
        drew = true;
      }
    }
    if (drew) countryCount += 1;
  }
  return {
    segments: new Float32Array(segments),
    owners: new Float32Array(owners),
    countryCount,
  };
}

/** Longitude/latitude in degrees → point on a sphere (Y up, lon 0 on +Z). */
export function lonLatToXyz(
  lon: number,
  lat: number,
  radius: number,
  out: { x: number; y: number; z: number },
): void {
  const phi = (lat * Math.PI) / 180;
  const theta = (lon * Math.PI) / 180;
  const c = Math.cos(phi) * radius;
  out.x = c * Math.sin(theta);
  out.y = Math.sin(phi) * radius;
  out.z = c * Math.cos(theta);
}

export async function fetchCountryOutlines(signal: AbortSignal): Promise<CountryOutlines> {
  const response = await fetch(COUNTRIES_URL, { signal, credentials: "omit" });
  if (!response.ok) throw new Error(`${COUNTRIES_URL}: HTTP ${response.status}`);
  return decodeCountryOutlines(await response.json());
}

/**
 * A damped spring per country: the level chases its band, overshoots and
 * settles, which reads as a bounce rather than a meter. Integrated with a
 * capped step so a long frame cannot blow it up.
 */
export function stepBounce(
  position: Float32Array,
  velocity: Float32Array,
  targets: Float32Array,
  count: number,
  dt: number,
  stiffness = 190,
  damping = 9,
): void {
  const step = Math.min(dt, 1 / 30);
  for (let i = 0; i < count; i++) {
    const p = position[i]!;
    const v = velocity[i]! + ((targets[i]! - p) * stiffness - velocity[i]! * damping) * step;
    velocity[i] = v;
    position[i] = p + v * step;
  }
}
