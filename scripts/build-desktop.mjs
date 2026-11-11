#!/usr/bin/env node
// Bundles the Electron main process and the preload script into dist/desktop.

import { build } from 'esbuild';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  sourcemap: false,
  logLevel: 'info',
};

await build({
  ...common,
  entryPoints: [resolve(root, 'desktop/main.ts')],
  outfile: resolve(root, 'dist/desktop/main.cjs'),
});

await build({
  ...common,
  entryPoints: [resolve(root, 'desktop/preload.ts')],
  outfile: resolve(root, 'dist/desktop/preload.cjs'),
});
