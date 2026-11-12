// The world population grid that ships with the app (GHS-POP 2025, 30 arc-seconds), and the
// 100 m grid of the areas the user has downloaded (population100.ts) where it covers the circle.
// Built by scripts/build-population.mjs; the format is described there.

import type { PopulationSample } from '@physics/casualties/model';
import { distanceM, type LngLat } from '../lib/geo';
import { finePopulationAround, SOURCE as FINE_SOURCE } from './population100';

interface PopulationIndex {
  format: number;
  source: string;
  epoch: number;
  cellsPerDegree: number;
  blockDegrees: number;
  blockCells: number;
  scale: number;
  worldPopulation: number;
  blocks: Record<string, [number, number]>;
}

const BASE = './data/population/';

let indexPromise: Promise<PopulationIndex | null> | null = null;
const blockCache = new Map<string, Promise<Uint8Array | null>>();
const MAX_CACHED_BLOCKS = 12;

/** Loads the index once. Resolves to null when the grid is not installed. */
export function loadPopulationIndex(): Promise<PopulationIndex | null> {
  indexPromise ??= fetch(BASE + 'index.json')
    .then((response) => (response.ok ? (response.json() as Promise<PopulationIndex>) : null))
    .catch(() => null);
  return indexPromise;
}

async function inflate(compressed: ArrayBuffer): Promise<Uint8Array> {
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function loadBlock(key: string): Promise<Uint8Array | null> {
  let cached = blockCache.get(key);
  if (!cached) {
    cached = fetch(`${BASE}${key}.bin`)
      .then((response) => (response.ok ? response.arrayBuffer() : null))
      .then((buffer) => (buffer ? inflate(buffer) : null))
      .catch(() => null);
    blockCache.set(key, cached);
    // Keep memory bounded: each block is 360 kB once inflated.
    if (blockCache.size > MAX_CACHED_BLOCKS) {
      const oldest = blockCache.keys().next().value;
      if (oldest !== undefined) blockCache.delete(oldest);
    }
  }
  return cached;
}

export interface PopulationQuery {
  /** People in each grid cell within the radius, with the cell's distance from the centre. */
  samples: PopulationSample[];
  /** Total people within the radius. */
  total: number;
  /** Year the grid describes. */
  epoch: number;
  /** Citation of the grid. */
  source: string;
  /** Size of the grid's cells: 100 m inside a downloaded area, 1000 m elsewhere. */
  resolutionM: number;
}

/**
 * People living within `radiusM` of a point, cell by cell.
 * Returns null when the population grid is not available.
 */
export async function populationAround(centre: LngLat, radiusM: number): Promise<PopulationQuery | null> {
  // The 100 m grid of a downloaded area, when the whole circle is inside it.
  const fine = await finePopulationAround(centre, radiusM).catch(() => null);
  if (fine) return { ...fine, epoch: 2025, source: FINE_SOURCE, resolutionM: 100 };
  const index = await loadPopulationIndex();
  if (!index) return null;

  const { cellsPerDegree, blockDegrees, blockCells, scale } = index;
  const cell = 1 / cellsPerDegree;
  const latSpan = (radiusM / 111_195) * 1.02 + cell;
  const cosLat = Math.max(Math.cos((centre.lat * Math.PI) / 180), 0.02);
  const lngSpan = Math.min(latSpan / cosLat, 180);

  const rowTop = Math.max(0, Math.floor((90 - (centre.lat + latSpan)) * cellsPerDegree));
  const rowBottom = Math.min(180 * cellsPerDegree - 1, Math.floor((90 - (centre.lat - latSpan)) * cellsPerDegree));
  const colLeft = Math.floor((centre.lng - lngSpan + 180) * cellsPerDegree);
  const colRight = Math.floor((centre.lng + lngSpan + 180) * cellsPerDegree);
  const worldCols = 360 * cellsPerDegree;

  // Which blocks does the box touch?
  const wanted = new Map<string, Promise<Uint8Array | null>>();
  for (let br = Math.floor(rowTop / blockCells); br <= Math.floor(rowBottom / blockCells); br++) {
    for (let bc = Math.floor(colLeft / blockCells); bc <= Math.floor(colRight / blockCells); bc++) {
      const wrapped = ((bc % (360 / blockDegrees)) + 360 / blockDegrees) % (360 / blockDegrees);
      const key = `${br}_${wrapped}`;
      if (index.blocks[key] && !wanted.has(key)) wanted.set(key, loadBlock(key));
    }
  }
  const loaded = new Map<string, Uint8Array>();
  await Promise.all(
    [...wanted].map(async ([key, promise]) => {
      const data = await promise;
      if (data) loaded.set(key, data);
    }),
  );

  const samples: PopulationSample[] = [];
  let total = 0;
  for (let row = rowTop; row <= rowBottom; row++) {
    const lat = 90 - (row + 0.5) * cell;
    const br = Math.floor(row / blockCells);
    const inRow = row - br * blockCells;
    for (let col = colLeft; col <= colRight; col++) {
      const wrappedCol = ((col % worldCols) + worldCols) % worldCols;
      const bc = Math.floor(wrappedCol / blockCells);
      const key = `${br}_${bc}`;
      const block = loaded.get(key);
      if (!block) continue;
      const q = block[inRow * blockCells + (wrappedCol - bc * blockCells)]!;
      if (q === 0) continue;
      const lng = -180 + (col + 0.5) * cell;
      const d = distanceM(centre, { lat, lng });
      if (d > radiusM) continue;
      const people = Math.expm1(q / scale) * index.blocks[key]![0];
      samples.push({ groundRangeM: d, people });
      total += people;
    }
  }
  return { samples, total, epoch: index.epoch, source: index.source, resolutionM: 1000 };
}
