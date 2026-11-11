// Infrastructure shown on the map: airports and power stations, from open datasets that
// ship with the app (built by scripts/build-infrastructure.mjs).

import { infrastructureFinding, infrastructureThresholdPsi, type InfrastructureFinding, type InfrastructureKind } from '@physics/damage/infrastructure';
import { distanceM, type LngLat } from '../lib/geo';

export type Fuel = 'nuclear' | 'hydro' | 'coal' | 'gas' | 'oil' | 'other';

export interface Site {
  kind: InfrastructureKind;
  /** For airports `large` or `medium`; for power stations the fuel. */
  detail: 'large' | 'medium' | Fuel;
  name: string;
  lng: number;
  lat: number;
}

interface SitesFile {
  sources: { airports: string; power: string };
  fuels: Fuel[];
  airports: Array<[number, number, string, number]>;
  power: Array<[number, number, string, number]>;
}

let loading: Promise<Site[]> | null = null;

/** All sites; fetched once. An empty list when the file cannot be read. */
export function loadSites(): Promise<Site[]> {
  loading ??= fetch('./data/infrastructure/sites.json')
    .then((response) => (response.ok ? (response.json() as Promise<SitesFile>) : Promise.reject(new Error(String(response.status)))))
    .then((file) => parseSites(file))
    .catch((error: unknown) => {
      console.warn('infrastructure data could not be read', error);
      return [];
    });
  return loading;
}

export function parseSites(file: SitesFile): Site[] {
  const sites: Site[] = [];
  for (const [lng, lat, name, large] of file.airports) sites.push({ kind: 'airport', detail: large ? 'large' : 'medium', name, lng, lat });
  for (const [lng, lat, name, fuel] of file.power) sites.push({ kind: 'power', detail: file.fuels[fuel] ?? 'other', name, lng, lat });
  return sites;
}

export interface AffectedSite {
  site: Site;
  rangeM: number;
  overpressurePsi: number;
  finding: InfrastructureFinding;
}

/**
 * The sites that a detonation reaches with at least the weakest blast the source reports
 * anything for, nearest first. `overpressureAt` gives the peak overpressure at a ground range.
 */
export function affectedSites(
  sites: readonly Site[],
  at: LngLat,
  maxRangeM: number,
  overpressureAt: (rangeM: number) => number,
): AffectedSite[] {
  // A quick box test before the exact distance.
  const dLat = (maxRangeM / 111_000) * 1.05;
  const dLng = dLat / Math.max(0.05, Math.cos((at.lat * Math.PI) / 180));
  const out: AffectedSite[] = [];
  for (const site of sites) {
    if (Math.abs(site.lat - at.lat) > dLat) continue;
    let d = Math.abs(site.lng - at.lng);
    if (d > 180) d = 360 - d;
    if (d > dLng) continue;
    const rangeM = distanceM(at, site);
    if (rangeM > maxRangeM) continue;
    const overpressurePsi = overpressureAt(rangeM);
    if (overpressurePsi < infrastructureThresholdPsi(site.kind)) continue;
    out.push({ site, rangeM, overpressurePsi, finding: infrastructureFinding(site.kind, overpressurePsi) });
  }
  return out.sort((a, b) => a.rangeM - b.rangeM);
}
