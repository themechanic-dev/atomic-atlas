// Builds the infrastructure shown on the map from two open datasets:
//   - OurAirports (public domain): large and medium airports
//   - Global Power Plant Database 1.3 (World Resources Institute, CC BY 4.0): power stations
//
// Usage: node scripts/build-infrastructure.mjs <folder with airports.csv and power.csv>
// Output: app/public/data/infrastructure/sites.json

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const input = process.argv[2];
if (!input) {
  console.error('usage: node scripts/build-infrastructure.mjs <folder with airports.csv and power.csv>');
  process.exit(1);
}

/** A small CSV reader: quoted fields, doubled quotes, commas and line breaks inside quotes. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  const header = rows.shift();
  return rows.filter((r) => r.length === header.length).map((r) => Object.fromEntries(header.map((name, i) => [name, r[i]])));
}

const round = (value) => Math.round(Number(value) * 1e4) / 1e4;

const airports = parseCsv(readFileSync(join(input, 'airports.csv'), 'utf8'))
  .filter((a) => a.type === 'large_airport' || a.type === 'medium_airport')
  .filter((a) => Number.isFinite(Number(a.latitude_deg)) && Number.isFinite(Number(a.longitude_deg)))
  .map((a) => [round(a.longitude_deg), round(a.latitude_deg), a.name, a.type === 'large_airport' ? 1 : 0]);

// Wind and solar farms are spread over large areas and are not buildings; they are left out.
const FUELS = { Nuclear: 'nuclear', Hydro: 'hydro', Coal: 'coal', Gas: 'gas', Oil: 'oil', Petcoke: 'oil', Biomass: 'other', Waste: 'other', Geothermal: 'other', Cogeneration: 'other', Other: 'other' };
const fuelCodes = ['nuclear', 'hydro', 'coal', 'gas', 'oil', 'other'];
const power = parseCsv(readFileSync(join(input, 'power.csv'), 'utf8'))
  .filter((p) => FUELS[p.primary_fuel] !== undefined)
  // Small stations are left out to keep the file small; every nuclear station is kept.
  .filter((p) => p.primary_fuel === 'Nuclear' || Number(p.capacity_mw) >= 100)
  .filter((p) => Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude)))
  .map((p) => [round(p.longitude), round(p.latitude), p.name, fuelCodes.indexOf(FUELS[p.primary_fuel])]);

const out = {
  sources: {
    airports: 'OurAirports (public domain), ourairports.com',
    power: 'Global Power Plant Database v1.3.0, World Resources Institute (CC BY 4.0)',
  },
  fuels: fuelCodes,
  // [longitude, latitude, name, 1 for a large airport]
  airports,
  // [longitude, latitude, name, index into fuels]
  power,
};
const target = join(root, 'app/public/data/infrastructure');
mkdirSync(target, { recursive: true });
writeFileSync(join(target, 'sites.json'), JSON.stringify(out));
console.log(`airports: ${airports.length}, power stations: ${power.length}`);
