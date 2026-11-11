// What a detonation draws on the map: effect rings, the fallout pattern, and
// the colour of each 3D building by the damage zone it stands in.

import type { DetonationResult, EffectRing } from '@physics/detonation';
import type { Feature, FeatureCollection, Polygon } from 'geojson';
import { circleRing, destination, fromWindFrame, unwrap, type LngLat } from '../lib/geo';

/** Colours of the effects; the same in the legend, the result list and on the map. */
export const EFFECT_COLORS: Record<string, string> = {
  fireball: '#fff3b0',
  blast20: '#d7263d',
  blast5: '#f46036',
  blast2: '#f5a524',
  blast1: '#ffd166',
  burn3: '#ff7b00',
  burn2: '#ffa94d',
  burn1: '#ffd8a8',
  radiation450: '#57cc99',
};

/** H+1 hour dose rates (R/h) drawn as fallout contours, strongest first. */
export const FALLOUT_LEVELS = [1000, 100, 10, 1] as const;
export const FALLOUT_COLORS: Record<number, string> = {
  1000: '#7a0403',
  100: '#cb2a04',
  10: '#f66b19',
  1: '#fbb938',
};

export function ringFeatures(at: LngLat, result: DetonationResult): FeatureCollection<Polygon> {
  const rings = result.rings.filter((r) => r.radiusM > 0).sort((a, b) => b.radiusM - a.radiusM);
  return {
    type: 'FeatureCollection',
    features: rings.map((ring) => ({
      type: 'Feature',
      properties: { id: ring.id, kind: ring.kind, color: EFFECT_COLORS[ring.id] ?? '#ffffff', radius: ring.radiusM },
      geometry: { type: 'Polygon', coordinates: [circleRing(at, ring.radiusM)] },
    })),
  };
}

/** A point on each ring where its label sits: spread around the north-east so labels do not pile up. */
export function ringLabelFeatures(at: LngLat, rings: EffectRing[], label: (ring: EffectRing) => string): FeatureCollection {
  const visible = rings.filter((r) => r.radiusM > 0).sort((a, b) => a.radiusM - b.radiusM);
  return {
    type: 'FeatureCollection',
    features: visible.map((ring, i) => {
      const bearing = 20 + (i * 140) / Math.max(visible.length - 1, 1);
      const p = destination(at, bearing, ring.radiusM);
      return {
        type: 'Feature',
        properties: { id: ring.id, label: label(ring), color: EFFECT_COLORS[ring.id] ?? '#ffffff' },
        geometry: { type: 'Point', coordinates: [unwrap(p.lng, at.lng), p.lat] },
      };
    }),
  };
}

/** Fallout contours as polygons, weakest (largest) first so stronger ones draw on top. */
export function falloutFeatures(at: LngLat, result: DetonationResult): FeatureCollection<Polygon> {
  const model = result.fallout.model;
  const features: Array<Feature<Polygon>> = [];
  if (!model) return { type: 'FeatureCollection', features };
  const towards = result.fallout.wind.towardsDeg;

  for (const level of [...FALLOUT_LEVELS].reverse()) {
    const extent = model.contourExtentM(level);
    if (!extent) continue;
    const [x0, x1] = extent;
    const steps = 160;
    const left: Array<[number, number]> = [];
    const right: Array<[number, number]> = [];
    for (let i = 0; i <= steps; i++) {
      // Closer spacing near ground zero, where the contour bends fastest.
      const u = i / steps;
      const x = x0 + (x1 - x0) * u * u;
      const half = model.contourHalfWidthM(x, level);
      const a = fromWindFrame(at, towards, x, half);
      const b = fromWindFrame(at, towards, x, -half);
      left.push([unwrap(a.lng, at.lng), a.lat]);
      right.push([unwrap(b.lng, at.lng), b.lat]);
    }
    const ring = [...left, ...right.reverse()];
    ring.push(ring[0]!);
    features.push({
      type: 'Feature',
      properties: { level, color: FALLOUT_COLORS[level] },
      geometry: { type: 'Polygon', coordinates: [ring] },
    });
  }
  return { type: 'FeatureCollection', features };
}

/** Bounding box [west, south, east, north] of everything a detonation draws. */
export function resultBounds(at: LngLat, result: DetonationResult, includeFallout: boolean): [number, number, number, number] {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  const add = (lng: number, lat: number): void => {
    west = Math.min(west, lng);
    east = Math.max(east, lng);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  };
  const reach = Math.max(result.maxRadiusM, 200);
  for (const bearing of [0, 90, 180, 270]) {
    const p = destination(at, bearing, reach);
    add(unwrap(p.lng, at.lng), p.lat);
  }
  if (includeFallout) {
    for (const feature of falloutFeatures(at, result).features) {
      for (const [lng, lat] of feature.geometry.coordinates[0]!) add(lng!, lat!);
    }
  }
  return [west, Math.max(south, -85), east, Math.min(north, 85)];
}

const BUILDING_BASE: Record<'dark' | 'light', string> = { dark: '#3a4047', light: '#d9d3c7' };

/**
 * Colour of 3D buildings by distance from ground zero: each blast ring recolours the buildings inside it.
 * Returns a MapLibre expression for `fill-extrusion-color`.
 */
export function buildingColorExpression(at: LngLat | null, result: DetonationResult | null, theme: 'dark' | 'light'): unknown {
  const base = BUILDING_BASE[theme];
  if (!at || !result) return base;
  const stops: Array<[number, string]> = [
    [radius(result, 'blast20'), '#3b0a0a'], // destroyed
    [radius(result, 'blast5'), '#a4161a'], // most buildings collapse
    [radius(result, 'blast2'), '#e85d04'], // severe damage
    [radius(result, 'blast1'), '#ffba08'], // light damage, windows
  ];
  const usable = stops.filter(([r]) => r > 0);
  if (usable.length === 0) return base;
  const expression: unknown[] = ['step', ['distance', { type: 'Point', coordinates: [at.lng, at.lat] }], usable[0]![1]];
  for (let i = 0; i < usable.length; i++) {
    expression.push(usable[i]![0], i + 1 < usable.length ? usable[i + 1]![1] : base);
  }
  return expression;
}

function radius(result: DetonationResult, id: string): number {
  return result.rings.find((r) => r.id === id)?.radiusM ?? 0;
}
