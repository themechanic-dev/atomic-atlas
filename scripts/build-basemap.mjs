#!/usr/bin/env node
// Builds the small world map that ships inside the app, so the globe works
// without an internet connection.
//
// Sources:
//   Natural Earth 1:50m vectors (public domain), from github.com/nvkelso/natural-earth-vector
//   Noto Sans glyphs for map labels, from the OpenFreeMap font server
//
//   node scripts/build-basemap.mjs [download cache folder]
//
// Output: app/public/data/basemap/*.json and app/public/fonts/Noto Sans Regular/*.pbf

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cache = resolve(
  process.argv[2] ||
    join(process.env.ATOMIC_ATLAS_CACHE || join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'atomic-atlas'), 'data', 'natural-earth'),
);
const outData = join(root, 'app/public/data/basemap');
const outFonts = join(root, 'app/public/fonts/Noto Sans Regular');
mkdirSync(cache, { recursive: true });
mkdirSync(outData, { recursive: true });
mkdirSync(outFonts, { recursive: true });

const NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/';
const FONTS = 'https://tiles.openfreemap.org/fonts/Noto%20Sans%20Regular/';
// Latin, Latin Extended, Greek, Greek Extended, punctuation: enough for English and Greek labels.
const GLYPH_RANGES = ['0-255', '256-511', '768-1023', '7936-8191', '8192-8447'];

async function download(url, file) {
  if (existsSync(file)) return readFileSync(file);
  process.stdout.write(`downloading ${url}\n`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  writeFileSync(file, data);
  return data;
}

async function naturalEarth(name) {
  return JSON.parse((await download(`${NE}${name}.geojson`, join(cache, `${name}.geojson`))).toString('utf8'));
}

const round = (n) => Math.round(n * 100) / 100;

/** Rounds coordinates to 0.01 degree and drops points that repeat. */
function thin(line, closed) {
  const out = [];
  for (const [x, y] of line) {
    const p = [round(x), round(y)];
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  if (closed) {
    if (out.length < 4) return null;
    const first = out[0];
    const last = out[out.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) out.push([first[0], first[1]]);
  } else if (out.length < 2) return null;
  return out;
}

function simplifyGeometry(geometry) {
  switch (geometry.type) {
    case 'Polygon': {
      const rings = geometry.coordinates.map((r) => thin(r, true)).filter(Boolean);
      return rings.length ? { type: 'Polygon', coordinates: rings } : null;
    }
    case 'MultiPolygon': {
      const polygons = geometry.coordinates
        .map((poly) => poly.map((r) => thin(r, true)).filter(Boolean))
        .filter((poly) => poly.length > 0);
      return polygons.length ? { type: 'MultiPolygon', coordinates: polygons } : null;
    }
    case 'LineString': {
      const line = thin(geometry.coordinates, false);
      return line ? { type: 'LineString', coordinates: line } : null;
    }
    case 'MultiLineString': {
      const lines = geometry.coordinates.map((l) => thin(l, false)).filter(Boolean);
      return lines.length ? { type: 'MultiLineString', coordinates: lines } : null;
    }
    default:
      return geometry;
  }
}

function shapes(collection, properties = () => ({})) {
  const features = [];
  for (const feature of collection.features) {
    const geometry = simplifyGeometry(feature.geometry);
    if (geometry) features.push({ type: 'Feature', properties: properties(feature.properties), geometry });
  }
  return { type: 'FeatureCollection', features };
}

function write(name, collection) {
  const text = JSON.stringify(collection);
  writeFileSync(join(outData, `${name}.json`), text);
  console.log(`${name}.json  ${collection.features.length} features  ${(text.length / 1024).toFixed(0)} kB`);
}

write('land', shapes(await naturalEarth('ne_50m_land')));
write('lakes', shapes(await naturalEarth('ne_50m_lakes')));
write('borders', shapes(await naturalEarth('ne_50m_admin_0_boundary_lines_land')));

const countries = await naturalEarth('ne_50m_admin_0_countries');
write('countries', {
  type: 'FeatureCollection',
  features: countries.features
    .filter((f) => Number.isFinite(f.properties.LABEL_X) && Number.isFinite(f.properties.LABEL_Y))
    .map((f) => ({
      type: 'Feature',
      properties: {
        name: f.properties.NAME,
        name_el: f.properties.NAME_EL || f.properties.NAME,
        rank: f.properties.LABELRANK,
      },
      geometry: { type: 'Point', coordinates: [round(f.properties.LABEL_X), round(f.properties.LABEL_Y)] },
    })),
});

const places = await naturalEarth('ne_50m_populated_places_simple');
write('places', {
  type: 'FeatureCollection',
  features: places.features.map((f) => ({
    type: 'Feature',
    properties: {
      name: f.properties.name,
      pop: f.properties.pop_max,
      rank: f.properties.scalerank,
      capital: f.properties.adm0cap === 1 ? 1 : 0,
    },
    geometry: { type: 'Point', coordinates: [round(f.properties.longitude), round(f.properties.latitude)] },
  })),
});

for (const range of GLYPH_RANGES) {
  const data = await download(`${FONTS}${range}.pbf`, join(cache, `noto-sans-regular-${range}.pbf`));
  writeFileSync(join(outFonts, `${range}.pbf`), data);
}
console.log(`glyph ranges: ${GLYPH_RANGES.join(', ')}`);
