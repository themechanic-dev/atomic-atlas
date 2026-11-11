#!/usr/bin/env node
// Builds the Android APK from the Capacitor project in mobile/android and
// copies it to release/. Run `npm run android:sync` first (the npm script
// `android:apk` does both).
//
//   node scripts/build-apk.mjs            debug build, installable for testing
//   node scripts/build-apk.mjs release    release build (needs a signing configuration)

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const android = join(root, 'mobile/android');
const variant = process.argv[2] === 'release' ? 'release' : 'debug';
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

if (!process.env.ANDROID_HOME && !process.env.ANDROID_SDK_ROOT && !existsSync(join(android, 'local.properties'))) {
  console.error('Android SDK not found: set ANDROID_HOME or create mobile/android/local.properties with sdk.dir=...');
  process.exit(1);
}

const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
const task = variant === 'release' ? 'assembleRelease' : 'assembleDebug';
const result = spawnSync(gradlew, [task, '--console=plain', '--warning-mode=summary'], {
  cwd: android,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (result.status !== 0) process.exit(result.status ?? 1);

const built = join(android, `app/build/outputs/apk/${variant}/app-${variant}${variant === 'release' && !existsSync(join(android, `app/build/outputs/apk/release/app-release.apk`)) ? '-unsigned' : ''}.apk`);
const target = join(root, 'release', `atomic-atlas-${version}-android-${variant}.apk`);
mkdirSync(dirname(target), { recursive: true });
copyFileSync(built, target);
console.log(`${target}  ${(statSync(target).size / 1e6).toFixed(1)} MB`);
