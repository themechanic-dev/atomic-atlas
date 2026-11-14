// The web version's downloads: the configuration that turns the button on, the links that
// always name the latest release, and the QR code, decoded back with a QR reader.

import { describe, expect, it } from 'vitest';
import jsQR from 'jsqr';
import { qrMatrix } from '../app/lib/qr';
import { DEFAULT_DOWNLOADS, latestUrl, parseDownloads } from '../app/state/downloads';
import shipped from '../app/public/downloads.json';

describe('downloads', () => {
  it('ship turned off, for the repository that will hold the releases', () => {
    const c = parseDownloads(shipped)!;
    expect(c.enabled).toBe(false);
    expect(c.repo).toBe('themechanic-dev/atomic-atlas');
    expect(c.files).toEqual(DEFAULT_DOWNLOADS.files);
  });

  it('turn on only with "enabled": true and keep only safe names', () => {
    expect(parseDownloads({ enabled: 'yes' })!.enabled).toBe(false);
    expect(parseDownloads({ enabled: true })!.enabled).toBe(true);
    expect(parseDownloads(null)).toBeNull();
    const c = parseDownloads({ enabled: true, repo: 'evil/../x" onload', files: { apk: '../a.apk', deb: 'x.deb', exe: 'y.exe' } })!;
    expect(c.repo).toBe(DEFAULT_DOWNLOADS.repo);
    expect(c.files.apk).toBe(DEFAULT_DOWNLOADS.files.apk);
    expect(c.files.deb).toBe('x.deb');
  });

  it('link to the latest release, by names without a version', () => {
    const url = latestUrl(DEFAULT_DOWNLOADS, DEFAULT_DOWNLOADS.files.apk);
    expect(url).toBe('https://github.com/themechanic-dev/atomic-atlas/releases/latest/download/atomic-atlas-android.apk');
    for (const name of Object.values(DEFAULT_DOWNLOADS.files)) expect(name).not.toMatch(/\d+\.\d+/);
  });

  it('draw a QR code that a reader decodes back to the link', () => {
    const text = latestUrl(DEFAULT_DOWNLOADS, DEFAULT_DOWNLOADS.files.apk);
    const m = qrMatrix(text);
    const scale = 8;
    const quiet = 4;
    const size = (m.length + 2 * quiet) * scale;
    const data = new Uint8ClampedArray(size * size * 4).fill(255);
    m.forEach((row, y) =>
      row.forEach((dark, x) => {
        if (!dark) return;
        for (let dy = 0; dy < scale; dy++)
          for (let dx = 0; dx < scale; dx++) {
            const i = (((y + quiet) * scale + dy) * size + (x + quiet) * scale + dx) * 4;
            data[i] = data[i + 1] = data[i + 2] = 0;
          }
      }),
    );
    expect(jsQR(data, size, size)?.data).toBe(text);
  });
});
