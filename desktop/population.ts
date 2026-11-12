// Population at 100 m for the offline areas (GHS-POP 2025, 3 arc-seconds, European Commission JRC).
// The JRC publishes it in 10-degree tiles, each a zip of 20–170 MB holding one GeoTIFF. The
// server sends no CORS headers, so the page cannot fetch them: the shell downloads a tile,
// takes the GeoTIFF out of the zip and hands it to the page, which cuts out the area and keeps
// only that. The page then asks for the tile to be deleted.

import { mkdirSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { app, type WebContents } from 'electron';
import { download } from './download';

const BASE = 'https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/GHS_POP_GLOBE_R2023A/GHS_POP_E2025_GLOBE_R2023A_4326_3ss/V1-0/tiles';
const TILE = /^R\d{1,2}_C\d{1,2}$/;

const folder = (): string => join(app.getPath('userData'), 'population-tiles');
const tifPath = (name: string): string => join(folder(), `${name}.tif`);

export interface TileResult {
  ok: boolean;
  /** The tile does not exist: open sea, nobody lives there. */
  missing?: boolean;
  error?: string;
}

/**
 * The one GeoTIFF inside a tile's zip. A zip ends with a directory of its entries; each entry
 * points to a local header followed by the data, deflated or stored.
 */
export function extractTif(zip: Buffer): Buffer {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) throw new Error('not a zip');
  const entries = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);
  for (let i = 0; i < entries; i++) {
    if (zip.readUInt32LE(at) !== 0x02014b50) throw new Error('damaged zip');
    const method = zip.readUInt16LE(at + 10);
    const compressed = zip.readUInt32LE(at + 20);
    const nameLength = zip.readUInt16LE(at + 28);
    const extraLength = zip.readUInt16LE(at + 30);
    const commentLength = zip.readUInt16LE(at + 32);
    const local = zip.readUInt32LE(at + 42);
    const name = zip.toString('utf8', at + 46, at + 46 + nameLength);
    at += 46 + nameLength + extraLength + commentLength;
    if (!name.toLowerCase().endsWith('.tif')) continue;
    const dataStart = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const data = zip.subarray(dataStart, dataStart + compressed);
    if (method === 0) return Buffer.from(data);
    if (method === 8) return inflateRawSync(data);
    throw new Error(`zip method ${method}`);
  }
  throw new Error('no GeoTIFF in the zip');
}

export async function fetchPopulationTile(name: unknown, sender: WebContents): Promise<TileResult> {
  if (typeof name !== 'string' || !TILE.test(name)) return { ok: false, error: 'bad tile name' };
  mkdirSync(folder(), { recursive: true });
  const zipPath = join(folder(), `${name}.zip`);
  const url = `${BASE}/GHS_POP_E2025_GLOBE_R2023A_4326_3ss_V1_0_${name}.zip`;
  try {
    const head = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    if (head.status === 404) return { ok: false, missing: true };
    const total = Number(head.headers.get('content-length')) || 0;
    let received = 0;
    await download(url, zipPath, (n) => {
      received += n;
      if (total > 0 && !sender.isDestroyed()) sender.send('population:progress', Math.min(1, received / total));
    }, total > 0 ? { bytes: total } : {});
    await writeFile(tifPath(name), extractTif(await readFile(zipPath)));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    await rm(zipPath, { force: true });
    await rm(`${zipPath}.part`, { force: true });
  }
}

export async function readPopulationTile(name: unknown): Promise<Uint8Array | null> {
  if (typeof name !== 'string' || !TILE.test(name)) return null;
  try {
    return new Uint8Array(await readFile(tifPath(name)));
  } catch {
    return null;
  }
}

export async function removePopulationTile(name: unknown): Promise<void> {
  if (typeof name === 'string' && TILE.test(name)) await rm(tifPath(name), { force: true });
}
