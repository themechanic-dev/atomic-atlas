// User settings: language, units, theme, data sources. Stored on the device.

import { effect, signal, type Signal } from '@preact/signals';

export type Language = 'en' | 'el';
export type DistanceUnit = 'km' | 'mi';
export type TemperatureUnit = 'C' | 'F';
export type Theme = 'dark' | 'light';
export type MapSourceId = 'openfreemap' | 'builtin' | 'satellite';
export type WeatherSourceId = 'openmeteo' | 'manual';

export interface Settings {
  language: Language;
  distance: DistanceUnit;
  temperature: TemperatureUnit;
  theme: Theme;
  reduceMotion: boolean;
  mapSource: MapSourceId;
  /** Address of a custom vector style; empty means the default of the chosen source. */
  mapStyleUrl: string;
  weatherSource: WeatherSourceId;
  buildings3d: boolean;
  terrain3d: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  language: 'en',
  distance: 'km',
  temperature: 'C',
  theme: 'dark',
  reduceMotion: false,
  mapSource: 'openfreemap',
  mapStyleUrl: '',
  weatherSource: 'openmeteo',
  buildings3d: true,
  terrain3d: false,
};

const STORAGE_KEY = 'atomic-atlas.settings.v1';

function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === 'string' && (options as readonly string[]).includes(value);
}

/** Reads stored settings and keeps only values that are still valid; anything else falls back to the default. */
export function parseSettings(raw: string | null): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS };
  if (!raw) return out;
  let data: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return out;
    data = parsed as Record<string, unknown>;
  } catch {
    return out;
  }
  if (isOneOf(data.language, ['en', 'el'] as const)) out.language = data.language;
  if (isOneOf(data.distance, ['km', 'mi'] as const)) out.distance = data.distance;
  if (isOneOf(data.temperature, ['C', 'F'] as const)) out.temperature = data.temperature;
  if (isOneOf(data.theme, ['dark', 'light'] as const)) out.theme = data.theme;
  if (isOneOf(data.mapSource, ['openfreemap', 'builtin', 'satellite'] as const)) out.mapSource = data.mapSource;
  if (isOneOf(data.weatherSource, ['openmeteo', 'manual'] as const)) out.weatherSource = data.weatherSource;
  if (typeof data.reduceMotion === 'boolean') out.reduceMotion = data.reduceMotion;
  if (typeof data.buildings3d === 'boolean') out.buildings3d = data.buildings3d;
  if (typeof data.terrain3d === 'boolean') out.terrain3d = data.terrain3d;
  if (typeof data.mapStyleUrl === 'string' && data.mapStyleUrl.length < 2000) out.mapStyleUrl = data.mapStyleUrl;
  return out;
}

function load(): Settings {
  try {
    return parseSettings(localStorage.getItem(STORAGE_KEY));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export const settings: Signal<Settings> = signal(load());

export function updateSettings(patch: Partial<Settings>): void {
  settings.value = { ...settings.value, ...patch };
}

export function resetSettings(): void {
  settings.value = { ...DEFAULT_SETTINGS };
}

/** Starts saving settings and applying theme and language to the document. Call once at start-up. */
export function initSettings(): void {
  effect(() => {
    const s = settings.value;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch {
      // Storage can be unavailable (private mode); the app still works for the session.
    }
    const root = document.documentElement;
    root.dataset.theme = s.theme;
    root.lang = s.language;
    root.classList.toggle('reduce-motion', s.reduceMotion);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', s.theme === 'dark' ? '#16181b' : '#f3f1ec');
  });
}

/** True when motion should be gentle: the app setting or the system preference. */
export function prefersReducedMotion(): boolean {
  if (settings.value.reduceMotion) return true;
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
