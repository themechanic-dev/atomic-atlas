// Stand-in for Wine while the Windows installer is built on Linux or macOS.
//
// electron-builder calls `wine` once in that build: it runs a temporary
// installer whose only job is to write the uninstaller next to itself. The
// same result is produced here without Wine, with the reader electron-builder
// itself uses on macOS, which lifts the uninstaller out of that temporary file.
//
// scripts/dist-win.mjs puts this folder at the front of PATH for the build.

const path = require('node:path');

const target = process.argv[2];
if (!target || !/\.exe$/i.test(target)) {
  console.error(`wine stand-in: unsupported call: ${process.argv.slice(2).join(' ')}`);
  process.exit(1);
}

const { UninstallerReader } = require(require.resolve('app-builder-lib/out/targets/nsis/nsisUtil', { paths: [process.cwd()] }));
// Same name electron-builder expects (NsisTarget.computeScriptAndSignUninstaller).
const uninstaller = path.join(path.dirname(target), `${path.basename(target, 'exe')}__uninstaller.exe`);

UninstallerReader.exec(target, uninstaller).then(
  () => process.exit(0),
  (error) => {
    console.error(`wine stand-in: ${error.message}`);
    process.exit(1);
  },
);
