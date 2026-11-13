// Water on the map: rings where the waves fall to 10, 3 and 1 m, the land they could
// flood, and the way the water would take from a dam that failed. The failed dam's water is
// drawn as a broad glow down the valley, a channel that narrows as the peak falls, a current
// of light streaks running downstream and foam where the dam was. The current moves at a
// pace chosen for the eye: it is not a speed of the flood (no simple public relation for
// that was found, ΕΡΩΤΗΣΕΙΣ #3).

import type { FeatureCollection } from 'geojson';
import type { GeoJSONSource, ImageSource, Map as MapLibreMap } from 'maplibre-gl';
import { ATTENUATION_LENGTH_M } from '@physics/water/dambreak';
import { t } from '../i18n';
import { formatFlow, formatHeight } from '../lib/format';
import { circleRing } from '../lib/geo';
import { damFlood } from '../state/dams';
import { prefersReducedMotion } from '../state/settings';
import { mode } from '../state/ui';
import { water } from '../state/water';
import { LABEL_FONT } from './style';

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };
const WAVE_HEIGHTS = [10, 3, 1] as const;
const WAVE_COLORS: Record<number, string> = { 10: '#1565c0', 3: '#1e88e5', 1: '#64b5f6' };
const FLOOD_SOURCE = 'aa-flood';
const FLOW_LAYER = 'aa-damflood-flow';
const FOAM_LAYER = 'aa-damflood-foam';
/**
 * Dash patterns that, shown one after another, move a streak along a line: the usual way
 * to animate a dashed line in MapLibre, whose dash offset cannot be set directly.
 */
const FLOW_STEPS: number[][] = [
  [0, 4, 3],
  [0.5, 4, 2.5],
  [1, 4, 2],
  [1.5, 4, 1.5],
  [2, 4, 1],
  [2.5, 4, 0.5],
  [3, 4, 0],
  [0, 0.5, 3, 3.5],
  [0, 1, 3, 3],
  [0, 1.5, 3, 2.5],
  [0, 2, 3, 2],
  [0, 2.5, 3, 1.5],
  [0, 3, 3, 1],
  [0, 3.5, 3, 0.5],
];
let flowFrame = 0;

/** Runs the current down the way of the water while it is shown, and stops it when it is not. */
function animateFlow(map: MapLibreMap, on: boolean): void {
  if (!on) {
    cancelAnimationFrame(flowFrame);
    flowFrame = 0;
    return;
  }
  if (flowFrame) return;
  let step = 0;
  let last = 0;
  const tick = (now: number): void => {
    flowFrame = requestAnimationFrame(tick);
    if (!map.getLayer(FLOW_LAYER)) return;
    if (now - last < 70) return;
    last = now;
    step = (step + 1) % FLOW_STEPS.length;
    map.setPaintProperty(FLOW_LAYER, 'line-dasharray', FLOW_STEPS[step]);
    // The foam swells and settles.
    const swell = 0.5 + 0.5 * Math.sin(now / 420);
    map.setPaintProperty(FOAM_LAYER, 'circle-radius', 8 + 6 * swell);
    map.setPaintProperty(FOAM_LAYER, 'circle-opacity', 0.55 + 0.35 * swell);
  };
  flowFrame = requestAnimationFrame(tick);
}
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
  // The valley under the water: a wide soft glow, widest near the dam.
  map.addLayer(
    {
      id: 'aa-damflood-glow',
      type: 'line',
      source: 'aa-damflood',
      filter: ['all', ['==', ['geometry-type'], 'LineString'], ['has', 'share']],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': theme === 'dark' ? '#2f8fe8' : '#4aa3f0',
        'line-width': ['interpolate', ['linear'], ['zoom'], 8, ['*', 10, ['get', 'share']], 12, ['+', 10, ['*', 34, ['get', 'share']]], 15, ['+', 24, ['*', 90, ['get', 'share']]]],
        'line-blur': ['interpolate', ['linear'], ['zoom'], 8, 6, 15, 30],
        'line-opacity': 0.35,
      },
    },
    below,
  );
  // The current: light streaks along the whole way, moved a step at a time (animateFlow).
  map.addLayer(
    {
      id: FLOW_LAYER,
      type: 'line',
      source: 'aa-damflood',
      filter: ['==', ['get', 'kind'], 'current'],
      layout: { 'line-cap': 'butt', 'line-join': 'round' },
      paint: { 'line-color': '#e3f2fd', 'line-width': 2.2, 'line-opacity': 0.85, 'line-dasharray': FLOW_STEPS[0]! },
    },
    below,
  );
  // Foam where the dam was.
  map.addLayer(
    {
      id: FOAM_LAYER,
      type: 'circle',
      source: 'aa-damflood',
      filter: ['==', ['get', 'kind'], 'breach'],
      paint: {
        'circle-color': '#f4fbff',
        'circle-radius': 10,
        'circle-blur': 0.8,
        'circle-opacity': 0.8,
        'circle-stroke-color': '#64b5f6',
        'circle-stroke-width': 2,
        'circle-stroke-opacity': 0.6,
      },
    },
    below,
  );
  map.addLayer(
    {
      id: 'aa-damflood-line',
      type: 'line',
      source: 'aa-damflood',
      filter: ['all', ['==', ['geometry-type'], 'LineString'], ['has', 'share']],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['interpolate', ['linear'], ['get', 'share'], 0, '#90caf9', 0.3, '#1e88e5', 1, '#0d47a1'],
        'line-width': ['interpolate', ['linear'], ['get', 'share'], 0, 2, 1, 9],
        'line-opacity': 0.9,
      },
    },
    below,
  );
  // The current and the foam over the channel.
  map.moveLayer(FLOW_LAYER, below);
  map.moveLayer(FOAM_LAYER, below);
  map.addLayer({
    id: 'aa-damflood-labels',
    type: 'symbol',
    source: 'aa-damflood',
    filter: ['all', ['==', ['geometry-type'], 'Point'], ['has', 'label']],
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
    animateFlow(map, false);
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
  // The whole way as one line for the current, so its streaks run on without a break.
  features.push({ type: 'Feature', properties: { kind: 'current' }, geometry: { type: 'LineString', coordinates: f.path.map((p) => [p.lng, p.lat]) } });
  features.push({ type: 'Feature', properties: { kind: 'breach' }, geometry: { type: 'Point', coordinates: [f.path[0]!.lng, f.path[0]!.lat] } });
  damSource.setData({ type: 'FeatureCollection', features });
  animateFlow(map, !prefersReducedMotion());
}
