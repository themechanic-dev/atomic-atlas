// Builds the dams shown on the map from the Global Dam Watch database 1.0
// (Lehner et al. 2024, CC BY 4.0): the attribute table GDW_barriers_v1_0.txt.
//
// Kept: dams with a known height and at least 1 million m3 of storage (the range of the
// dam-break relations used, Ackers et al. 2006). Lake control dams are left out: the
// water behind them is a natural lake whose level they only adjust.
//
// Usage: node scripts/build-dams.mjs <path to GDW_barriers_v1_0.txt>
// Output: app/public/data/infrastructure/dams.json

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const input = process.argv[2];
if (!input) {
  console.error('usage: node scripts/build-dams.mjs <path to GDW_barriers_v1_0.txt>');
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

const round = (value, digits) => {
  const f = 10 ** digits;
  return Math.round(Number(value) * f) / f;
};
const known = (value) => Number.isFinite(Number(value)) && Number(value) > 0;

const dams = parseCsv(readFileSync(input, 'utf8'))
  .filter((d) => d.LAKE_CTRL !== 'Yes')
  .filter((d) => known(d.DAM_HGT_M) && known(d.CAP_MCM) && Number(d.CAP_MCM) >= 1)
  .map((d) => {
    const lng = known(Math.abs(Number(d.LONG_DAM))) ? d.LONG_DAM : d.LONG_RIV;
    const lat = Number.isFinite(Number(d.LAT_DAM)) && d.LAT_DAM !== '' ? d.LAT_DAM : d.LAT_RIV;
    const name = d.DAM_NAME || d.RES_NAME || '';
    return [round(lng, 4), round(lat, 4), name, round(d.DAM_HGT_M, 0), round(d.CAP_MCM, 1)];
  })
  .filter((d) => Number.isFinite(d[0]) && Number.isFinite(d[1]) && Math.abs(d[1]) <= 90);

const out = {
  source: 'Global Dam Watch database v1.0, Lehner et al. 2024 (CC BY 4.0), doi:10.6084/m9.figshare.25988293',
  // [longitude, latitude, name, dam height m, storage million m3]
  dams,
};
const target = join(root, 'app/public/data/infrastructure');
mkdirSync(target, { recursive: true });
writeFileSync(join(target, 'dams.json'), JSON.stringify(out));
console.log(`dams: ${dams.length}`);
