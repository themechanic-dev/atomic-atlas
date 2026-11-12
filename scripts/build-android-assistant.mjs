#!/usr/bin/env node
// Builds llama.cpp's llama-server for Android arm64 and puts it where the app packs it
// as a native library (mobile/android/app/src/main/jniLibs/arm64-v8a/libllamaserver.so,
// a link into the cache). The Android assistant plugin runs it as a program.
//
// Needs, in ~/.cache/atomic-atlas/android-build/ (see ΣΥΝΕΧΕΙΑ.md, phase 0.8):
//   android-ndk-r29/           from dl.google.com/android/repository/android-ndk-r29-linux.zip (unpack with unzip: it has links)
//   cmake-4.4.5-linux-x86_64/  from github.com/Kitware/CMake/releases
//   llama.cpp-b12308/          from github.com/ggml-org/llama.cpp/archive/refs/tags/b12308.tar.gz
//
// Usage: node scripts/build-android-assistant.mjs

import { execFileSync } from 'node:child_process';
import { mkdirSync, symlinkSync, existsSync, lstatSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const work = join(homedir(), '.cache/atomic-atlas/android-build');
const ndk = join(work, 'android-ndk-r29');
const cmake = join(work, 'cmake-4.4.5-linux-x86_64/bin/cmake');
const source = join(work, 'llama.cpp-b12308');
const build = join(work, 'build-arm64');
const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' });

run(cmake, [
  '-S', source, '-B', build, '-G', 'Unix Makefiles',
  `-DCMAKE_TOOLCHAIN_FILE=${ndk}/build/cmake/android.toolchain.cmake`,
  '-DANDROID_ABI=arm64-v8a', '-DANDROID_PLATFORM=android-24', '-DCMAKE_BUILD_TYPE=Release',
  '-DBUILD_SHARED_LIBS=OFF', '-DLLAMA_CURL=OFF', '-DLLAMA_OPENSSL=OFF', '-DGGML_OPENMP=OFF',
  // Phones from about 2019 on: ARMv8.2 with dot product and half precision.
  '-DGGML_NATIVE=OFF', '-DGGML_CPU_ARM_ARCH=armv8.2-a+dotprod+fp16',
  '-DLLAMA_BUILD_TESTS=OFF', '-DLLAMA_BUILD_EXAMPLES=OFF', '-DLLAMA_BUILD_SERVER=ON', '-DLLAMA_BUILD_TOOLS=ON',
]);
run(cmake, ['--build', build, '--target', 'llama-server', '-j', '14']);
const libs = join(work, 'jniLibs/arm64-v8a');
mkdirSync(libs, { recursive: true });
run(join(ndk, 'toolchains/llvm/prebuilt/linux-x86_64/bin/llvm-strip'), ['-o', join(libs, 'libllamaserver.so'), join(build, 'bin/llama-server')]);
const link = join(root, 'mobile/android/app/src/main/jniLibs');
if (!existsSync(link) && !(() => { try { return lstatSync(link).isSymbolicLink(); } catch { return false; } })()) symlinkSync(join(work, 'jniLibs'), link);
console.log('llama-server for Android arm64 ready');
