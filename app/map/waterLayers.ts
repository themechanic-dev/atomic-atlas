// Water on the map: rings where the waves fall to 10, 3 and 1 m, the land they could
// flood, and the way the water would take from a dam that failed.

import type { FeatureCollection } from 'geojson';
import type { GeoJSONSource, ImageSource, Map as MapLibreMap } from 'maplibre-gl';
import { ATTENUATION_LENGTH_M } from '@physics/water/dambreak';
import { t } from '../i18n';
import { formatFlow, formatHeight } from '../lib/format';
import { circleRing } from '../lib/geo';
import { damFlood } from '../state/dams';
import { mode } from '../state/ui';
import { water } from '../state/water';
import { LABEL_FONT } from './style';

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };
const WAVE_HEIGHTS = [10, 3, 1] as const;
const WAVE_COLORS: Record<number, string> = { 10: '#1565c0', 3: '#1e88e5', 1: '#64b5f6' };
const FLOOD_SOURCE = 'aa-flood';
const FLOOD_LAYER = 'aa-flood-image';

let floodImage: string | null = null;

export function addWaterLayers(map: MapLibreMap, theme: string, below: string | undefined): void {
  map.addSource('aa-waves', { type: 'geojson', data: EMPTY });
  map.addLayer({
    id: 'aa-waves-line',
    type: 'line',
    source: 'aa-waves',
    paint: { 'line-color': ['get', 'color'], 'line-width': 2, 'line-dasharray': [4, 2] },
  });
  map.addLayer({
    id: 'aa-waves-labels',
    type: 'symbol',
    source: 'aa-waves',
    layout: {
      'symbol-placement': 'line',
      'symbol-spacing': 320,
      'text-field': ['get', 'label'],
      'text-font': LABEL_FONT,
      'text-size': 12,
    },
    paint: {
      'text-color': theme === 'dark' ? '#cfe6ff' : '#0d3c75',
      'text-halo-color': theme === 'dark' ? '#101214' : '#ffffff',
      'text-halo-width': 1.6,
    },
  });
  map.addSource('aa-damflood', { type: 'geojson', data: EMPTY });
  map.addLayer(
    {
      id: 'aa-damflood-line',
      type: 'line',
      source: 'aa-damflood',
      filter: ['==', ['geometry-type'], 'LineString'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['interpolate', ['linear'], ['get', 'share'], 0, '#90caf9', 0.3, '#1e88e5', 1, '#0d47a1'],
        'line-width': ['interpolate', ['linear'], ['get', 'share'], 0, 2, 1, 9],
        'line-opacity': 0.9,
      },
    },
    below,
  );
  map.addLayer({
    id: 'aa-damflood-labels',
    type: 'symbol',
    source: 'aa-damflood',
    filter: ['==', ['geometry-type'], 'Point'],
    layout: {
      'text-field': ['get', 'label'],
      'text-font': LABEL_FONT,
      'text-size': 12,
      'text-anchor': 'left',
      'text-offset': [0.8, 0],
    },
    paint: {
      'text-color': theme === 'dark' ? '#cfe6ff' : '#0d3c75',
      'text-halo-color': theme === 'dark' ? '#101214' : '#ffffff',
      'text-halo-width': 1.6,
    },
  });
  floodImage = null;
}

export function applyWater(map: MapLibreMap): void {
  const waves = map.getSource('aa-waves') as GeoJSONSource | undefined;
  if (!waves) return;
  const shown = mode.value === 'detonation';
  const w = water.value;

  // Wave rings: only for a burst in the water.
  if (shown && w?.state === 'ready' && w.inWater && w.summary && w.conditions) {
    const ranges: Record<number, number> = { 10: w.summary.rangeTo10mM, 3: w.summary.rangeTo3mM, 1: w.summary.rangeTo1mM };
    waves.setData({
      type: 'FeatureCollection',
      features: WAVE_HEIGHTS.filter((h) => ranges[h]! > 0).map((h) => ({
        type: 'Feature',
        properties: { color: WAVE_COLORS[h], label: t('water.ring', { height: formatHeight(h) }) },
        geometry: { type: 'LineString', coordinates: circleRing(w.at, ranges[h]!, 180) },
      })),
    });
  } else {
    waves.setData(EMPTY);
  }

  // The flooded land, as an image over the area searched.
  const flood = shown && w?.floodState === 'ready' && w.flood && w.flood.nearestM !== null ? w.flood : null;
  if (flood?.image !== floodImage) {
    if (map.getLayer(FLOOD_LAYER)) map.removeLayer(FLOOD_LAYER);
    if (map.getSource(FLOOD_SOURCE)) map.removeSource(FLOOD_SOURCE);
    floodImage = null;
    if (flood) {
      map.addSource(FLOOD_SOURCE, { type: 'image', url: flood.image, coordinates: flood.corners });
      map.addLayer({ id: FLOOD_LAYER, type: 'raster', source: FLOOD_SOURCE, paint: { 'raster-opacity': 0.85, 'raster-resampling': 'linear', 'raster-fade-duration': 0 } }, 'aa-waves-line');
      floodImage = flood.image;
    }
  } else if (flood && map.getSource(FLOOD_SOURCE)) {
    (map.getSource(FLOOD_SOURCE) as ImageSource).setCoordinates(flood.corners);
  }

  // The way of the water from a failed dam, thinner as the peak falls.
  const damSource = map.getSource('aa-damflood') as GeoJSONSource | undefined;
  const f = damFlood.value;
  if (!damSource) return;
  if (!shown || !f || f.path.length < 2) {
    damSource.setData(EMPTY);
    return;
  }
  const features: FeatureCollection['features'] = [];
  for (let i = 1; i < f.path.length; i++) {
    const a = f.path[i - 1]!;
    const b = f.path[i]!;
    features.push({
      type: 'Feature',
      properties: { share: Math.exp(-f.along[i]! / ATTENUATION_LENGTH_M) },
      geometry: { type: 'LineString', coordinates: [[a.lng, a.lat], [b.lng, b.lat]] },
    });
  }
  // Labels with the peak flow every 5 km.
  let nextMark = 5000;
  for (let i = 1; i < f.path.length; i++) {
    if (f.along[i]! < nextMark) continue;
    const p = f.path[i]!;
    features.push({
      type: 'Feature',
      properties: { label: formatFlow(f.peakM3s * Math.exp(-f.along[i]! / ATTENUATION_LENGTH_M)) },
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
    });
    nextMark += 5000;
  }
  damSource.setData({ type: 'FeatureCollection', features });
}
