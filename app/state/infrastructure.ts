// The infrastructure data once it has been read, and what of it the current detonation reaches.

import { computed, signal } from '@preact/signals';
import { affectedSites, loadSites, type AffectedSite, type Site } from '../data/infrastructure';
import { detonation } from './simulation';

export const sites = signal<Site[]>([]);

let started = false;
/** Reads the data the first time it is needed. */
export function ensureSites(): void {
  if (started) return;
  started = true;
  void loadSites().then((list) => (sites.value = list));
}

/** Sites inside the blast rings of the current detonation, nearest first. */
export const affected = computed<AffectedSite[]>(() => {
  const current = detonation.value;
  if (!current || sites.value.length === 0) return [];
  const furthest = current.result.rings.filter((ring) => ring.kind === 'blast').reduce((max, ring) => Math.max(max, ring.radiusM), 0);
  if (!(furthest > 0)) return [];
  return affectedSites(sites.value, current.at, furthest, (rangeM) => current.result.effects.overpressurePsi(rangeM));
});
