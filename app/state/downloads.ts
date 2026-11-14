// The web version's Downloads button: links to the latest installers on GitHub. It stays
// hidden until downloads.json, next to the page, says "enabled": true, so it can be turned
// on without a new build. The links name the release "latest" and files whose names carry
// no version, so they always give the newest installers ("automatic updates").

import { computed, signal } from '@preact/signals';
import { platform } from '../lib/platform';

export interface DownloadsConfig {
  enabled: boolean;
  /** The GitHub repository, "owner/name". */
  repo: string;
  files: { apk: string; deb: string; exe: string };
}

export const DEFAULT_DOWNLOADS: DownloadsConfig = {
  enabled: false,
  repo: 'themechanic-dev/atomic-atlas',
  files: { apk: 'atomic-atlas-android.apk', deb: 'atomic-atlas-linux-amd64.deb', exe: 'Atomic-Atlas-Setup.exe' },
};

export const downloads = signal<DownloadsConfig | null>(null);

/** Keeps only a well-formed configuration; anything else leaves the button hidden. */
export function parseDownloads(data: unknown): DownloadsConfig | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Partial<DownloadsConfig>;
  const name = /^[A-Za-z0-9._-]+$/;
  const repo = typeof d.repo === 'string' && /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(d.repo) ? d.repo : DEFAULT_DOWNLOADS.repo;
  const f = d.files ?? DEFAULT_DOWNLOADS.files;
  const files = {
    apk: typeof f.apk === 'string' && name.test(f.apk) ? f.apk : DEFAULT_DOWNLOADS.files.apk,
    deb: typeof f.deb === 'string' && name.test(f.deb) ? f.deb : DEFAULT_DOWNLOADS.files.deb,
    exe: typeof f.exe === 'string' && name.test(f.exe) ? f.exe : DEFAULT_DOWNLOADS.files.exe,
  };
  return { enabled: d.enabled === true, repo, files };
}

export const latestUrl = (config: DownloadsConfig, file: string): string => `https://github.com/${config.repo}/releases/latest/download/${file}`;

export const downloadLinks = computed(() => {
  const c = downloads.value;
  if (!c?.enabled) return null;
  return { apk: latestUrl(c, c.files.apk), deb: latestUrl(c, c.files.deb), exe: latestUrl(c, c.files.exe), code: `https://github.com/${c.repo}` };
});

/** Reads downloads.json once, in the web version only. */
export function initDownloads(): void {
  if (platform() !== 'web') return;
  fetch('./downloads.json', { cache: 'no-cache' })
    .then((response) => (response.ok ? response.json() : null))
    .then((data: unknown) => (downloads.value = parseDownloads(data)))
    .catch(() => (downloads.value = null));
}

/** What kind of device the page is on, for the right download. */
export function deviceKind(): 'android' | 'ios' | 'desktop' {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
  return 'desktop';
}
