import { cpSync, createReadStream, existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, extname, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const root = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { version: string };

// node_modules may be a link to a folder outside the project (scripts/link-cache.mjs).
const nodeModules = realpathSync(resolve(root, 'node_modules'));

// The globe (Cesium) loads its workers, star map and built-in world image at run time
// from a folder next to the page. This serves that folder during development and
// copies it into the build.
function cesiumAssets(): Plugin {
  const source = resolve(nodeModules, '@cesium/engine/Build');
  const types: Record<string, string> = {
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.xml': 'application/xml',
    '.css': 'text/css',
    '.wasm': 'application/wasm',
  };
  return {
    name: 'atomic-atlas-cesium-assets',
    configureServer(server) {
      server.middlewares.use('/cesium', (request, response, next) => {
        const path = normalize(resolve(source, '.' + decodeURIComponent((request.url ?? '/').split('?')[0]!)));
        if (!path.startsWith(source + sep) || !existsSync(path) || !statSync(path).isFile()) return next();
        response.setHeader('Content-Type', types[extname(path)] ?? 'application/octet-stream');
        createReadStream(path).pipe(response);
      });
    },
    closeBundle() {
      cpSync(source, resolve(root, 'dist/app/cesium'), { recursive: true });
    },
  };
}

export default defineConfig({
  plugins: [cesiumAssets()],
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
