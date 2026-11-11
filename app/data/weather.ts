// Live wind profile for a point, from Open-Meteo (free, no key).
// Four levels: 10 m above ground and the 850, 500 and 250 hPa pressure levels,
// each with its real height at that moment.

import type { WindLevel } from '@physics/fallout/wind';
import type { LngLat } from '../lib/geo';

const ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
const PRESSURE_LEVELS = [850, 500, 250] as const;

export interface WeatherSnapshot {
  /** Wind profile, lowest level first; heights above ground. */
  levels: WindLevel[];
  /** Air temperature 2 m above ground, kelvin. */
  temperatureK: number;
  /** Time the values are valid for, ISO 8601 (UTC). */
  time: string;
  /** Height of the model terrain at the point, metres above sea level. */
  elevationM: number;
}

export function weatherUrl(point: LngLat): string {
  const current = [
    'temperature_2m',
    'wind_speed_10m',
    'wind_direction_10m',
    ...PRESSURE_LEVELS.flatMap((p) => [`wind_speed_${p}hPa`, `wind_direction_${p}hPa`, `geopotential_height_${p}hPa`]),
  ].join(',');
  const params = new URLSearchParams({
    latitude: point.lat.toFixed(4),
    longitude: point.lng.toFixed(4),
    current,
    wind_speed_unit: 'ms',
    timezone: 'UTC',
  });
  return `${ENDPOINT}?${params.toString()}`;
}

/** Turns an Open-Meteo "current" response into a wind profile. Throws when fields are missing. */
export function parseWeather(json: unknown): WeatherSnapshot {
  const root = json as { current?: Record<string, unknown>; elevation?: unknown };
  const current = root.current;
  if (!current) throw new Error('weather: no current values');
  const num = (key: string): number => {
    const v = current[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`weather: missing ${key}`);
    return v;
  };
  const elevationM = typeof root.elevation === 'number' ? root.elevation : 0;

  const levels: WindLevel[] = [{ heightM: 10, speedMs: num('wind_speed_10m'), fromDeg: num('wind_direction_10m') }];
  for (const p of PRESSURE_LEVELS) {
    // Geopotential height is above sea level; the profile needs height above ground.
    const height = num(`geopotential_height_${p}hPa`) - elevationM;
    if (height <= levels[levels.length - 1]!.heightM) continue; // level below ground (high terrain)
    levels.push({ heightM: height, speedMs: num(`wind_speed_${p}hPa`), fromDeg: num(`wind_direction_${p}hPa`) });
  }
  return {
    levels,
    temperatureK: num('temperature_2m') + 273.15,
    time: typeof current.time === 'string' ? current.time : '',
    elevationM,
  };
}

export async function fetchWeather(point: LngLat, signal?: AbortSignal): Promise<WeatherSnapshot> {
  const response = await fetch(weatherUrl(point), { signal });
  if (!response.ok) throw new Error(`weather: HTTP ${response.status}`);
  return parseWeather(await response.json());
}
