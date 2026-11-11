#!/usr/bin/env node
// Installs packages when node_modules is kept outside the source tree
// (scripts/link-cache.mjs). Plain `npm install` would replace the link with a
// real folder, so this runs npm in a workspace folder next to the real
// node_modules and copies package.json and package-lock.json back.
//
//   node scripts/npm-install.mjs                      same as `npm install`
//   node scripts/npm-install.mjs install -D some-pkg  any npm arguments
//
// Without the links there is no need for this script: use npm as usual.

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, symlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cacheRoot =
  process.env.ATOMIC_ATLAS_CACHE ||
  join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'atomic-atlas');
const workspace = join(cacheRoot, 'workspace');
const link = join(root, 'node_modules');

let stat = null;
try {
  stat = lstatSync(link);
} catch {
  // no node_modules yet
}
if (stat && !stat.isSymbolicLink()) {
  console.error('node_modules is a real folder here: use npm directly, or move it away and run scripts/link-cache.mjs first.');
  process.exit(1);
}

mkdirSync(workspace, { recursive: true });
const manifests = ['package.json', 'package-lock.json'];
for (const name of manifests) {
  if (existsSync(join(root, name))) copyFileSync(join(root, name), join(workspace, name));
}

const args = process.argv.slice(2);
const result = spawnSync('npm', args.length ? args : ['install'], { cwd: workspace, stdio: 'inherit', shell: process.platform === 'win32' });

for (const name of manifests) {
  const produced = join(workspace, name);
  if (!existsSync(produced)) continue;
  const target = join(root, name);
  if (!existsSync(target) || !readFileSync(produced).equals(readFileSync(target))) copyFileSync(produced, target);
}

if (!stat) {
  mkdirSync(join(workspace, 'node_modules'), { recursive: true });
  symlinkSync(join(workspace, 'node_modules'), link, 'dir');
}
process.exit(result.status ?? 1);
