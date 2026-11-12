// Population at 100 m (GHS-POP 2025, 3 arc-seconds) for the offline areas the user downloads.
//
// The European Commission's JRC publishes the grid in 10-degree tiles of 20–170 MB each. The
// app's shell downloads the tiles an area touches (the server sends no CORS headers, so the page
// cannot), the page cuts the area out with geotiff.js and keeps only that, a few MB, and the
// tiles are deleted. A simulation whose rings fit inside such an area counts people on this
// finer grid; anywhere else the 1 km world grid that ships with the app is used.

import type { PopulationSample } from '@physics/casualties/model';
import { offlineAreas, type OfflineArea } from '../map/areas';
import type { Bounds } from '../map/tiles';
import { distanceM, type LngLat } from '../lib/geo';
import { platform, type PopulationShell } from '../lib/platform';

/** Where the tile grid starts and how big a tile is, read from the tiles themselves (R6_C32: 129.99208° E, 39.09958° N). */
export const TILE_NORTH = 89.099583378875366;
export const TILE_WEST = -180.00791715913877;
export const TILE_DEGREES = 10;
/** 3 arc-seconds. */
export const CELL_DEGREES = 1 / 1200;
/** Around the area, people are kept this much further, for rings that reach beyond the screen. */
const MARGIN_M = 15_000;
/** At most this many cells in one area (16 MB as 32-bit numbers). */
const MAX_CELLS = 4_000_000;

export const SOURCE = 'GHS-POP R2023A, epoch 2025, 3 arc-seconds (European Commission, JRC)';

/** A grid of people per cell, rows from north to south. */
export interface FineGrid {
  /** West edge and north edge of the grid, degrees. */
  west: number;
  north: number;
  cols: number;
  rows: number;
  people: Float32Array;
}

/** The names of the JRC tiles that cover an area, such as R6_C32 (rows from the north, columns from the west, from 1). */
export function tilesForBounds([w, s, e, n]: Bounds): string[] {
  const rowOf = (lat: number): number => Math.floor((TILE_NORTH - lat) / TILE_DEGREES) + 1;
  const colOf = (lng: number): number => Math.floor((lng - TILE_WEST) / TILE_DEGREES) + 1;
  const names: string[] = [];
  for (let r = rowOf(Math.min(n, 89)); r <= rowOf(Math.max(s, -89.9)); r++) {
    for (let c = colOf(Math.max(w, -180)); c <= colOf(Math.min(e, 180)); c++) names.push(`R${r}_C${c}`);
  }
  return names;
}

/** An area widened by a distance on every side. */
export function widen([w, s, e, n]: Bounds, metres: number): Bounds {
  const dLat = metres / 111_195;
  const dLng = dLat / Math.max(0.05, Math.cos((((s + n) / 2) * Math.PI) / 180));
  return [Math.max(-180, w - dLng), Math.max(-89.9, s - dLat), Math.min(180, e + dLng), Math.min(89.9, n + dLat)];
}

/** An empty grid on the tiles' own cell lines that covers an area. */
export function emptyGrid([w, s, e, n]: Bounds): FineGrid {
  const col0 = Math.floor((w - TILE_WEST) / CELL_DEGREES);
  const col1 = Math.ceil((e - TILE_WEST) / CELL_DEGREES);
  const row0 = Math.floor((TILE_NORTH - n) / CELL_DEGREES);
  const row1 = Math.ceil((TILE_NORTH - s) / CELL_DEGREES);
  const cols = col1 - col0;
  const rows = row1 - row0;
  return { west: TILE_WEST + col0 * CELL_DEGREES, north: TILE_NORTH - row0 * CELL_DEGREES, cols, rows, people: new Float32Array(cols * rows) };
}

/** Does the grid hold the whole circle? */
export function gridCovers(grid: FineGrid, centre: LngLat, radiusM: number): boolean {
  const dLat = radiusM / 111_195;
  const dLng = dLat / Math.max(0.02, Math.cos((centre.lat * Math.PI) / 180));
  const east = grid.west + grid.cols * CELL_DEGREES;
  const south = grid.north - grid.rows * CELL_DEGREES;
  return centre.lng - dLng >= grid.west && centre.lng + dLng <= east && centre.lat + dLat <= grid.north && centre.lat - dLat >= south;
}

/** People in each cell within the circle, with the cell's distance from the centre. */
export function samplesFromGrid(grid: FineGrid, centre: LngLat, radiusM: number): { samples: PopulationSample[]; total: number } {
  const dLat = radiusM / 111_195;
  const dLng = dLat / Math.max(0.02, Math.cos((centre.lat * Math.PI) / 180));
  const row0 = Math.max(0, Math.floor((grid.north - (centre.lat + dLat)) / CELL_DEGREES));
  const row1 = Math.min(grid.rows - 1, Math.floor((grid.north - (centre.lat - dLat)) / CELL_DEGREES));
  const col0 = Math.max(0, Math.floor((centre.lng - dLng - grid.west) / CELL_DEGREES));
  const col1 = Math.min(grid.cols - 1, Math.floor((centre.lng + dLng - grid.west) / CELL_DEGREES));
  const samples: PopulationSample[] = [];
  let total = 0;
  for (let row = row0; row <= row1; row++) {
    const lat = grid.north - (row + 0.5) * CELL_DEGREES;
    for (let col = col0; col <= col1; col++) {
      const people = grid.people[row * grid.cols + col]!;
      if (!(people > 0)) continue;
      const d = distanceM(centre, { lat, lng: grid.west + (col + 0.5) * CELL_DEGREES });
      if (d > radiusM) continue;
      samples.push({ groundRangeM: d, people });
      total += people;
    }
  }
  return { samples, total };
}

// --- The shell: desktop (Electron) or Android (Capacitor plugin) ---------------------------

function androidShell(): PopulationShell | undefined {
  const cap = window.Capacitor;
  const native = cap?.nativePromise;
  if (platform() !== 'android' || typeof native !== 'function' || !cap?.Plugins?.Population) return undefined;
  return {
    fetchTile: (name) => native('Population', 'fetchTile', { name }) as ReturnType<PopulationShell['fetchTile']>,
    readTile: async (name) => {
      const { path } = (await native('Population', 'tilePath', { name })) as { path: string | null };
      if (!path || !cap.convertFileSrc) return null;
      const response = await fetch(cap.convertFileSrc(path));
      return response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
    },
    removeTile: async (name) => {
      await native('Population', 'removeTile', { name });
    },
    onProgress: (listener) => {
      let removed = false;
      let handle: { remove: () => void } | null = null;
      const added = cap.Plugins?.Population?.addListener?.('progress', ((event: { share?: number }) => listener(event?.share ?? 0)) as () => void);
      void Promise.resolve(added).then((h) => {
        if (removed) h?.remove();
        else handle = h ?? null;
      });
      return () => {
        removed = true;
        handle?.remove();
      };
    },
  };
}

const shell = (): PopulationShell | undefined => (platform() === 'desktop' ? window.atomicAtlasShell?.population : androidShell());

/** True where the 100 m grid can be downloaded with an area. */
export const finePopulationSupported = (): boolean => Boolean(shell());

// --- Storage -----------------------------------------------------------------------------

const CACHE = 'atomic-atlas-population-100m-v1';
const address = (id: string, part: 'json' | 'bin'): string => `https://atomic-atlas.invalid/population-100m/${id}.${part}`;

async function storeGrid(id: string, grid: FineGrid): Promise<void> {
  const cache = await caches.open(CACHE);
  const header = { west: grid.west, north: grid.north, cols: grid.cols, rows: grid.rows };
  await cache.put(address(id, 'json'), new Response(JSON.stringify(header), { headers: { 'Content-Type': 'application/json' } }));
  await cache.put(address(id, 'bin'), new Response(grid.people.buffer as ArrayBuffer, { headers: { 'Content-Type': 'application/octet-stream' } }));
}

const loaded = new Map<string, Promise<FineGrid | null>>();

function loadGrid(id: string): Promise<FineGrid | null> {
  let grid = loaded.get(id);
  if (!grid) {
    grid = (async () => {
      try {
        const cache = await caches.open(CACHE);
        const [head, body] = await Promise.all([cache.match(address(id, 'json')), cache.match(address(id, 'bin'))]);
        if (!head || !body) return null;
        const header = (await head.json()) as Omit<FineGrid, 'people'>;
        return { ...header, people: new Float32Array(await body.arrayBuffer()) };
      } catch {
        return null;
      }
    })();
    loaded.set(id, grid);
  }
  return grid;
}

/** Removes every stored grid (they go with the map areas). */
export async function clearFinePopulation(): Promise<void> {
  loaded.clear();
  try {
    await caches.delete(CACHE);
  } catch {
    // Nothing stored.
  }
}

// --- Download ----------------------------------------------------------------------------

/**
 * Downloads the 100 m population around an area and keeps it under the area's id. The tiles
 * are fetched one by one, cut and deleted. Resolves to what was kept, or null when the shell
 * cannot fetch tiles or a tile could not be read.
 */
export async function downloadFinePopulation(id: string, bounds: Bounds, onProgress: (share: number) => void): Promise<OfflineArea['population'] | null> {
  const s = shell();
  if (!s) return null;
  let wide = widen(bounds, MARGIN_M);
  let grid = emptyGrid(wide);
  // A very large area keeps no margin, then nothing finer than what fits.
  if (grid.cols * grid.rows > MAX_CELLS) {
    wide = bounds;
    grid = emptyGrid(wide);
    if (grid.cols * grid.rows > MAX_CELLS) return null;
  }
  const names = tilesForBounds(wide);
  const { fromArrayBuffer } = await import('geotiff');
  for (const [i, name] of names.entries()) {
    const off = s.onProgress((share) => onProgress((i + share * 0.9) / names.length));
    let result;
    try {
      result = await s.fetchTile(name);
    } finally {
      off();
    }
    if (result.missing) continue;
    if (!result.ok) return null;
    try {
      const bytes = await s.readTile(name);
      if (!bytes) return null;
      const image = await (await fromArrayBuffer(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)).getImage();
      const [originLng, originLat] = image.getOrigin() as [number, number];
      // The part of the grid inside this tile, in the tile's pixels.
      const colInTile = Math.round((grid.west - originLng) / CELL_DEGREES);
      const rowInTile = Math.round((originLat - grid.north) / CELL_DEGREES);
      const x0 = Math.max(0, colInTile);
      const y0 = Math.max(0, rowInTile);
      const x1 = Math.min(image.getWidth(), colInTile + grid.cols);
      const y1 = Math.min(image.getHeight(), rowInTile + grid.rows);
      if (x1 > x0 && y1 > y0) {
        const [band] = (await image.readRasters({ window: [x0, y0, x1, y1] })) as unknown as [ArrayLike<number>];
        const width = x1 - x0;
        for (let y = y0; y < y1; y++) {
          const gridRow = (y - rowInTile) * grid.cols;
          for (let x = x0; x < x1; x++) {
            const v = band[(y - y0) * width + (x - x0)]!;
            if (v > 0) grid.people[gridRow + (x - colInTile)] = v;
          }
        }
      }
    } finally {
      await s.removeTile(name);
    }
    onProgress((i + 1) / names.length);
  }
  await storeGrid(id, grid);
  loaded.set(id, Promise.resolve(grid));
  let people = 0;
  for (const v of grid.people) people += v;
  return { people: Math.round(people), bytes: grid.people.byteLength };
}

// --- Query -------------------------------------------------------------------------------

/**
 * People within `radiusM` of a point on the 100 m grid of a downloaded area that holds the
 * whole circle; null when no area does.
 */
export async function finePopulationAround(centre: LngLat, radiusM: number): Promise<{ samples: PopulationSample[]; total: number } | null> {
  if (typeof caches === 'undefined') return null;
  for (const area of offlineAreas()) {
    if (!area.population) continue;
    const grid = await loadGrid(area.id);
    if (grid && gridCovers(grid, centre, radiusM)) return samplesFromGrid(grid, centre, radiusM);
  }
  return null;
}
