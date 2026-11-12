// The list of offline areas the user has downloaded, kept in the browser's storage.
// Separate from the map code, so the population grid can read it too.

import type { Bounds } from './tiles';

const AREAS_KEY = 'atomic-atlas.offline-areas.v1';

export interface OfflineArea {
  id: string;
  /** West, south, east, north. */
  bounds: Bounds;
  tiles: number;
  bytes: number;
  date: string;
  /** Map tiles the server did not give whole, even when asked again; the area has holes there. */
  missing?: number;
  /** The 100 m population grid kept for the area, when it could be downloaded. */
  population?: { people: number; bytes: number };
}

export function offlineAreas(): OfflineArea[] {
  try {
    const list = JSON.parse(localStorage.getItem(AREAS_KEY) ?? '[]') as OfflineArea[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveAreas(list: OfflineArea[]): void {
  try {
    localStorage.setItem(AREAS_KEY, JSON.stringify(list));
  } catch {
    // Storage unavailable: the tiles are stored; only the list is lost.
  }
}
