#!/usr/bin/env node
// Renders the app icon in every size the three platforms need, from the same
// drawing code the app uses for its logo (app/ui/logo.ts).
//
//   node scripts/make-icons.mjs
//
// Output:
//   app/public/icons/icon-<size>.png        web UI and Electron window icon
//   installer/icons/<size>x<size>.png       Linux packages
//   installer/icons/icon.ico                Windows installer and executable
//   mobile/android/app/src/main/res/...     Android launcher icons (when the Android project exists)

import { Resvg } from '@resvg/resvg-js';
import { build } from 'esbuild';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pngToIco from 'png-to-ico';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// The logo code is TypeScript; bundle it to a temporary module and import that.
const bundle = join(tmpdir(), `atomic-atlas-logo-${process.pid}.mjs`);
await build({
  entryPoints: [join(root, 'app/ui/logo.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: bundle,
  logLevel: 'warning',
});
const { logoMarkup, variantForSize } = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

/** PNG of the icon at a pixel size. `inset` shrinks the mark inside a transparent canvas. */
function png(size, { background = true, inset = 1, variant } = {}) {
  const markup = logoMarkup({ variant: variant ?? variantForSize(size * inset), uid: 'i', background });
  const view = 200 / inset;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${-view / 2} ${-view / 2} ${view} ${view}">${markup}</svg>`;
  return new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
}

function write(file, data) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, data);
}

const webSizes = [16, 24, 32, 48, 64, 128, 192, 256, 512, 1024];
for (const size of webSizes) write(join(root, `app/public/icons/icon-${size}.png`), png(size));

const linuxSizes = [16, 24, 32, 48, 64, 128, 256, 512];
for (const size of linuxSizes) write(join(root, `installer/icons/${size}x${size}.png`), png(size));

const icoSizes = [16, 24, 32, 48, 64, 128, 256];
write(join(root, 'installer/icons/icon.ico'), await pngToIco(icoSizes.map((size) => Buffer.from(png(size)))));

// Android: legacy launcher icons plus the foreground of the adaptive icon.
const res = join(root, 'mobile/android/app/src/main/res');
if (existsSync(res)) {
  const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [name, scale] of Object.entries(densities)) {
    const legacy = Math.round(48 * scale);
    write(join(res, `mipmap-${name}/ic_launcher.png`), png(legacy));
    write(join(res, `mipmap-${name}/ic_launcher_round.png`), png(legacy));
    // The adaptive icon is 108 dp with the middle 66 dp guaranteed visible.
    const adaptive = Math.round(108 * scale);
    write(join(res, `mipmap-${name}/ic_launcher_foreground.png`), png(adaptive, { background: false, inset: 0.58, variant: 'full' }));
  }
  console.log('android launcher icons written');
}

console.log(`icons: ${webSizes.length} web, ${linuxSizes.length} linux, 1 ico`);
