// Offline areas for the detailed map (OpenFreeMap): the user downloads the area on screen,
// and the map then works there without internet.
//
// Every request of the detailed map goes through the `aaoff://` protocol: the network first,
// the stored copy when there is no network. Inside the style and the tile index the
// addresses are rewritten to this protocol, so that tiles, fonts and icons all pass through it.

import * as maplibregl from 'maplibre-gl';
import { clearFinePopulation, downloadFinePopulation, finePopulationSupported } from '../data/population100';
import { offlineAreas, saveAreas, type OfflineArea } from './areas';
import { completeVectorTile, countTiles, MAX_ZOOM, tilesFor, type Bounds } from './tiles';

export { countTiles, MAX_ZOOM, offlineAreas, type OfflineArea };

const PREFIX = 'aaoff://';
const CACHE = 'atomic-atlas-offline-v1';
/** More tiles than this in one area would take too long and too much space. */
export const MAX_TILES = 6000;


const wrap = (url: string): string => (url.startsWith('https://') ? PREFIX + url : url);
const unwrap = (url: string): string => (url.startsWith(PREFIX) ? url.slice(PREFIX.length) : url);

/** Rewrites the addresses inside a style so that its parts are loaded through the protocol. */
function rewriteStyle(style: Record<string, unknown>): Record<string, unknown> {
  const sources = (style.sources ?? {}) as Record<string, Record<string, unknown>>;
  for (const source of Object.values(sources)) {
    if (typeof source.url === 'string') source.url = wrap(source.url);
    if (Array.isArray(source.tiles)) source.tiles = source.tiles.map((u) => (typeof u === 'string' ? wrap(u) : u));
  }
  if (typeof style.glyphs === 'string') style.glyphs = wrap(style.glyphs);
  // The sprite stays as it is: MapLibre builds its addresses itself and does not keep a
  // custom protocol. Offline, the icons are simply missing (the map replaces them with blanks).
  return style;
}

async function cached(url: string): Promise<Response | undefined> {
  try {
    const cache = await caches.open(CACHE);
    return (await cache.match(url)) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Network first; the stored copy when the network fails. */
async function load(url: string, signal?: AbortSignal): Promise<Response> {
  try {
    const response = await fetch(url, { signal });
    if (response.ok) return response;
    const stored = await cached(url);
    if (stored) return stored;
    return response;
  } catch (error) {
    const stored = await cached(url);
    if (stored) return stored;
    throw error;
  }
}

let registered = false;

/** Registers the protocol with MapLibre. Call once before the map is created. */
export function registerOfflineProtocol(): void {
  if (registered || typeof caches === 'undefined') return;
  registered = true;
  maplibregl.addProtocol('aaoff', async (params, controller) => {
    const url = unwrap(params.url);
    const response = await load(url, controller.signal);
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    if (params.type === 'json') {
      const json = (await response.json()) as Record<string, unknown>;
      // A style or a tile index: its own addresses go through the protocol too.
      if (json.version === 8 && json.sources) return { data: rewriteStyle(json) };
      if (Array.isArray(json.tiles)) json.tiles = (json.tiles as string[]).map(wrap);
      return { data: json };
    }
    if (params.type === 'image') return { data: await createImageBitmap(await response.blob()) };
    return { data: await response.arrayBuffer() };
  });
}

/** The style address to give the map: through the protocol when offline areas are possible. */
export function offlineStyleUrl(url: string): string {
  return registered ? wrap(url) : url;
}


/** Font ranges the map's labels use: Latin, Greek and common symbols. */
const GLYPH_RANGES = ['0-255', '256-511', '768-1023', '1024-1279', '7936-8191', '8192-8447', '8448-8703'];

/**
 * Downloads everything the detailed map needs for an area: the style, the tile index, the
 * icons, the fonts and the tiles. `onProgress` gets the share done.
 */
export async function downloadArea(styleUrl: string, bounds: Bounds, onAllProgress: (share: number) => void): Promise<OfflineArea> {
  // With the 100 m population, the map takes the first half of the progress and the population the second.
  const withPopulation = finePopulationSupported();
  const onProgress = withPopulation ? (share: number): void => onAllProgress(share / 2) : onAllProgress;
  // Counted before anything is fetched or listed: a large area has hundreds of millions of tiles.
  if (countTiles(bounds) > MAX_TILES) throw new Error('too large');
  const cache = await caches.open(CACHE);
  let bytes = 0;
  const store = async (url: string): Promise<Response | null> => {
    const response = await fetch(url);
    if (!response.ok) return null;
    const body = await response.arrayBuffer();
    // A vector tile is kept only whole: a body cut short (seen with a status of 200) would
    // leave a hole in the map offline for good.
    if (/\.pbf(\?|$)/.test(url) && !completeVectorTile(body)) return null;
    bytes += body.byteLength;
    const headers = { 'Content-Type': response.headers.get('Content-Type') ?? 'application/octet-stream' };
    await cache.put(url, new Response(body, { headers }));
    return new Response(body, { headers });
  };
  const styleResponse = await store(styleUrl);
  if (!styleResponse) throw new Error('style');
  const style = (await styleResponse.json()) as { sources: Record<string, { url?: string; tiles?: string[] }>; glyphs?: string; sprite?: string; layers: Array<{ layout?: { 'text-font'?: unknown } }> };
  // Fonts named in the style.
  const fonts = new Set<string>();
  for (const layer of style.layers) {
    const f = layer.layout?.['text-font'];
    if (Array.isArray(f) && f.every((x) => typeof x === 'string')) fonts.add((f as string[]).join(','));
  }
  if (typeof style.glyphs === 'string') {
    for (const font of fonts) for (const range of GLYPH_RANGES) await store(style.glyphs.replace('{fontstack}', encodeURIComponent(font)).replace('{range}', range));
  }
  // Tiles of every vector source.
  // Each source only as deep as it goes (its maxzoom).
  const templates: Array<{ template: string; maxzoom: number }> = [];
  for (const source of Object.values(style.sources) as Array<{ url?: string; tiles?: string[]; maxzoom?: number }>) {
    if (source.url) {
      const index = await store(source.url);
      const json = index ? ((await index.json()) as { tiles?: string[]; maxzoom?: number }) : null;
      for (const template of json?.tiles ?? []) templates.push({ template, maxzoom: json?.maxzoom ?? MAX_ZOOM });
    }
    for (const template of source.tiles ?? []) templates.push({ template, maxzoom: source.maxzoom ?? MAX_ZOOM });
  }
  const tiles = tilesFor(bounds);
  const jobs = templates.flatMap(({ template, maxzoom }) =>
    tiles.filter(([z]) => z <= maxzoom).map(([z, x, y]) => template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y))),
  );
  let done = 0;
  // A few at a time, to be quick without flooding the server.
  const queue = [...jobs];
  const failed: string[] = [];
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      for (let url = queue.shift(); url; url = queue.shift()) {
        if (!(await store(url).catch(() => null))) failed.push(url);
        done++;
        if (done % 20 === 0) onProgress(done / jobs.length);
      }
    }),
  );
  // A tile the server did not give whole at once (busy, or a short network drop) is asked for
  // up to twice more, one at a time, after a pause; what still fails is counted and shown.
  let missing = 0;
  for (const url of failed) {
    let kept = false;
    for (const pause of [500, 1500]) {
      await new Promise((resolve) => setTimeout(resolve, pause));
      if (await store(url).catch(() => null)) {
        kept = true;
        break;
      }
    }
    if (!kept) missing++;
  }
  onProgress(1);
  const area: OfflineArea = { id: `${Date.now()}`, bounds, tiles: tiles.length, bytes, date: new Date().toISOString().slice(0, 10) };
  if (missing > 0) area.missing = missing;
  if (withPopulation) {
    // Without it the map area still works; casualties there use the 1 km grid.
    const population = await downloadFinePopulation(area.id, bounds, (share) => onAllProgress(0.5 + share / 2)).catch((error: unknown) => {
      console.error('population download failed', error);
      return null;
    });
    if (population) area.population = population;
  }
  onAllProgress(1);
  saveAreas([...offlineAreas(), area]);
  return area;
}

/** Removes all stored areas and their population grids (tiles are shared between areas, so they go together). */
export async function clearAreas(): Promise<void> {
  await clearFinePopulation();
  try {
    await caches.delete(CACHE);
  } catch {
    // Nothing stored.
  }
  saveAreas([]);
}
