import { readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { version: string };

// node_modules may be a link to a folder outside the project (scripts/link-cache.mjs).
const nodeModules = realpathSync(resolve(root, 'node_modules'));

export default defineConfig({
  root: resolve(root, 'app'),
  // Relative URLs: the same build is served from app:// (desktop),
  // https://localhost (Android) and a plain dev server.
  base: './',
  publicDir: resolve(root, 'app/public'),
  resolve: {
    alias: {
      '@app': resolve(root, 'app'),
      '@physics': resolve(root, 'physics'),
      '@data': resolve(root, 'data'),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  oxc: {
    jsx: { runtime: 'automatic', importSource: 'preact' },
  },
  build: {
    outDir: resolve(root, 'dist/app'),
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 2000,
  },
  server: {
    port: 5273,
    strictPort: true,
    fs: { allow: [root, nodeModules] },
  },
  test: {
    root,
    include: ['physics/**/*.test.ts', 'tests/**/*.test.ts', 'app/**/*.test.ts'],
    environment: 'node',
  },
});
