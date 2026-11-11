#!/usr/bin/env node
// Builds the compact world population grid that ships inside the app.
//
// Input:  GHS-POP R2023A, epoch 2025, 30 arc-seconds (about 1 km), WGS84:
//         GHS_POP_E2025_GLOBE_R2023A_4326_30ss_V1_0.tif (European Commission, JRC)
//         https://human-settlement.emergency.copernicus.eu/download.php
// Output: one small file per 5 x 5 degree block that has people in it, plus index.json.
//
//   node scripts/build-population.mjs <input.tif> <output folder>
//
// Format of a block: 600 x 600 cells, rows from north to south, one byte per cell,
// deflate-compressed. A byte q stands for expm1(q / SCALE) people, times the block's
// correction factor from index.json, which makes every block add up to exactly the
// population of the source.

import { fromFile } from 'geotiff';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

const [, , inputArg, outputArg] = process.argv;
if (!inputArg || !outputArg) {
  console.error('usage: node scripts/build-population.mjs <input.tif> <output folder>');
  process.exit(2);
}
const input = resolve(inputArg);
const output = resolve(outputArg);

const CELLS_PER_DEGREE = 120;
const BLOCK_DEGREES = 5;
const BLOCK_CELLS = BLOCK_DEGREES * CELLS_PER_DEGREE; // 600
const SCALE = 20; // q = round(ln(1 + people) * SCALE): steps of 5 %, up to 344,000 people per cell

const tiff = await fromFile(input);
const image = await tiff.getImage();
const width = image.getWidth();
const height = image.getHeight();
const [originLon, originLat] = image.getOrigin();
const [resLon, resLatSigned] = image.getResolution();
const resLat = Math.abs(resLatSigned);

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

const blocks = {};
let worldTotal = 0;
let maxCell = 0;
let bytes = 0;
const started = Date.now();

for (let latIndex = 0; latIndex < 180 / BLOCK_DEGREES; latIndex++) {
  for (let lonIndex = 0; lonIndex < 360 / BLOCK_DEGREES; lonIndex++) {
    // Source pixel of the first cell centre of this block.
    const lon0 = -180 + lonIndex * BLOCK_DEGREES + 0.5 / CELLS_PER_DEGREE;
    const lat0 = 90 - latIndex * BLOCK_DEGREES - 0.5 / CELLS_PER_DEGREE;
    const col0 = Math.floor((lon0 - originLon) / resLon);
    const row0 = Math.floor((originLat - lat0) / resLat);

    const left = Math.max(col0, 0);
    const top = Math.max(row0, 0);
    const right = Math.min(col0 + BLOCK_CELLS, width);
    const bottom = Math.min(row0 + BLOCK_CELLS, height);
    if (right <= left || bottom <= top) continue;

    const [raster] = await image.readRasters({ window: [left, top, right, bottom] });
    const w = right - left;
    const h = bottom - top;

    const encoded = new Uint8Array(BLOCK_CELLS * BLOCK_CELLS);
    let sourceSum = 0;
    let decodedSum = 0;
    for (let y = 0; y < h; y++) {
      const outRow = (top - row0 + y) * BLOCK_CELLS + (left - col0);
      for (let x = 0; x < w; x++) {
        const people = raster[y * w + x];
        if (!(people > 0)) continue; // also skips NaN and no-data
        sourceSum += people;
        if (people > maxCell) maxCell = people;
        const q = Math.min(255, Math.round(Math.log1p(people) * SCALE));
        if (q === 0) continue;
        encoded[outRow + x] = q;
        decodedSum += Math.expm1(q / SCALE);
      }
    }
    if (!(decodedSum > 0)) continue;

    const packed = deflateSync(encoded, { level: 9 });
    const name = `${latIndex}_${lonIndex}.bin`;
    writeFileSync(join(output, name), packed);
    blocks[`${latIndex}_${lonIndex}`] = [Number((sourceSum / decodedSum).toFixed(6)), Math.round(sourceSum)];
    worldTotal += sourceSum;
    bytes += packed.length;
  }
  process.stdout.write(`\rlatitude band ${latIndex + 1}/${180 / BLOCK_DEGREES}  ${(bytes / 1e6).toFixed(1)} MB`);
}
process.stdout.write('\n');

const index = {
  format: 1,
  source: 'GHS-POP R2023A, epoch 2025, 30 arc-seconds, WGS84 (European Commission, Joint Research Centre)',
  doi: '10.2905/2FF68A52-5B5B-4A22-8F40-C41DA8332CFE',
  epoch: 2025,
  cellsPerDegree: CELLS_PER_DEGREE,
  blockDegrees: BLOCK_DEGREES,
  blockCells: BLOCK_CELLS,
  scale: SCALE,
  compression: 'deflate',
  worldPopulation: Math.round(worldTotal),
  // "latIndex_lonIndex": [correction factor, people in the block]; latIndex counts 5-degree bands from the North Pole,
  // lonIndex counts 5-degree columns eastwards from 180 W.
  blocks,
};
writeFileSync(join(output, 'index.json'), JSON.stringify(index));

console.log(`blocks: ${Object.keys(blocks).length}`);
console.log(`world population: ${(worldTotal / 1e9).toFixed(4)} billion`);
console.log(`densest cell: ${Math.round(maxCell)} people`);
console.log(`size: ${(bytes / 1e6).toFixed(1)} MB in ${((Date.now() - started) / 1000).toFixed(0)} s`);
