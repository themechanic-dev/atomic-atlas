// Water waves from a detonation in or on the sea, a lake or a river: the depth of the water
// at surface zero is read from the terrain tiles, the waves follow from ./physics/water.

import { signal } from '@preact/signals';
import { floodFrom } from '@physics/water/inundation';
import { breakerHeightM, waveArrivalS, waveHeightM, waveSummary, type WaveConditions, type WaveSummary } from '@physics/water/waves';
import { elevationAt, elevationsAt } from '../lib/elevation';
import type { LngLat } from '../lib/geo';

/** Water shallower than this at surface zero is treated as land (shore, tidal flat, tile noise). */
const MIN_DEPTH_M = 2;
/** Run-up below this is not drawn, metres. */
const MIN_RUNUP_M = 0.5;
/** Cells per side of the flooding grid. */
const GRID = 200;
const MAX_FLOOD_RADIUS_M = 120_000;

export interface FloodMap {
  /** PNG of the flooded land, one pixel per cell. */
  image: string;
  /** Corners of the image: top-left, top-right, bottom-right, bottom-left, as [lng, lat]. */
  corners: [[number, number], [number, number], [number, number], [number, number]];
  areaM2: number;
  maxRunupM: number;
  /** Distance to the nearest flooded land, metres, and when the first waves reach it, seconds. */
  nearestM: number | null;
  nearestArrivalS: number | null;
  /** Radius of the area searched, metres. */
  radiusM: number;
}

export interface WaterResult {
  /** Id of the detonation this belongs to. */
  id: number;
  at: LngLat;
  /** `needsDepth`: on water, but the map holds no depth there. */
  state: 'loading' | 'land' | 'unknown' | 'needsDepth' | 'ready';
  yieldKt: number;
  /** True when the burst is in or on the water; false for a burst in the air above it. */
  inWater: boolean;
  depthM: number | null;
  /** Where the depth came from: the terrain tiles, coarse sea-floor data, or given by the user or a historical scenario. */
  depthSource: 'map' | 'coarse' | 'given' | null;
  conditions: WaveConditions | null;
  summary: WaveSummary | null;
  floodState: 'idle' | 'loading' | 'ready' | 'unavailable';
  flood: FloodMap | null;
}

export const water = signal<WaterResult | null>(null);

/** A depth given for a place (by the user or a historical scenario), used instead of the map's. */
export const waterDepthGiven = signal<{ at: LngLat; depthM: number } | null>(null);

const samePlace = (a: LngLat, b: LngLat): boolean => Math.abs(a.lat - b.lat) < 1e-6 && Math.abs(a.lng - b.lng) < 1e-6;

/** Uses a depth for the current detonation's place and works the waves out again. */
export function setWaterDepth(depthM: number): void {
  const w = water.value;
  if (!w || !(depthM > 0)) return;
  waterDepthGiven.value = { at: w.at, depthM };
  void computeWater(w.id, w.at, w.yieldKt, w.inWater);
}

export function clearWater(): void {
  water.value = null;
}

function update(id: number, patch: Partial<WaterResult>): void {
  const current = water.value;
  if (current?.id === id) water.value = { ...current, ...patch };
}

/** Distance at which the run-up has fallen to a height, metres (bisection; the run-up falls with distance). */
function runupRange(conditions: WaveConditions, runupM: number): number {
  let lo = 100;
  let hi = 400_000;
  const at = (r: number): number => breakerHeightM(waveHeightM(conditions, r), conditions.depthM);
  if (at(hi) >= runupM) return hi;
  if (at(lo) < runupM) return lo;
  for (let i = 0; i < 50; i++) {
    const mid = Math.sqrt(lo * hi);
    if (at(mid) >= runupM) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * Works out the water waves for a detonation, if surface zero is on water.
 * `burstInWater` is true for a burst at the surface (or below): an air burst puts little
 * of its energy into the water, and Glasstone's relations are for bursts in the water.
 */
export async function computeWater(id: number, at: LngLat, yieldKt: number, burstInWater: boolean): Promise<void> {
  water.value = { id, at, state: 'loading', yieldKt, inWater: burstInWater, depthM: null, depthSource: null, conditions: null, summary: null, floodState: 'idle', flood: null };
  const given = waterDepthGiven.value && samePlace(waterDepthGiven.value.at, at) ? waterDepthGiven.value.depthM : null;
  let depthM: number;
  let depthSource: WaterResult['depthSource'];
  if (given !== null) {
    depthM = given;
    depthSource = 'given';
  } else {
    const height = await elevationAt(at, 11);
    if (height === null) return update(id, { state: 'unknown' });
    // The detailed tiles mark water without a known depth (lakes, lagoons, some coasts) as exactly 0.
    if (height !== 0 && height > -MIN_DEPTH_M) return update(id, { state: 'land' });
    if (height === 0) {
      const coarse = await elevationAt(at, 8);
      if (coarse === null || coarse > -MIN_DEPTH_M) return update(id, { state: 'needsDepth' });
      depthM = -coarse;
      depthSource = 'coarse';
    } else {
      depthM = -height;
      depthSource = 'map';
    }
  }
  const conditions: WaveConditions = { yieldKt, depthM };
  update(id, { state: 'ready', depthM, depthSource, conditions, summary: waveSummary(conditions) });
  if (!burstInWater) return;
  update(id, { floodState: 'loading' });
  try {
    const flood = await floodMap(at, conditions, -depthM);
    update(id, { floodState: flood ? 'ready' : 'unavailable', flood });
  } catch (error) {
    console.error('flooding could not be worked out', error);
    update(id, { floodState: 'unavailable' });
  }
}

async function floodMap(at: LngLat, conditions: WaveConditions, heightAtZero: number): Promise<FloodMap | null> {
  const radiusM = Math.min(MAX_FLOOD_RADIUS_M, runupRange(conditions, MIN_RUNUP_M));
  const cell = (2 * radiusM) / GRID;
  const cosLat = Math.max(0.05, Math.cos((at.lat * Math.PI) / 180));
  // The zoom whose pixels are about one cell across.
  const zoom = Math.max(6, Math.min(13, Math.round(Math.log2((40_075_016.7 * cosLat) / (256 * cell)))));
  const metresPerDegLat = 111_320;
  const metresPerDegLng = 111_320 * cosLat;
  const points: LngLat[] = [];
  const distances = new Float32Array(GRID * GRID);
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const east = (x + 0.5 - GRID / 2) * cell;
      const north = (GRID / 2 - y - 0.5) * cell;
      points.push({ lng: at.lng + east / metresPerDegLng, lat: at.lat + north / metresPerDegLat });
      distances[y * GRID + x] = Math.hypot(east, north);
    }
  }
  const sampled = await elevationsAt(points, zoom);
  if (sampled.every((h) => h === null)) return null;
  const heights = Float32Array.from(sampled, (h) => (h === null ? Number.NaN : h));
  const origin = (GRID / 2) * GRID + GRID / 2;
  heights[origin] = Math.min(heights[origin]!, heightAtZero);
  const runupM = new Float32Array(GRID * GRID);
  for (let i = 0; i < runupM.length; i++) {
    const r = breakerHeightM(waveHeightM(conditions, Math.max(distances[i]!, cell)), conditions.depthM);
    runupM[i] = r >= MIN_RUNUP_M ? r : 0;
  }
  const result = floodFrom({ n: GRID, heights, origin, runupM });

  let nearestM: number | null = null;
  const canvas = document.createElement('canvas');
  canvas.width = GRID;
  canvas.height = GRID;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const image = context.createImageData(GRID, GRID);
  for (let i = 0; i < result.cells.length; i++) {
    if (result.cells[i] !== 1) continue;
    // Deeper water over the land is a stronger blue.
    const depthOver = runupM[i]! - heights[i]!;
    const alpha = Math.min(235, 150 + depthOver * 25);
    image.data.set([92, 38, 200, alpha], i * 4);
    if (nearestM === null || distances[i]! < nearestM) nearestM = distances[i]!;
  }
  context.putImageData(image, 0, 0);
  const west = at.lng - radiusM / metresPerDegLng;
  const east = at.lng + radiusM / metresPerDegLng;
  const north = at.lat + radiusM / metresPerDegLat;
  const south = at.lat - radiusM / metresPerDegLat;
  return {
    image: canvas.toDataURL('image/png'),
    corners: [
      [west, north],
      [east, north],
      [east, south],
      [west, south],
    ],
    areaM2: result.landCells * cell * cell,
    maxRunupM: result.maxRunupM,
    nearestM,
    nearestArrivalS: nearestM === null ? null : waveArrivalS(conditions, nearestM),
    radiusM,
  };
}
