// Height of the land and depth of the sea at points on the map, read from the
// AWS Terrain Tiles in "terrarium" encoding (the same tiles as the 3D terrain).
// Over the sea they hold the depth of the sea floor, so a negative height is water.
//
// Terrarium: height in metres = (R × 256 + G + B / 256) − 32768.

import { TERRAIN_TILES } from '../map/style';
import type { LngLat } from './geo';

const TILE = 256;
/** Tiles kept in memory (256 × 256 floats each, 256 kB). */
const CACHE_LIMIT = 96;

const cache = new Map<string, Promise<Float32Array | null>>();

export function decodeTerrarium(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

/** Tile and pixel of a point at a zoom level (Web Mercator). */
export function tilePixel(point: LngLat, zoom: number): { x: number; y: number; px: number; py: number } {
  const n = 2 ** zoom;
  const lat = Math.max(-85.0511, Math.min(85.0511, point.lat));
  const fx = ((((point.lng + 180) / 360) % 1) + 1) % 1;
  const s = Math.sin((lat * Math.PI) / 180);
  const fy = 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
  const gx = fx * n * TILE;
  const gy = Math.min(n * TILE - 1e-6, Math.max(0, fy * n * TILE));
  const x = Math.floor(gx / TILE);
  const y = Math.floor(gy / TILE);
  return { x, y, px: Math.min(TILE - 1, Math.floor(gx - x * TILE)), py: Math.min(TILE - 1, Math.floor(gy - y * TILE)) };
}

/** Size of one pixel on the ground at a latitude and zoom, metres. */
export function pixelSizeM(lat: number, zoom: number): number {
  return (40_075_016.7 * Math.cos((lat * Math.PI) / 180)) / (TILE * 2 ** zoom);
}

async function decodeTile(blob: Blob): Promise<Float32Array> {
  const bitmap = await createImageBitmap(blob);
  let context: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  if (typeof OffscreenCanvas !== 'undefined') {
    context = new OffscreenCanvas(TILE, TILE).getContext('2d', { willReadFrequently: true });
  } else {
    const canvas = document.createElement('canvas');
    canvas.width = TILE;
    canvas.height = TILE;
    context = canvas.getContext('2d', { willReadFrequently: true });
  }
  if (!context) throw new Error('no 2d context');
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const data = context.getImageData(0, 0, TILE, TILE).data;
  const heights = new Float32Array(TILE * TILE);
  for (let i = 0; i < heights.length; i++) heights[i] = decodeTerrarium(data[i * 4]!, data[i * 4 + 1]!, data[i * 4 + 2]!);
  return heights;
}

function tile(zoom: number, x: number, y: number): Promise<Float32Array | null> {
  const key = `${zoom}/${x}/${y}`;
  const hit = cache.get(key);
  if (hit) {
    // Most recently used goes to the end.
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const url = TERRAIN_TILES.replace('{z}', String(zoom)).replace('{x}', String(x)).replace('{y}', String(y));
  const loading = fetch(url)
    .then((response) => (response.ok ? response.blob() : Promise.reject(new Error(String(response.status)))))
    .then(decodeTile)
    .catch((error: unknown) => {
      console.warn('elevation tile could not be read', key, error);
      cache.delete(key);
      return null;
    });
  cache.set(key, loading);
  while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  return loading;
}

/** Height of the ground (negative: depth of the sea floor) at a point, metres; null when the tiles cannot be read. */
export async function elevationAt(point: LngLat, zoom = 11): Promise<number | null> {
  const t = tilePixel(point, zoom);
  const heights = await tile(zoom, t.x, t.y);
  return heights ? heights[t.py * TILE + t.px]! : null;
}

/** Heights at many points; tiles are fetched once each. Null for points whose tile could not be read. */
export async function elevationsAt(points: readonly LngLat[], zoom = 11): Promise<Array<number | null>> {
  const located = points.map((p) => tilePixel(p, zoom));
  const keys = new Map<string, Promise<Float32Array | null>>();
  for (const t of located) {
    const key = `${t.x}/${t.y}`;
    if (!keys.has(key)) keys.set(key, tile(zoom, t.x, t.y));
  }
  const tiles = new Map<string, Float32Array | null>();
  await Promise.all([...keys].map(async ([key, p]) => tiles.set(key, await p)));
  return located.map((t) => {
    const heights = tiles.get(`${t.x}/${t.y}`);
    return heights ? heights[t.py * TILE + t.px]! : null;
  });
}

/**
 * The terrain at one zoom level as a grid of pixels over the whole world, for walking
 * from pixel to pixel. Tiles are fetched as the walk reaches them.
 */
export class PixelGrid {
  readonly size: number;
  private readonly tiles = new Map<number, Float32Array | null>();

  constructor(readonly zoom: number) {
    this.size = TILE * 2 ** zoom;
  }

  /** Global pixel of a point. */
  pixelOf(point: LngLat): { gx: number; gy: number } {
    const t = tilePixel(point, this.zoom);
    return { gx: t.x * TILE + t.px, gy: t.y * TILE + t.py };
  }

  /** Centre of a global pixel. */
  pointOf(gx: number, gy: number): LngLat {
    const fx = (gx + 0.5) / this.size;
    const fy = (gy + 0.5) / this.size;
    const lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * fy))) * 180) / Math.PI;
    return { lng: fx * 360 - 180, lat };
  }

  /** Makes sure the tile holding a pixel is loaded; false if it could not be read. */
  async ensure(gx: number, gy: number): Promise<boolean> {
    const key = this.tileKey(gx, gy);
    if (!this.tiles.has(key)) {
      const n = 2 ** this.zoom;
      const x = Math.floor((((gx % this.size) + this.size) % this.size) / TILE);
      const y = Math.floor(gy / TILE);
      this.tiles.set(key, y < 0 || y >= n ? null : await tile(this.zoom, x, y));
    }
    return this.tiles.get(key) !== null;
  }

  /** Height of a pixel whose tile is loaded; NaN otherwise. */
  height(gx: number, gy: number): number {
    const heights = this.tiles.get(this.tileKey(gx, gy));
    if (!heights) return Number.NaN;
    const wx = ((gx % this.size) + this.size) % this.size;
    return heights[(gy % TILE) * TILE + (wx % TILE)]!;
  }

  private tileKey(gx: number, gy: number): number {
    const wx = ((gx % this.size) + this.size) % this.size;
    return Math.floor(gy / TILE) * 2 ** this.zoom + Math.floor(wx / TILE);
  }
}
