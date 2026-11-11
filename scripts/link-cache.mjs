#!/usr/bin/env node
// Optional: keep heavy, regenerable folders (node_modules, build output) outside
// the source tree and link them back in.
//
//   node scripts/link-cache.mjs            create the links
//   node scripts/link-cache.mjs --status   show where each folder points
//
// The target is $ATOMIC_ATLAS_CACHE, or <user cache dir>/atomic-atlas.
// Nothing in the build depends on the links: plain folders work the same.

import { existsSync, lstatSync, mkdirSync, readlinkSync, symlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cacheRoot =
  process.env.ATOMIC_ATLAS_CACHE ||
  join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'atomic-atlas');

// project path -> folder name inside the cache
const LINKS = {
  'node_modules': 'node_modules',
  'dist': 'dist',
  'release': 'release',
  'mobile/android/.gradle': 'android/dot-gradle',
  'mobile/android/build': 'android/build',
  'mobile/android/app/build': 'android/app-build',
};

const statusOnly = process.argv.includes('--status');
let failed = false;

for (const [rel, name] of Object.entries(LINKS)) {
  const link = join(root, rel);
  const target = join(cacheRoot, name);
  let stat = null;
  try {
    stat = lstatSync(link);
  } catch {
    // does not exist yet
  }

  if (statusOnly) {
    const where = !stat ? 'missing' : stat.isSymbolicLink() ? `-> ${readlinkSync(link)}` : 'real folder';
    console.log(`${rel.padEnd(28)} ${where}`);
    continue;
  }

  if (stat?.isSymbolicLink()) continue;
  if (stat) {
    console.error(`${rel}: a real folder is in the way. Move or delete it, then run this again.`);
    failed = true;
    continue;
  }
  if (!existsSync(dirname(link))) continue; // e.g. the Android project is not generated yet
  mkdirSync(target, { recursive: true });
  symlinkSync(target, link, 'dir');
  console.log(`${rel} -> ${target}`);
}

process.exit(failed ? 1 : 0);
