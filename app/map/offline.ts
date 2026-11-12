// Offline areas for the detailed map (OpenFreeMap): the user downloads the area on screen,
// and the map then works there without internet.
//
// Every request of the detailed map goes through the `aaoff://` protocol: the network first,
// the stored copy when there is no network. Inside the style and the tile index the
// addresses are rewritten to this protocol, so that tiles, fonts and icons all pass through it.

import * as maplibregl from 'maplibre-gl';

const PREFIX = 'aaoff://';
const CACHE = 'atomic-atlas-offline-v1';
const AREAS_KEY = 'atomic-atlas.offline-areas.v1';
/** Tiles are stored down to street level. */
export const MAX_ZOOM = 14;
/** More tiles than this in one area would take too long and too much space. */
export const MAX_TILES = 6000;

export interface OfflineArea {
  id: string;
  /** West, south, east, north. */
  bounds: [number, number, number, number];
  tiles: number;
  bytes: number;
  date: string;
}

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

export function offlineAreas(): OfflineArea[] {
  try {
    const list = JSON.parse(localStorage.getItem(AREAS_KEY) ?? '[]') as OfflineArea[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveAreas(list: OfflineArea[]): void {
  try {
    localStorage.setItem(AREAS_KEY, JSON.stringify(list));
  } catch {
    // Storage unavailable: the tiles are stored; only the list is lost.
  }
}

const lngToX = (lng: number, z: number): number => Math.floor(((lng + 180) / 360) * 2 ** z);
const latToY = (lat: number, z: number): number => {
  const r = (Math.max(-85.05, Math.min(85.05, lat)) * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

/** The tiles of an area at every zoom up to MAX_ZOOM, as [z, x, y]. */
export function tilesFor(bounds: [number, number, number, number]): Array<[number, number, number]> {
  const [w, s, e, n] = bounds;
  const out: Array<[number, number, number]> = [];
  for (let z = 0; z <= MAX_ZOOM; z++) {
    const x0 = lngToX(w, z);
    const x1 = lngToX(e, z);
    const y0 = latToY(n, z);
    const y1 = latToY(s, z);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push([z, x, y]);
  }
  return out;
}

/** Font ranges the map's labels use: Latin, Greek and common symbols. */
const GLYPH_RANGES = ['0-255', '256-511', '768-1023', '1024-1279', '7936-8191', '8192-8447', '8448-8703'];

/**
 * Downloads everything the detailed map needs for an area: the style, the tile index, the
 * icons, the fonts and the tiles. `onProgress` gets the share done.
 */
export async function downloadArea(styleUrl: string, bounds: [number, number, number, number], onProgress: (share: number) => void): Promise<OfflineArea> {
  const cache = await caches.open(CACHE);
  let bytes = 0;
  const store = async (url: string): Promise<Response | null> => {
    const response = await fetch(url);
    if (!response.ok) return null;
    const copy = response.clone();
    bytes += (await copy.arrayBuffer()).byteLength;
    await cache.put(url, response.clone());
    return response;
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
  if (tiles.length > MAX_TILES) throw new Error('too large');
  const jobs = templates.flatMap(({ template, maxzoom }) =>
    tiles.filter(([z]) => z <= maxzoom).map(([z, x, y]) => template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y))),
  );
  let done = 0;
  // A few at a time, to be quick without flooding the server.
  const queue = [...jobs];
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      for (let url = queue.shift(); url; url = queue.shift()) {
        await store(url).catch(() => null);
        done++;
        if (done % 20 === 0) onProgress(done / jobs.length);
      }
    }),
  );
  onProgress(1);
  const area: OfflineArea = { id: `${Date.now()}`, bounds, tiles: tiles.length, bytes, date: new Date().toISOString().slice(0, 10) };
  saveAreas([...offlineAreas(), area]);
  return area;
}

/** Removes all stored areas (tiles are shared between areas, so they go together). */
export async function clearAreas(): Promise<void> {
  try {
    await caches.delete(CACHE);
  } catch {
    // Nothing stored.
  }
  saveAreas([]);
}
