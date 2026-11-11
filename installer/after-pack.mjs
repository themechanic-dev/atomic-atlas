// electron-builder hook, run after the app folder is assembled.
//
// On Windows it writes the icon and the version details into the executable.
// electron-builder normally does this with rcedit, which needs Wine when the
// build runs on Linux or macOS; resedit is plain JavaScript and runs anywhere.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as PELibrary from 'pe-library';
import * as ResEdit from 'resedit';

const ENGLISH_US = 1033;
const UNICODE = 1200;

export default async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;

  const { productFilename, version, copyright } = context.packager.appInfo;
  const exePath = join(context.appOutDir, `${productFilename}.exe`);
  const iconPath = join(context.packager.projectDir, 'installer/icons/icon.ico');

  const exe = PELibrary.NtExecutable.from(readFileSync(exePath), { ignoreCert: true });
  const resources = PELibrary.NtExecutableResource.from(exe);

  // Icon: replace every icon group the Electron executable ships with.
  const icon = ResEdit.Data.IconFile.from(readFileSync(iconPath));
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(resources.entries);
  for (const group of groups) {
    ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
      resources.entries,
      group.id,
      group.lang,
      icon.icons.map((item) => item.data),
    );
  }

  // Version details shown in Explorer and in the task manager.
  const [major = 0, minor = 0, patch = 0] = version.split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  const info = ResEdit.Resource.VersionInfo.fromEntries(resources.entries)[0] ?? ResEdit.Resource.VersionInfo.createEmpty();
  info.setFileVersion(major, minor, patch, 0, ENGLISH_US);
  info.setProductVersion(major, minor, patch, 0, ENGLISH_US);
  info.setStringValues(
    { lang: ENGLISH_US, codepage: UNICODE },
    {
      CompanyName: 'The Mechanic',
      FileDescription: 'Atomic Atlas',
      ProductName: 'Atomic Atlas',
      InternalName: 'Atomic Atlas',
      OriginalFilename: `${productFilename}.exe`,
      LegalCopyright: copyright,
      FileVersion: version,
      ProductVersion: version,
    },
  );
  info.outputToResourceEntries(resources.entries);

  resources.outputResource(exe);
  writeFileSync(exePath, Buffer.from(exe.generate()));
  console.log(`  • icon and version details written  file=${exePath}`);
}
