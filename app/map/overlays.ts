// What a detonation draws on the map: effect rings, the fallout pattern, and
// the colour of each 3D building by the damage zone it stands in.

import { damageBand } from '@physics/damage/levels';
import type { DetonationResult, EffectRing } from '@physics/detonation';
import type { Feature, FeatureCollection, LineString, Point, Polygon } from 'geojson';
import { circleRing, destination, fromWindFrame, unwrap, type LngLat } from '../lib/geo';
import { settings } from '../state/settings';

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

/**
 * The same colours, deeper, for the light map: the pale yellows and oranges of the dark
 * map vanish on a light background. Same hues in the same order.
 */
const EFFECT_COLORS_LIGHT: Record<string, string> = {
  fireball: '#e0a100',
  blast20: '#b0102a',
  blast5: '#d9480f',
  blast2: '#c77c02',
  blast1: '#a87a00',
  burn3: '#c55a00',
  burn2: '#dd7a0a',
  burn1: '#b7791f',
  radiation450: '#2b8a3e',
};

/** H+1 hour dose rates (R/h) drawn as fallout contours, strongest first. */
export const FALLOUT_LEVELS = [1000, 100, 10, 1] as const;
export const FALLOUT_COLORS: Record<number, string> = {
  1000: '#7a0403',
  100: '#cb2a04',
  10: '#f66b19',
  1: '#fbb938',
};
const FALLOUT_COLORS_LIGHT: Record<number, string> = {
  1000: '#5c0002',
  100: '#a51d02',
  10: '#d9480f',
  1: '#c98a00',
};

/** The colour of an effect for the current theme: on the map, in the legend and in the result list. */
export function effectColor(id: string): string {
  return (settings.value.theme === 'light' ? EFFECT_COLORS_LIGHT : EFFECT_COLORS)[id] ?? (settings.value.theme === 'light' ? '#1f2933' : '#ffffff');
}

/** The colour of a fallout contour for the current theme. */
export function falloutColor(level: number): string {
  return (settings.value.theme === 'light' ? FALLOUT_COLORS_LIGHT : FALLOUT_COLORS)[level] ?? '#888888';
}

/** What of a detonation is on screen at a moment of its playback. */
export interface PlaybackView {
  /** Ground range the blast front has reached, metres. */
  frontM: number;
  fireballM: number;
  /** Strength of the heat pulse now, 0 to 1. */
  heat: number;
  timeS: number;
}

/** The rings that are drawn at a moment of the playback: heat and radiation at once, blast rings as the front passes them. */
export function ringsAt(result: DetonationResult, view: PlaybackView | null): EffectRing[] {
  const all = result.rings.filter((r) => r.radiusM > 0);
  if (!view) return all;
  if (!(view.timeS > 0)) return [];
  return all.filter((ring) => (ring.kind === 'blast' ? ring.radiusM <= view.frontM : true));
}

export function ringFeatures(at: LngLat, result: DetonationResult, view: PlaybackView | null = null): FeatureCollection<Polygon> {
  const rings = ringsAt(result, view).sort((a, b) => b.radiusM - a.radiusM);
  const features: FeatureCollection<Polygon>['features'] = rings.map((ring) => {
    const radiusM = view && ring.kind === 'fireball' ? Math.max(view.fireballM, 1) : ring.radiusM;
    return {
      type: 'Feature',
      properties: {
        id: ring.id,
        kind: ring.kind,
        color: effectColor(ring.id),
        radius: radiusM,
        // While the heat pulse lasts the burn zones glow.
        glow: ring.kind === 'thermal' ? 0.06 + 0.3 * (view?.heat ?? 0) : 0.1,
      },
      geometry: { type: 'Polygon', coordinates: [circleRing(at, radiusM)] },
    };
  });
  // The front is shown until it has passed the weakest blast ring: beyond it the shock has
  // become a loud sound, and a ring hundreds of kilometres out would only mislead.
  const outerBlastM = result.rings.reduce((max, ring) => (ring.kind === 'blast' ? Math.max(max, ring.radiusM) : max), 0);
  if (view && view.frontM > 0 && view.frontM <= 1.15 * outerBlastM) {
    features.push({
      type: 'Feature',
      properties: { id: 'front', kind: 'front', color: '#ffffff', radius: view.frontM, glow: 0 },
      geometry: { type: 'Polygon', coordinates: [circleRing(at, view.frontM)] },
    });
  }
  return { type: 'FeatureCollection', features };
}

/**
 * A point on each ring where its label sits, spread over 140° so labels do not pile up.
 * With a wind, the labels go on the side away from where it carries the cloud, so the cloud's
 * track, its label and the drifting mushroom never cover them; without one, on the east side.
 * Each label reads outwards: `anchor` is 'left' (text to the east of its point) on the east
 * half and 'right' on the west half.
 */
export function ringLabelFeatures(
  at: LngLat,
  rings: EffectRing[],
  label: (ring: EffectRing) => string,
  windTowardsDeg?: number,
): FeatureCollection {
  const visible = rings.filter((r) => r.radiusM > 0).sort((a, b) => a.radiusM - b.radiusM);
  const centre = windTowardsDeg === undefined ? 90 : windTowardsDeg + 180;
  return {
    type: 'FeatureCollection',
    features: visible.map((ring, i) => {
      const bearing = (((centre - 70 + (i * 140) / Math.max(visible.length - 1, 1)) % 360) + 360) % 360;
      const p = destination(at, bearing, ring.radiusM);
      const anchor = Math.sin((bearing * Math.PI) / 180) >= -1e-9 ? 'left' : 'right';
      return {
        type: 'Feature',
        properties: { id: ring.id, label: label(ring), color: effectColor(ring.id), anchor },
        geometry: { type: 'Point', coordinates: [unwrap(p.lng, at.lng), p.lat] },
      };
    }),
  };
}

/**
 * Fallout contours as polygons, weakest (largest) first so stronger ones draw on top.
 * `reachM` cuts them off at a distance downwind: during playback, as far as the wind has
 * carried the cloud, the fallout under it has come down.
 */
export function falloutFeatures(at: LngLat, result: DetonationResult, reachM = Infinity): FeatureCollection<Polygon> {
  const model = result.fallout.model;
  const features: Array<Feature<Polygon>> = [];
  if (!model) return { type: 'FeatureCollection', features };
  const towards = result.fallout.wind.towardsDeg;

  for (const level of [...FALLOUT_LEVELS].reverse()) {
    const extent = model.contourExtentM(level);
    if (!extent) continue;
    const x0 = extent[0];
    const x1 = Math.min(extent[1], reachM);
    if (!(x1 > x0)) continue;
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
      properties: { level, color: falloutColor(level) },
      geometry: { type: 'Polygon', coordinates: [ring] },
    });
  }
  return { type: 'FeatureCollection', features };
}

/** How far downwind the weakest fallout contour reaches before it closes, metres, or null without local fallout. */
export function falloutReachM(result: DetonationResult): number | null {
  const model = result.fallout.model;
  if (!model) return null;
  let reach = 0;
  for (const level of FALLOUT_LEVELS) {
    const extent = model.contourExtentM(level);
    if (extent) reach = Math.max(reach, extent[1]);
  }
  return reach > 0 ? reach : null;
}

/**
 * The way the wind carries the cloud during playback: a solid line as far as it has gone,
 * a dashed one on to where it will be when the playback ends, an arrowhead where it is now,
 * and a label there. `headM` is the length of the arrowhead.
 */
export function cloudTrackFeatures(
  at: LngLat,
  towardsDeg: number,
  travelledM: number,
  totalM: number,
  headM: number,
  label: string,
): FeatureCollection<LineString | Polygon | Point> {
  const features: Array<Feature<LineString | Polygon | Point>> = [];
  if (!(totalM > 0)) return { type: 'FeatureCollection', features };
  const point = (x: number, y = 0): [number, number] => {
    const p = fromWindFrame(at, towardsDeg, x, y);
    return [unwrap(p.lng, at.lng), p.lat];
  };
  const line = (from: number, to: number): Array<[number, number]> => {
    const steps = 24;
    return Array.from({ length: steps + 1 }, (_, i) => point(from + ((to - from) * i) / steps));
  };
  const tip = Math.min(Math.max(travelledM, 0), totalM);
  if (tip < totalM) features.push({ type: 'Feature', properties: { part: 'ahead' }, geometry: { type: 'LineString', coordinates: line(tip, totalM) } });
  if (tip > 0) features.push({ type: 'Feature', properties: { part: 'done' }, geometry: { type: 'LineString', coordinates: line(0, tip) } });
  const head = [point(tip), point(tip - headM, 0.55 * headM), point(tip - 0.7 * headM), point(tip - headM, -0.55 * headM), point(tip)];
  features.push({ type: 'Feature', properties: { part: 'head' }, geometry: { type: 'Polygon', coordinates: [head] } });
  features.push({ type: 'Feature', properties: { part: 'label', label }, geometry: { type: 'Point', coordinates: point(tip) } });
  return { type: 'FeatureCollection', features };
}

/**
 * The band the radioactive cloud passes over in its first day (`result.fallout.path`), from
 * ground zero downwind, with rounded ends. `reachM` cuts it short: during playback, as far as
 * the wind has carried the cloud. Empty in calm air.
 */
export function cloudPathFeatures(at: LngLat, result: DetonationResult, reachM = Infinity): FeatureCollection<Polygon> {
  const { path, wind } = result.fallout;
  const lengthM = Math.min(path.firstDayM, Math.max(reachM, 0));
  if (!(wind.speedMs > 0.5) || !(lengthM > 1)) return { type: 'FeatureCollection', features: [] };
  const towards = wind.towardsDeg;
  const point = (x: number, y: number): [number, number] => {
    const p = fromWindFrame(at, towards, x, y);
    return [unwrap(p.lng, at.lng), p.lat];
  };
  // Closer steps near ground zero, where the band widens fastest.
  const steps = 48;
  const xs = Array.from({ length: steps + 1 }, (_, i) => lengthM * (i / steps) ** 1.6);
  const left = xs.map((x) => point(x, path.halfWidthM(x)));
  const right = xs.map((x) => point(x, -path.halfWidthM(x))).reverse();
  const cap = (x: number, from: number, to: number): Array<[number, number]> => {
    const r = path.halfWidthM(x);
    return Array.from({ length: 13 }, (_, i) => {
      const a = from + ((to - from) * i) / 12;
      return point(x + r * Math.cos(a), r * Math.sin(a));
    });
  };
  // Left side out, round the far end, right side back, round the end at ground zero.
  const ring = [...left, ...cap(lengthM, Math.PI / 2, -Math.PI / 2), ...right, ...cap(0, -Math.PI / 2, -1.5 * Math.PI)];
  ring.push(ring[0]!);
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { part: 'band' }, geometry: { type: 'Polygon', coordinates: [ring] } }] };
}

/** Bounding box [west, south, east, north] of everything a detonation draws, and of any extra points. */
export function resultBounds(at: LngLat, result: DetonationResult, includeFallout: boolean, extra: readonly LngLat[] = []): [number, number, number, number] {
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
  for (const p of extra) add(unwrap(p.lng, at.lng), p.lat);
  return [west, Math.max(south, -85), east, Math.min(north, 85)];
}

const BUILDING_BASE: Record<'dark' | 'light', string> = { dark: '#3a4047', light: '#d9d3c7' };

/** A ring-shaped zone of buildings with the same damage: between two blast rings. */
export interface BuildingBand {
  id: string;
  /** Which of the four zones this is, 0 (heaviest) to 3: the value of a building's "damage" state. */
  zone: number;
  innerM: number;
  outerM: number;
  /** Colour of the buildings once the blast has reached them. */
  color: string;
  /** Share of their height left standing, 0 to 1. */
  heightKept: number;
}

/** Colour of buildings the blast does not reach, or has not reached yet. */
export function buildingBaseColor(theme: 'dark' | 'light'): string {
  return BUILDING_BASE[theme];
}

/** The damage zones of a result, from ground zero outwards. Rings that do not reach the ground are left out. */
export function buildingBands(result: DetonationResult | null): BuildingBand[] {
  if (!result) return [];
  const rings: Array<[string, number, string]> = [
    ['blast20', 20, '#3b0a0a'], // destroyed
    ['blast5', 5, '#a4161a'], // most buildings collapse
    ['blast2', 2, '#e85d04'], // severe damage
    ['blast1', 1, '#ffba08'], // light damage, windows
  ];
  const bands: BuildingBand[] = [];
  let inner = 0;
  rings.forEach(([id, psi, color], zone) => {
    const outer = radius(result, id);
    if (!(outer > inner)) return;
    bands.push({ id, zone, innerM: inner, outerM: outer, color, heightKept: damageBand(psi).heightKept });
    inner = outer;
  });
  return bands;
}

function radius(result: DetonationResult, id: string): number {
  return result.rings.find((r) => r.id === id)?.radiusM ?? 0;
}

/** Colours of infrastructure marks on the map, by kind and fuel. */
export const SITE_COLORS: Record<string, string> = {
  large: '#7cc4ff',
  medium: '#7cc4ff',
  nuclear: '#c77dff',
  hydro: '#4dd0e1',
  coal: '#9aa0a6',
  gas: '#ffb74d',
  oil: '#b08968',
  other: '#bdbdbd',
  dam: '#2f80ed',
};

/** Airports and power stations as points for the map. */
export function siteFeatures(
  sites: ReadonlyArray<{ kind: string; detail: string; name: string; lng: number; lat: number; major?: boolean }>,
): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: sites.map((site) => ({
      type: 'Feature',
      properties: { kind: site.kind, detail: site.detail, name: site.name, color: SITE_COLORS[site.detail] ?? '#bdbdbd', major: site.major ?? (site.detail === 'large' || site.detail === 'nuclear') },
      geometry: { type: 'Point', coordinates: [site.lng, site.lat] },
    })),
  };
}

/** Dose levels drawn as plume outlines: projected effective dose in the first year, Sv, strongest first. */
export const PLUME_LEVELS_SV = [1, 0.1, 0.02, 0.001] as const;
export const PLUME_COLORS: Record<number, string> = { 1: '#7a0403', 0.1: '#d7263d', 0.02: '#f5a524', 0.001: '#57cc99' };
/** Dashed outline of the area in which iodine thyroid blocking would be warranted. */
export const IODINE_COLOR = '#9b5de5';

/**
 * The area in which a dose is at or above each level, as polygons along the wind.
 * `halfWidth` gives the half-width of the area at a distance downwind for a level (0 where
 * the level is not reached); `reach` the furthest distance for a level.
 */
export function plumeFeatures(
  at: LngLat,
  towardsDeg: number,
  levels: readonly number[],
  reach: (level: number) => number,
  halfWidth: (level: number, downwindM: number) => number,
): FeatureCollection<Polygon> {
  const features: FeatureCollection<Polygon>['features'] = [];
  // Weakest (largest) first, so stronger areas are drawn on top.
  for (const level of [...levels].sort((a, b) => a - b)) {
    const furthest = reach(level);
    if (!(furthest > 0)) continue;
    const steps = 48;
    const left: Array<[number, number]> = [];
    const right: Array<[number, number]> = [];
    for (let i = 0; i <= steps; i++) {
      // Closer steps near the source, where the outline changes fastest.
      const x = furthest * Math.pow(i / steps, 2);
      const w = i === steps ? 0 : halfWidth(level, Math.max(x, 50));
      const a = fromWindFrame(at, towardsDeg, x, w);
      const b = fromWindFrame(at, towardsDeg, x, -w);
      left.push([unwrap(a.lng, at.lng), a.lat]);
      right.push([unwrap(b.lng, at.lng), b.lat]);
    }
    const ring = [...left, ...right.reverse()];
    ring.push(ring[0]!);
    features.push({
      type: 'Feature',
      properties: { level, color: PLUME_COLORS[level] ?? '#ffffff' },
      geometry: { type: 'Polygon', coordinates: [ring] },
    });
  }
  return { type: 'FeatureCollection', features };
}
