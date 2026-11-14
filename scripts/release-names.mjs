#!/usr/bin/env node
// Copies this version's installers to names without a version number, for GitHub releases:
// the web version's Downloads links point at …/releases/latest/download/<name>, so the
// newest release always answers them ("automatic updates").
//
//   node scripts/release-names.mjs     → release/latest/{atomic-atlas-android.apk, atomic-atlas-linux-amd64.deb, Atomic-Atlas-Setup.exe}

import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const names = JSON.parse(readFileSync(join(root, 'app/public/downloads.json'), 'utf8')).files;
const out = join(root, 'release', 'latest');
mkdirSync(out, { recursive: true });
const pairs = [
  [`atomic-atlas-${version}-android-release.apk`, names.apk],
  [`atomic-atlas-${version}-linux-amd64.deb`, names.deb],
  [`Atomic-Atlas-Setup-${version}.exe`, names.exe],
];
let missing = 0;
for (const [from, to] of pairs) {
  const source = join(root, 'release', from);
  if (!existsSync(source)) {
    console.error(`missing ${from}`);
    missing++;
    continue;
  }
  copyFileSync(source, join(out, to));
  console.log(`${from} → latest/${to}`);
}
process.exit(missing ? 1 : 0);
