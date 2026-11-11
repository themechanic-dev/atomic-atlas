// Is a point on land or at sea? Answered from the world map that ships with the app
// (Natural Earth 1:50m), so it works offline. Good to a few kilometres at the coast.

import { pointInRing, type LngLat } from '../lib/geo';

type Ring = number[][];
interface LandShape {
  bbox: [number, number, number, number];
  rings: Ring[]; // outer ring first, then holes
}

let shapes: Promise<LandShape[] | null> | null = null;

function bboxOf(ring: Ring): [number, number, number, number] {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const [x, y] of ring) {
    if (x! < w) w = x!;
    if (x! > e) e = x!;
    if (y! < s) s = y!;
    if (y! > n) n = y!;
  }
  return [w, s, e, n];
}

function load(): Promise<LandShape[] | null> {
  shapes ??= fetch('./data/basemap/land.json')
    .then((response) => (response.ok ? response.json() : null))
    .then((json: { features: Array<{ geometry: { type: string; coordinates: unknown } }> } | null) => {
      if (!json) return null;
      const out: LandShape[] = [];
      for (const feature of json.features) {
        const polygons =
          feature.geometry.type === 'MultiPolygon'
            ? (feature.geometry.coordinates as Ring[][])
            : [feature.geometry.coordinates as Ring[]];
        for (const rings of polygons) if (rings[0]) out.push({ bbox: bboxOf(rings[0]), rings });
      }
      return out;
    })
    .catch(() => null);
  return shapes;
}

/** True on land, false at sea, null when the map data is not available. */
export async function isLand(point: LngLat): Promise<boolean | null> {
  const all = await load();
  if (!all) return null;
  for (const shape of all) {
    const [w, s, e, n] = shape.bbox;
    if (point.lng < w || point.lng > e || point.lat < s || point.lat > n) continue;
    if (!pointInRing(point, shape.rings[0]!)) continue;
    // Inside the outline: on land unless inside a hole (a lake or inland sea).
    if (!shape.rings.slice(1).some((hole) => pointInRing(point, hole))) return true;
  }
  return false;
}
