// Dams near a detonation, and the "what if it fails?" picture for one of them: the peak
// flow out of the breach and the way the water would take down the valley.
//
// The way is found by walking downhill on the terrain tiles from the dam. Whether a dam
// would fail is not modelled: the user asks what would follow if it did.

import { computed, signal } from '@preact/signals';
import { peakOutflowM3s } from '@physics/water/dambreak';
import { damsWithin, loadDams, type Dam, type NearbyDam } from '../data/dams';
import { PixelGrid, pixelSizeM } from '../lib/elevation';
import type { LngLat } from '../lib/geo';
import { detonation } from './simulation';

export const dams = signal<Dam[]>([]);

let started = false;
export function ensureDams(): void {
  if (started) return;
  started = true;
  void loadDams().then((list) => (dams.value = list));
}

/** Dams inside the blast rings of the current detonation, nearest first. */
export const nearbyDams = computed<NearbyDam[]>(() => {
  const current = detonation.value;
  if (!current || dams.value.length === 0) return [];
  const furthest = current.result.rings.filter((ring) => ring.kind === 'blast').reduce((max, ring) => Math.max(max, ring.radiusM), 0);
  if (!(furthest > 0)) return [];
  return damsWithin(dams.value, current.at, furthest, (rangeM) => current.result.effects.overpressurePsi(rangeM));
});

export interface DamFlood {
  dam: Dam;
  state: 'loading' | 'ready' | 'unavailable';
  peakM3s: number;
  /** The way the water takes, from the dam downhill. */
  path: LngLat[];
  /** Distance along the way to each point of the path, metres. */
  along: number[];
  /** Why the walk stopped. */
  end: 'sea' | 'water' | 'flat' | 'length' | null;
}

export const damFlood = signal<DamFlood | null>(null);

// A new detonation (or none) puts away the picture for the last one.
detonation.subscribe(() => (damFlood.value = null));

/** The walk goes no further than this: by then the peak has fallen below 1 % (La = 10 km). */
const MAX_LENGTH_M = 50_000;
/** Pixels the walk may look at before it gives up in flat land. */
const MAX_VISITS = 250_000;
const ZOOM = 12;
/** How far from the dam's point the foot of the dam is looked for, metres. */
const FOOT_SEARCH_M = 2500;

export function clearDamFlood(): void {
  damFlood.value = null;
}

export async function whatIfDamFails(dam: Dam): Promise<void> {
  const peakM3s = peakOutflowM3s({ volumeM3: dam.volumeM3, headM: dam.heightM });
  damFlood.value = { dam, state: 'loading', peakM3s, path: [], along: [], end: null };
  const result = await walkDownhill({ lng: dam.lng, lat: dam.lat }, dam.heightM);
  if (damFlood.value?.dam !== dam) return; // another dam was chosen meanwhile
  damFlood.value = result
    ? { dam, state: 'ready', peakM3s, path: result.path, along: result.along, end: result.end }
    : { dam, state: 'unavailable', peakM3s, path: [], along: [], end: null };
}

/** A small binary heap of pixel keys ordered by height. */
class LowestFirst {
  private keys: number[] = [];
  private heights: number[] = [];
  get size(): number {
    return this.keys.length;
  }
  push(key: number, height: number): void {
    let i = this.keys.length;
    this.keys.push(key);
    this.heights.push(height);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.heights[p]! <= height) break;
      this.keys[i] = this.keys[p]!;
      this.heights[i] = this.heights[p]!;
      i = p;
    }
    this.keys[i] = key;
    this.heights[i] = height;
  }
  pop(): { key: number; height: number } {
    const top = { key: this.keys[0]!, height: this.heights[0]! };
    const lastKey = this.keys.pop()!;
    const lastHeight = this.heights.pop()!;
    if (this.keys.length > 0) {
      let i = 0;
      const n = this.keys.length;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && this.heights[r]! < this.heights[l]! ? r : l;
        if (this.heights[c]! >= lastHeight) break;
        this.keys[i] = this.keys[c]!;
        this.heights[i] = this.heights[c]!;
        i = c;
      }
      this.keys[i] = lastKey;
      this.heights[i] = lastHeight;
    }
    return top;
  }
}

/**
 * The way water takes from a point, found by "priority flood" on the terrain: the lowest
 * pixel next to the wet area is always taken next, so water fills a hollow until it spills
 * over, as it would. The way is the chain of pixels from the start to the furthest point reached.
 */
async function walkDownhill(damAt: LngLat, damHeightM: number): Promise<{ path: LngLat[]; along: number[]; end: DamFlood['end'] } | null> {
  const grid = new PixelGrid(ZOOM);
  const d = grid.pixelOf(damAt);
  if (!(await grid.ensure(d.gx, d.gy))) return null;
  const width = grid.size;
  const keyOf = (gx: number, gy: number): number => gy * width + gx;
  const pixelM = pixelSizeM(damAt.lat, ZOOM);

  // The map shows the lake behind the dam, not the valley floor under it, so the walk starts
  // at the foot of the dam: the nearest ground well below the dam's own height.
  const damGround = grid.height(d.gx, d.gy);
  const reach = Math.ceil(FOOT_SEARCH_M / pixelM);
  let foot: { gx: number; gy: number; h: number; r2: number } | null = null;
  let lowest: { gx: number; gy: number; h: number; r2: number } | null = null;
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const r2 = dx * dx + dy * dy;
      if (r2 > reach * reach) continue;
      const gx = (d.gx + dx + width) % width;
      const gy = d.gy + dy;
      if (!(await grid.ensure(gx, gy))) continue;
      const h = grid.height(gx, gy);
      if (Number.isNaN(h) || h === 0) continue;
      if (h <= damGround - 0.4 * damHeightM && (!foot || r2 < foot.r2)) foot = { gx, gy, h, r2 };
      if (!lowest || h < lowest.h) lowest = { gx, gy, h, r2 };
    }
  }
  const s = foot ?? (lowest && lowest.h < damGround - 10 ? lowest : null);
  if (!s) return null;
  // The flood does not run back up into the lake.
  const ceiling = s.h + 0.3 * damHeightM;
  const parent = new Map<number, number>();
  const along = new Map<number, number>();
  const queue = new LowestFirst();
  const startKey = keyOf(s.gx, s.gy);
  parent.set(startKey, -1);
  along.set(startKey, Math.sqrt(s.r2) * pixelM);
  queue.push(startKey, grid.height(s.gx, s.gy));
  let last = startKey;
  let end: DamFlood['end'] = 'flat';
  let visits = 0;
  while (queue.size > 0 && visits < MAX_VISITS) {
    const { key, height } = queue.pop();
    visits++;
    last = key;
    const distance = along.get(key)!;
    // Below 0: the sea floor. Exactly 0: water the map holds no height for (a lake, a wide river, the sea near a coast).
    if (height <= 0 && key !== startKey) {
      end = height < 0 ? 'sea' : 'water';
      break;
    }
    if (distance >= MAX_LENGTH_M) {
      end = 'length';
      break;
    }
    const gx = key % width;
    const gy = (key - gx) / width;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = (gx + dx + width) % width;
        const ny = gy + dy;
        const nk = keyOf(nx, ny);
        if (parent.has(nk)) continue;
        if (!(await grid.ensure(nx, ny))) continue;
        const h = grid.height(nx, ny);
        if (Number.isNaN(h) || h > ceiling) continue;
        parent.set(nk, key);
        along.set(nk, distance + (dx !== 0 && dy !== 0 ? Math.SQRT2 : 1) * pixelM);
        // The lowest pixel at the edge of the wet area goes next: water runs downhill,
        // and climbs out of a hollow only once everything lower has been reached.
        queue.push(nk, h);
      }
    }
  }
  // The chain back from the furthest point.
  let far = last;
  if (end === 'flat') {
    for (const [key, d] of along) if (d > along.get(far)!) far = key;
  }
  const chain: number[] = [];
  for (let k = far; k !== -1; k = parent.get(k)!) chain.push(k);
  chain.reverse();
  // Every few pixels is enough to draw it.
  const stepEvery = Math.max(1, Math.round(120 / pixelM));
  const path: LngLat[] = [damAt];
  const distances: number[] = [0];
  chain.forEach((k, i) => {
    if (i % stepEvery !== 0 && i !== chain.length - 1) return;
    const gx = k % width;
    path.push(grid.pointOf(gx, (k - gx) / width));
    distances.push(along.get(k)!);
  });
  return { path, along: distances, end };
}
