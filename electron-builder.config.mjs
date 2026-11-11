// Packaging of the desktop app: .deb for Linux, Setup.exe for Windows.
// Run through the npm scripts: `npm run dist:linux`, `npm run dist:win`.

import { realpathSync } from 'node:fs';

// dist/ may be a link to a folder outside the project (scripts/link-cache.mjs);
// the packager does not follow links, so it is given the real location.
const dist = realpathSync('dist');

const config = {
  appId: 'store.themechanic.atomicatlas',
  productName: 'Atomic Atlas',
  copyright: 'Copyright © 2026 The Mechanic',
  directories: {
    output: 'release',
    buildResources: 'installer',
  },
  // Everything the app needs is bundled into dist/; no node_modules at run time.
  files: [
    'package.json',
    { from: `${dist}/app`, to: 'dist/app' },
    { from: `${dist}/desktop`, to: 'dist/desktop' },
  ],
  asar: true,
  electronLanguages: ['en-US', 'el'],
  artifactName: 'atomic-atlas-${version}-${os}-${arch}.${ext}',
  afterPack: './installer/after-pack.mjs',

  linux: {
    target: [{ target: 'deb', arch: ['x64'] }],
    icon: 'installer/icons',
    category: 'Education',
    executableName: 'atomic-atlas',
    syncDesktopName: true,
    synopsis: 'Educational simulator of the effects of nuclear weapons',
    description:
      'Atomic Atlas shows what nuclear explosions do: blast, heat, radiation and fallout, on a real map and globe. Built for learning, with public scientific models and the source of every number one click away.',
    maintainer: 'The Mechanic <support@themechanic.store>',
    vendor: 'The Mechanic',
    desktop: {
      entry: {
        Name: 'Atomic Atlas',
        Comment: 'Educational simulator of the effects of nuclear weapons',
        Categories: 'Education;Science;Geography;',
        Keywords: 'nuclear;simulator;map;globe;fallout;',
        StartupWMClass: 'atomic-atlas',
      },
    },
  },
  deb: {
    priority: 'optional',
    packageCategory: 'education',
    compression: 'xz',
  },

  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    icon: 'installer/icons/icon.ico',
    legalTrademarks: 'The Mechanic',
    // The icon and version details are written by installer/after-pack.mjs, which needs no Wine.
    signAndEditExecutable: false,
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    artifactName: 'Atomic-Atlas-Setup-${version}.${ext}',
    shortcutName: 'Atomic Atlas',
    uninstallDisplayName: 'Atomic Atlas',
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    deleteAppDataOnUninstall: false,
  },
};

export default config;
