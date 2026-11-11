// Damage shown on the 3D buildings of the map.
//
// The map's own tiles hold the buildings of an area merged into a few large shapes (one per
// height), so the map cannot colour or lower them one by one. While a detonation is shown,
// the single buildings are therefore taken out of those shapes here, each is given its
// distance from ground zero, and they are drawn in a layer of our own. A building shows its
// damage through a "damage" state, which the map can change at once: during playback each
// building changes at the moment the blast front reaches it.

import type { Feature, FeatureCollection, Polygon } from 'geojson';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import { damageBand } from '@physics/damage/levels';
import { distanceM, type LngLat } from '../lib/geo';
import { platform } from '../lib/platform';
import type { BuildingBand } from './overlays';

const TILES = 'openmaptiles';
const TILES_LAYER = 'building';
export const DAMAGE_SOURCE = 'aa-buildings';
export const DAMAGE_LAYER = 'aa-buildings-3d';
/** Name of the state on each building: the number of its damage zone, 0 (heaviest) to 3. */
const STATE = 'damage';
/** No more single buildings than this are drawn; a phone holds fewer than a desktop. The nearest to ground zero are kept. */
const MOST_BUILDINGS = platform() === 'android' ? 25_000 : 90_000;

const BASE: Record<'dark' | 'light', string> = { dark: '#3a4047', light: '#d9d3c7' };
/** Colours of the four damage zones, from ground zero outwards, and the pressure each stands for. */
const ZONE_COLORS = ['#3b0a0a', '#a4161a', '#e85d04', '#ffba08'] as const;
const ZONE_PSI = [20, 5, 2, 1] as const;

interface Building {
  id: number;
  rangeM: number;
  /** Damage zone, or -1 outside every zone. */
  zone: number;
  /** What the map has been told: the zone, or -1 for "standing". */
  shown: number;
}

/** Colour and height of our buildings, read from each one's damage state. */
function paint(theme: 'dark' | 'light'): Record<string, unknown> {
  const zone = ['coalesce', ['feature-state', STATE], -1];
  const color: unknown[] = ['match', zone];
  const kept: unknown[] = ['match', zone];
  ZONE_COLORS.forEach((value, i) => {
    color.push(i, value);
    kept.push(i, damageBand(ZONE_PSI[i]!).heightKept);
  });
  color.push(BASE[theme]);
  kept.push(1);
  return {
    'fill-extrusion-color': color,
    'fill-extrusion-height': ['max', ['*', ['get', 'h'], kept], ['get', 'b']],
    'fill-extrusion-base': ['get', 'b'],
    'fill-extrusion-opacity': 0.92,
  };
}

/** Zone of a distance from ground zero, or -1 outside every zone. */
export function zoneAt(bands: readonly BuildingBand[], rangeM: number): number {
  for (const band of bands) if (rangeM >= band.innerM && rangeM < band.outerM) return band.zone;
  return -1;
}

export function createBuildingDamage(map: MapLibreMap) {
  let at: LngLat | null = null;
  let bands: BuildingBand[] = [];
  /** Where the blast front is during playback; null for the finished picture. */
  let frontM: number | null = null;
  let buildings: Building[] = [];
  let features: Array<Feature<Polygon>> = [];
  const seen = new Set<string>();
  let nextId = 1;

  const empty: FeatureCollection = { type: 'FeatureCollection', features: [] };
  const source = (): GeoJSONSource | undefined => map.getSource(DAMAGE_SOURCE) as GeoJSONSource | undefined;

  /** Adds our source and layer to a freshly loaded style, under the given layer. */
  function addTo(theme: 'dark' | 'light', before: string | undefined): void {
    if (!map.getSource(TILES) || map.getSource(DAMAGE_SOURCE)) return;
    map.addSource(DAMAGE_SOURCE, { type: 'geojson', data: empty, maxzoom: 15, buffer: 32, tolerance: 0.2 });
    map.addLayer({ id: DAMAGE_LAYER, type: 'fill-extrusion', source: DAMAGE_SOURCE, minzoom: 14, paint: paint(theme) as never }, before);
    // A new style starts empty: give it what has been collected so far.
    for (const building of buildings) building.shown = -1;
    source()?.setData({ type: 'FeatureCollection', features });
    applyFront();
  }

  /** Tells the map which buildings show their damage, for where the blast front is now. */
  function applyFront(): void {
    if (!map.getSource(DAMAGE_SOURCE)) return;
    const reach = frontM ?? Number.POSITIVE_INFINITY;
    for (const building of buildings) {
      const want = building.zone >= 0 && building.rangeM <= reach ? building.zone : -1;
      if (want === building.shown) continue;
      building.shown = want;
      map.setFeatureState({ source: DAMAGE_SOURCE, id: building.id }, { [STATE]: want });
    }
  }

  // New tiles may bring new buildings; nothing else does.
  let newTiles = true;
  map.on('sourcedata', (event) => {
    if (event.sourceId === TILES) newTiles = true;
  });

  /** Takes the single buildings out of the tiles the map has loaded. Buildings already taken are left alone. */
  function collect(): void {
    if (!at || !map.getSource(TILES) || !map.getSource(DAMAGE_SOURCE) || map.getZoom() < 13.9) return;
    if (!newTiles) return;
    newTiles = false;

    const limitM = (bands.length > 0 ? bands[bands.length - 1]!.outerM : 0) * 1.12 + 150;
    let added = false;
    for (const feature of map.querySourceFeatures(TILES, { sourceLayer: TILES_LAYER })) {
      if (feature.properties?.hide_3d === true) continue;
      const geometry = feature.geometry;
      const polygons: number[][][][] =
        geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
      const height = Number(feature.properties?.render_height ?? 6);
      const floor = Number(feature.properties?.render_min_height ?? 0);
      for (const polygon of polygons) {
        const outline = polygon[0];
        if (!outline || outline.length < 4) continue;
        let west = Infinity;
        let east = -Infinity;
        let south = Infinity;
        let north = -Infinity;
        for (const point of outline) {
          if (point[0]! < west) west = point[0]!;
          if (point[0]! > east) east = point[0]!;
          if (point[1]! < south) south = point[1]!;
          if (point[1]! > north) north = point[1]!;
        }
        const middle = { lng: (west + east) / 2, lat: (south + north) / 2 };
        // The same building comes with every tile that touches it, and again from tiles of
        // other detail with slightly different outlines: one building per ten-metre square
        // and height.
        const key = `${middle.lng.toFixed(4)},${middle.lat.toFixed(4)},${height}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const rangeM = distanceM(at, middle);
        // Only the buildings in and just around the damage zones are drawn in 3D.
        if (rangeM > limitM) continue;
        const id = nextId++;
        buildings.push({ id, rangeM, zone: zoneAt(bands, rangeM), shown: -1 });
        features.push({ type: 'Feature', id, properties: { h: height, b: floor }, geometry: { type: 'Polygon', coordinates: polygon } });
        added = true;
      }
    }
    if (!added) return;
    if (buildings.length > MOST_BUILDINGS) {
      // Too many: the furthest are let go. (They stay known, so they are not taken again.)
      const order = buildings.map((building, index) => index).sort((a, b) => buildings[a]!.rangeM - buildings[b]!.rangeM).slice(0, MOST_BUILDINGS);
      buildings = order.map((index) => buildings[index]!);
      features = order.map((index) => features[index]!);
    }
    source()?.setData({ type: 'FeatureCollection', features });
    applyFront();
  }

  /** A new result (or none): every building starts again. */
  function setResult(groundZero: LngLat | null, next: BuildingBand[]): void {
    at = groundZero;
    bands = next;
    buildings = [];
    features = [];
    seen.clear();
    newTiles = true;
    if (map.getSource(DAMAGE_SOURCE)) {
      map.removeFeatureState({ source: DAMAGE_SOURCE });
      source()?.setData(empty);
    }
    collect();
  }

  let frontAppliedAt = 0;

  /**
   * Moves the blast front (playback) or shows the finished picture (null). During playback
   * the buildings follow a few times a second: each change makes the map repaint the tiles
   * it touches.
   */
  function setFront(next: number | null, exact = false): void {
    if (next === frontM) return;
    const now = performance.now();
    if (!exact && next !== null && frontM !== null && next > frontM && now - frontAppliedAt < 220) return;
    frontAppliedAt = now;
    frontM = next;
    applyFront();
  }

  return { addTo, setResult, setFront, collect, active: (): boolean => at !== null };
}
