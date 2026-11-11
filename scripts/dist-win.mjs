#!/usr/bin/env node
// Builds the Windows installer. On Windows it simply runs electron-builder.
// On Linux and macOS it first puts installer/tools at the front of PATH, where
// a small stand-in answers the one call electron-builder makes to Wine.

import { spawnSync } from 'node:child_process';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...process.env };
if (process.platform !== 'win32') {
  env.PATH = `${join(root, 'installer/tools')}${delimiter}${env.PATH ?? ''}`;
  env.USE_SYSTEM_WINE = 'true';
}

const bin = join(root, 'node_modules/.bin', process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder');
const result = spawnSync(bin, ['--config', 'electron-builder.config.mjs', '--win', ...process.argv.slice(2)], {
  cwd: root,
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
process.exit(result.status ?? 1);
