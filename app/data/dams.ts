// Dams with a known height and at least 1 million m3 of storage, from the Global Dam Watch
// database 1.0 (built by scripts/build-dams.mjs).

import type { LngLat } from '../lib/geo';
import { distanceM } from '../lib/geo';

export interface Dam {
  name: string;
  lng: number;
  lat: number;
  heightM: number;
  /** Storage, m3. */
  volumeM3: number;
}

interface DamsFile {
  source: string;
  dams: Array<[number, number, string, number, number]>;
}

let loading: Promise<Dam[]> | null = null;

/** All dams; fetched once. An empty list when the file cannot be read. */
export function loadDams(): Promise<Dam[]> {
  loading ??= fetch('./data/infrastructure/dams.json')
    .then((response) => (response.ok ? (response.json() as Promise<DamsFile>) : Promise.reject(new Error(String(response.status)))))
    .then((file) => file.dams.map(([lng, lat, name, heightM, mcm]) => ({ lng, lat, name, heightM, volumeM3: mcm * 1e6 })))
    .catch((error: unknown) => {
      console.warn('dam data could not be read', error);
      return [];
    });
  return loading;
}

export interface NearbyDam {
  dam: Dam;
  rangeM: number;
  overpressurePsi: number;
}

/** Dams within a range of a point, nearest first. */
export function damsWithin(dams: readonly Dam[], at: LngLat, maxRangeM: number, overpressureAt: (rangeM: number) => number): NearbyDam[] {
  const out: NearbyDam[] = [];
  const degLat = maxRangeM / 111_320 + 0.01;
  for (const dam of dams) {
    if (Math.abs(dam.lat - at.lat) > degLat) continue;
    const rangeM = distanceM(at, dam);
    if (rangeM <= maxRangeM) out.push({ dam, rangeM, overpressurePsi: overpressureAt(rangeM) });
  }
  return out.sort((a, b) => a.rangeM - b.rangeM);
}
