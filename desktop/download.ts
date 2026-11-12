// Downloads for the optional parts (voice, assistant): written chunk by chunk in order,
// to a temporary name, checked for size and, where known, for its SHA-256, then renamed.

import { createHash } from 'node:crypto';
import { open, rename, rm } from 'node:fs/promises';

export interface Expected {
  bytes?: number;
  sha256?: string;
}

export async function download(url: string, target: string, onBytes: (n: number) => void, expected: Expected = {}): Promise<void> {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok || !response.body) throw new Error(`${response.status} ${url}`);
  const partial = `${target}.part`;
  const file = await open(partial, 'w');
  const hash = createHash('sha256');
  let size = 0;
  try {
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      // Each chunk is written fully before the next is read.
      await file.write(value, 0, value.length);
      hash.update(value);
      size += value.length;
      onBytes(value.length);
    }
  } finally {
    await file.close();
  }
  const digest = hash.digest('hex');
  if ((expected.bytes !== undefined && size !== expected.bytes) || (expected.sha256 !== undefined && digest !== expected.sha256.toLowerCase())) {
    await rm(partial, { force: true });
    throw new Error(`The download of ${url} was damaged (${size} bytes, sha256 ${digest}).`);
  }
  await rename(partial, target);
}
